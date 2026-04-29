(function () {
  const fs = require("fs");
  const path = require("path");
  const http = require("http");
  const https = require("https");

  const STORE_KEY = "openlist-config-v1";

  const defaults = {
    serverUrl: "",
    authMode: "token",
    token: "",
    username: "",
    pathPresets: [{ name: "根目录", path: "/" }]
  };

  let lastEnterAction = null;
  const enterListeners = new Set();

  function getConfig() {
    const saved = utools.dbStorage.getItem(STORE_KEY) || {};
    return normalizeConfig({ ...defaults, ...saved });
  }

  function saveConfig(input) {
    const config = normalizeConfig({ ...getConfig(), ...input });
    utools.dbStorage.setItem(STORE_KEY, JSON.parse(JSON.stringify(config)));
    return config;
  }

  function normalizeConfig(config) {
    const pathPresets = Array.isArray(config.pathPresets) && config.pathPresets.length
      ? config.pathPresets
      : defaults.pathPresets;

    return {
      serverUrl: normalizeServerUrl(config.serverUrl),
      authMode: config.authMode === "password" ? "password" : "token",
      token: String(config.token || "").trim(),
      username: String(config.username || "").trim(),
      connectionStatus: config.connectionStatus === "online" || config.connectionStatus === "error" ? config.connectionStatus : "unknown",
      pathPresets: pathPresets
        .map((preset) => ({
          name: String(preset.name || preset.path || "未命名").trim(),
          path: normalizeRemotePath(preset.path || "/")
        }))
        .filter((preset) => preset.name && preset.path)
    };
  }

  function normalizeServerUrl(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function normalizeRemotePath(value) {
    const raw = String(value || "/").trim().replace(/\\/g, "/");
    const prefixed = raw.startsWith("/") ? raw : `/${raw}`;
    return prefixed.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  }

  function joinRemotePath(dir, fileName) {
    const base = normalizeRemotePath(dir);
    const cleanName = String(fileName || "").replace(/^\/+/, "");
    return base === "/" ? `/${cleanName}` : `${base}/${cleanName}`;
  }

  function ensureConfigured(config = getConfig()) {
    if (!config.serverUrl) {
      throw new Error("请先配置 OpenList 服务器地址。");
    }
    if (!config.token) {
      throw new Error("请先配置 Token，或使用账号密码登录换取 Token。");
    }
    return config;
  }

  function buildUrl(serverUrl, apiPath) {
    const base = normalizeServerUrl(serverUrl);
    if (!base) throw new Error("服务器地址不能为空。");
    return new URL(apiPath, `${base}/`);
  }

  function toRequestOptions(url, options = {}) {
    return {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: options.method || "GET",
      headers: options.headers || {}
    };
  }

  function requestJson(config, apiPath, options = {}) {
    const url = buildUrl(config.serverUrl, apiPath);
    const body = options.body === undefined ? null : JSON.stringify(options.body);
    const headers = {
      "Content-Type": "application/json;charset=utf-8",
      ...(config.token ? { Authorization: config.token } : {}),
      ...(options.headers || {})
    };

    return rawRequest(url, {
      method: options.method || "POST",
      headers,
      body
    }).then((response) => parseOpenListResponse(response, apiPath));
  }

  function rawRequest(url, options) {
    return new Promise((resolve, reject) => {
      const transport = url.protocol === "https:" ? https : http;
      const request = transport.request(
        toRequestOptions(url, options),
        (response) => {
          const chunks = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            if (response.statusCode < 200 || response.statusCode >= 300) {
              reject(new Error(`HTTP ${response.statusCode}: ${text || response.statusMessage}`));
              return;
            }
            resolve({ text, statusCode: response.statusCode });
          });
        }
      );

      request.on("error", reject);
      request.setTimeout(60000, () => request.destroy(new Error("请求超时。")));

      if (options.body) {
        request.write(options.body);
      }
      request.end();
    });
  }

  function parseOpenListResponse(response, apiPath) {
    if (!response.text) return {};
    let json;
    try {
      json = JSON.parse(response.text);
    } catch (error) {
      throw new Error(`${apiPath} 返回了非 JSON 响应。`);
    }

    if (typeof json.code === "number" && json.code !== 200) {
      throw new Error(json.message || json.msg || `OpenList API 返回 code=${json.code}`);
    }
    return json.data === undefined ? json : json.data;
  }

  async function login(serverUrl, username, password) {
    if (!serverUrl || !username || !password) {
      throw new Error("服务器地址、用户名和密码不能为空。");
    }
    const data = await requestJson(
      { serverUrl, token: "" },
      "/api/auth/login",
      {
        body: {
          username,
          password
        }
      }
    );
    const token = data.token || data.access_token;
    if (!token) {
      throw new Error("登录成功但响应中没有 token。");
    }
    return { token };
  }

  async function testConnection(input) {
    const config = normalizeConfig({ ...getConfig(), ...input });
    ensureConfigured(config);
    await list("/", config);
    return true;
  }

  async function list(remotePath = "/", overrideConfig) {
    const config = ensureConfigured(overrideConfig || getConfig());
    return requestJson(config, "/api/fs/list", {
      body: {
        path: normalizeRemotePath(remotePath),
        password: "",
        page: 1,
        per_page: 0,
        refresh: false
      }
    });
  }

  async function mkdir(remotePath) {
    const config = ensureConfigured();
    return requestJson(config, "/api/fs/mkdir", {
      body: { path: normalizeRemotePath(remotePath) }
    });
  }

  async function remove(dir, names) {
    const config = ensureConfigured();
    const normalizedDir = normalizeRemotePath(dir);
    try {
      return await requestJson(config, "/api/fs/remove", {
        body: {
          dir: normalizedDir,
          names
        }
      });
    } catch (error) {
      return requestJson(config, "/api/fs/remove", {
        body: {
          path: normalizedDir,
          names
        }
      });
    }
  }

  async function rename(remotePath, name) {
    const config = ensureConfigured();
    const normalizedPath = normalizeRemotePath(remotePath);
    try {
      return await requestJson(config, "/api/fs/rename", {
        body: {
          path: normalizedPath,
          name
        }
      });
    } catch (error) {
      const dir = path.posix.dirname(normalizedPath) || "/";
      const oldName = path.posix.basename(normalizedPath);
      try {
        return await requestJson(config, "/api/fs/batch_rename", {
          body: {
            src_dir: dir,
            rename_objects: [{ src_name: oldName, new_name: name }]
          }
        });
      } catch (batchError) {
        return requestJson(config, "/api/fs/batch_rename", {
          body: {
            src_dir: dir,
            rename_objects: [{ old_name: oldName, new_name: name }]
          }
        });
      }
    }
  }

  async function copy(srcDir, dstDir, names) {
    const config = ensureConfigured();
    const body = {
      src_dir: normalizeRemotePath(srcDir),
      dst_dir: normalizeRemotePath(dstDir),
      names
    };
    try {
      return await requestJson(config, "/api/fs/copy", { body });
    } catch (error) {
      return requestJson(config, "/api/fs/copy", {
        body: {
          srcDir: body.src_dir,
          dstDir: body.dst_dir,
          names
        }
      });
    }
  }

  async function move(srcDir, dstDir, names) {
    const config = ensureConfigured();
    const body = {
      src_dir: normalizeRemotePath(srcDir),
      dst_dir: normalizeRemotePath(dstDir),
      names
    };
    try {
      return await requestJson(config, "/api/fs/move", { body });
    } catch (error) {
      return requestJson(config, "/api/fs/move", {
        body: {
          srcDir: body.src_dir,
          dstDir: body.dst_dir,
          names
        }
      });
    }
  }

  async function uploadFile({ filePath, remoteDir }) {
    const config = ensureConfigured();
    const localPath = String(filePath || "");
    if (!localPath || !fs.existsSync(localPath)) {
      throw new Error("本地文件不存在。");
    }
    const stat = fs.statSync(localPath);
    if (!stat.isFile()) {
      throw new Error("当前只支持上传文件，不支持文件夹。");
    }

    const remotePath = joinRemotePath(remoteDir, path.basename(localPath));
    try {
      return await uploadFileByPut(config, localPath, remotePath, stat);
    } catch (error) {
      if (!shouldFallbackToFormUpload(error)) {
        throw error;
      }
      return uploadFileByForm(config, localPath, remotePath, stat);
    }
  }

  function shouldFallbackToFormUpload(error) {
    const message = String(error && error.message ? error.message : "");
    return /HTTP\s+(404|405)|not\s+found|notfound|不存在|未找到/i.test(message);
  }

  function uploadFileByPut(config, localPath, remotePath, stat) {
    const url = buildUrl(config.serverUrl, "/api/fs/put");

    return new Promise((resolve, reject) => {
      const transport = url.protocol === "https:" ? https : http;
      const request = transport.request(
        toRequestOptions(url, {
          method: "PUT",
          headers: {
            Authorization: config.token,
            "Content-Type": "application/octet-stream",
            "Content-Length": stat.size,
            "File-Path": encodeURIComponent(remotePath)
          }
        }),
        (response) => {
          const chunks = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            if (response.statusCode < 200 || response.statusCode >= 300) {
              reject(new Error(`HTTP ${response.statusCode}: ${text || response.statusMessage}`));
              return;
            }
            try {
              const data = parseOpenListResponse({ text, statusCode: response.statusCode }, "/api/fs/put");
              resolve(data);
            } catch (error) {
              reject(error);
            }
          });
        }
      );

      request.on("error", reject);
      request.setTimeout(0);
      fs.createReadStream(localPath).on("error", reject).pipe(request);
    });
  }

  function uploadFileByForm(config, localPath, remotePath, stat) {
    const url = buildUrl(config.serverUrl, "/api/fs/form");
    const boundary = `----openlist-utools-${Date.now().toString(16)}`;
    const fileName = path.basename(localPath);
    const safeFileName = fileName.replace(/"/g, "%22");
    const head = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${safeFileName}"\r\n` +
        "Content-Type: application/octet-stream\r\n\r\n",
      "utf8"
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");

    return new Promise((resolve, reject) => {
      const transport = url.protocol === "https:" ? https : http;
      const request = transport.request(
        toRequestOptions(url, {
          method: "PUT",
          headers: {
            Authorization: config.token,
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
            "Content-Length": head.length + stat.size + tail.length,
            "File-Path": encodeURIComponent(remotePath)
          }
        }),
        (response) => {
          const chunks = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            if (response.statusCode < 200 || response.statusCode >= 300) {
              reject(new Error(`HTTP ${response.statusCode}: ${text || response.statusMessage}`));
              return;
            }
            try {
              const data = parseOpenListResponse({ text, statusCode: response.statusCode }, "/api/fs/form");
              resolve(data);
            } catch (error) {
              reject(error);
            }
          });
        }
      );

      request.on("error", reject);
      request.setTimeout(0);
      request.write(head);
      const stream = fs.createReadStream(localPath);
      stream.on("error", reject);
      stream.on("end", () => request.end(tail));
      stream.pipe(request, { end: false });
    });
  }

  function getCopiedFiles() {
    if (!window.utools || typeof window.utools.getCopyedFiles !== "function") {
      return [];
    }

    try {
      const files = window.utools.getCopyedFiles() || [];
      return Array.isArray(files) ? files : [];
    } catch (error) {
      console.error("[openlist-utools] failed to read copied files", error);
      return [];
    }
  }

  function handlePluginEnter(action) {
    lastEnterAction = action || null;
    enterListeners.forEach((listener) => {
      try {
        listener(lastEnterAction);
      } catch (error) {
        console.error("[openlist-utools] plugin enter listener failed", error);
      }
    });
  }

  function getCurrentEnterAction() {
    if (window.utools && typeof window.utools.getPluginEnterAction === "function") {
      try {
        const action = window.utools.getPluginEnterAction();
        if (action) {
          handlePluginEnter(action);
        }
      } catch (error) {
        console.error("[openlist-utools] failed to read plugin enter action", error);
      }
    }
    return lastEnterAction;
  }

  if (window.utools && typeof window.utools.onPluginEnter === "function") {
    try {
      window.utools.onPluginEnter(handlePluginEnter);
    } catch (error) {
      console.error("[openlist-utools] failed to register plugin enter", error);
    }
  }

  window.openListApi = {
    getConfig,
    saveConfig,
    login,
    testConnection,
    list,
    mkdir,
    remove,
    rename,
    copy,
    move,
    uploadFile,
    getCopiedFiles,
    basename: (filePath) => path.basename(filePath || ""),
    onPluginEnter: (listener) => {
      if (typeof listener !== "function") {
        throw new TypeError("onPluginEnter listener must be a function.");
      }
      enterListeners.add(listener);
      return () => enterListeners.delete(listener);
    },
    getLastEnterAction: getCurrentEnterAction
  };
})();
