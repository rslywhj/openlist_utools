(function () {
  const api = window.openListApi;
  const state = {
    config: null,
    files: [],
    currentPath: "/",
    items: [],
    lastEnterSignature: "",
    standalone: false,
    connectionStatus: "unknown"
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    if (!api) {
      showMessage("当前环境未检测到 uTools preload API，请在 uTools 中运行插件。", "error");
      return;
    }

    cacheElements();
    bindEvents();
    state.config = await api.getConfig();
    state.connectionStatus = state.config.connectionStatus || "unknown";
    syncSettingsForm();
    renderConnection();
    renderPresets();
    renderPresetOptions();
    verifySavedConnection();

    api.onPluginEnter(handleEnterAction);
    const enterAction = api.getLastEnterAction();
    if (enterAction) {
      handleEnterAction(enterAction);
    }
    window.setInterval(pollEnterAction, 800);
  }

  function cacheElements() {
    Object.assign(els, {
      message: $("#message"),
      connectionDot: $("#connectionDot"),
      connectionTitle: $("#connectionTitle"),
      connectionMeta: $("#connectionMeta"),
      uploadPreset: $("#uploadPreset"),
      uploadAllButton: $("#uploadAllButton"),
      uploadList: $("#uploadList"),
      pickFilesButton: $("#pickFilesButton"),
      localFilePicker: $("#localFilePicker"),
      dropZone: $("#dropZone"),
      quickUpload: $("#quickUpload"),
      quickUploadSummary: $("#quickUploadSummary"),
      quickPresetList: $("#quickPresetList"),
      quickUploadStatus: $("#quickUploadStatus"),
      quickBackButton: $("#quickBackButton"),
      refreshButton: $("#refreshButton"),
      goUpButton: $("#goUpButton"),
      currentPathInput: $("#currentPathInput"),
      openPathButton: $("#openPathButton"),
      mkdirButton: $("#mkdirButton"),
      remoteTableBody: $("#remoteTableBody"),
      presetForm: $("#presetForm"),
      presetName: $("#presetName"),
      presetPath: $("#presetPath"),
      choosePresetPathButton: $("#choosePresetPathButton"),
      presetList: $("#presetList"),
      settingsForm: $("#settingsForm"),
      serverUrl: $("#serverUrl"),
      authMode: $("#authMode"),
      tokenInput: $("#tokenInput"),
      usernameInput: $("#usernameInput"),
      passwordInput: $("#passwordInput"),
      testConnectionButton: $("#testConnectionButton"),
      dialogOverlay: $("#dialogOverlay"),
      dialogForm: $("#dialogForm"),
      dialogTitle: $("#dialogTitle"),
      dialogMessage: $("#dialogMessage"),
      dialogInput: $("#dialogInput"),
      dialogCancelButton: $("#dialogCancelButton"),
      dialogConfirmButton: $("#dialogConfirmButton"),
      pathDialogOverlay: $("#pathDialogOverlay"),
      pathDialogForm: $("#pathDialogForm"),
      pathDialogTitle: $("#pathDialogTitle"),
      pathDialogMessage: $("#pathDialogMessage"),
      pathDialogCurrent: $("#pathDialogCurrent"),
      pathDialogOpenButton: $("#pathDialogOpenButton"),
      pathDialogUpButton: $("#pathDialogUpButton"),
      pathDialogList: $("#pathDialogList"),
      pathDialogCancelButton: $("#pathDialogCancelButton"),
      pathDialogConfirmButton: $("#pathDialogConfirmButton")
    });
  }

  function bindEvents() {
    $$(".tab").forEach((button) => {
      button.addEventListener("click", () => switchTab(button.dataset.tab));
    });

    els.authMode.addEventListener("change", updateAuthFields);
    els.settingsForm.addEventListener("submit", saveSettings);
    els.testConnectionButton.addEventListener("click", testConnection);

    els.presetForm.addEventListener("submit", addPreset);
    els.choosePresetPathButton.addEventListener("click", choosePresetPath);
    els.uploadAllButton.addEventListener("click", uploadAllFiles);
    els.pickFilesButton.addEventListener("click", () => els.localFilePicker.click());
    els.localFilePicker.addEventListener("change", (event) => addFilesFromFileList(event.target.files));
    els.quickBackButton.addEventListener("click", () => {
      els.quickUpload.hidden = true;
      $(".tabs").hidden = false;
      state.standalone = false;
      switchTab("upload");
    });

    els.dropZone.addEventListener("dragover", (event) => {
      event.preventDefault();
      els.dropZone.classList.add("dragging");
    });
    els.dropZone.addEventListener("dragleave", () => els.dropZone.classList.remove("dragging"));
    els.dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      els.dropZone.classList.remove("dragging");
      addFilesFromFileList(event.dataTransfer.files);
    });

    els.refreshButton.addEventListener("click", () => loadDirectory(state.currentPath));
    els.openPathButton.addEventListener("click", () => loadDirectory(els.currentPathInput.value));
    els.currentPathInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        loadDirectory(els.currentPathInput.value);
      }
    });
    els.goUpButton.addEventListener("click", goUp);
    els.mkdirButton.addEventListener("click", createDirectory);
  }

  function switchTab(tab) {
    els.quickUpload.hidden = true;
    if (!state.standalone) {
      $(".tabs").hidden = false;
    }
    $$(".tab").forEach((button) => button.classList.toggle("is-active", button.dataset.tab === tab));
    $$(".panel").forEach((panel) => panel.classList.toggle("is-active", panel.id === tab));
    if (tab === "manager" && state.items.length === 0 && isConfigured()) {
      loadDirectory(state.currentPath);
    }
  }

  function openStandaloneTab(tab) {
    state.standalone = true;
    $(".tabs").hidden = true;
    switchTab(tab);
  }

  function openFullManager() {
    state.standalone = false;
    $(".tabs").hidden = false;
    switchTab("manager");
  }

  async function handleEnterAction(action) {
    if (!action) {
      return;
    }

    if (action.code === "openlist-upload-files" || action.code === "openlist-upload") {
      const copiedFiles = await api.getCopiedFiles();
      const files = dedupeFiles([
        ...normalizePayloadFiles(action.payload),
        ...normalizePayloadFiles(action.files),
        ...normalizePayloadFiles(action.data),
        ...normalizePayloadFiles(copiedFiles)
      ]);
      const signature = createFilesSignature("openlist-upload-files", files);
      if (skipRepeatedEnter(signature)) {
        return;
      }
      state.files = files.map((file) => ({ ...file, status: "等待上传", statusType: "" }));
      renderUploads();
      if (!isConfigured()) {
        showMessage("请先在设置中配置 OpenList 服务器和认证信息。", "error");
        switchTab("settings");
        return;
      }
      if (!state.files.length) {
        showQuickUpload();
        showMessage("没有读取到文件路径。请确认复制的是本地文件，或从文件管理器选中文件后触发上传指令。", "error");
        return;
      }
      showQuickUpload();
      return;
    }

    if (action.code === "openlist-settings") {
      if (skipRepeatedEnter(createEnterSignature(action))) return;
      openStandaloneTab("settings");
      return;
    }

    if (action.code === "openlist-presets") {
      if (skipRepeatedEnter(createEnterSignature(action))) return;
      openStandaloneTab("presets");
      return;
    }

    if (action.code === "openlist-upload-page") {
      const copiedFiles = await api.getCopiedFiles();
      const files = dedupeFiles([
        ...normalizePayloadFiles(action.payload),
        ...normalizePayloadFiles(action.files),
        ...normalizePayloadFiles(action.data),
        ...normalizePayloadFiles(copiedFiles)
      ]);
      if (skipRepeatedEnter(createFilesSignature("openlist-upload-page", files))) return;
      if (files.length) {
        state.files = files.map((file) => ({ ...file, status: "等待上传", statusType: "" }));
        renderUploads();
      }
      openStandaloneTab("upload");
      return;
    }

    const signature = createEnterSignature(action);
    if (skipRepeatedEnter(signature)) return;
    openFullManager();
  }

  function pollEnterAction() {
    const action = api.getLastEnterAction();
    if (action) {
      handleEnterAction(action);
    }
  }

  function createEnterSignature(action) {
    try {
      return JSON.stringify({
        code: action && action.code,
        payload: action && action.payload,
        files: action && action.files,
        data: action && action.data
      });
    } catch (error) {
      return `${action && action.code}:${Date.now()}`;
    }
  }

  function skipRepeatedEnter(signature) {
    if (signature && signature === state.lastEnterSignature) {
      return true;
    }
    state.lastEnterSignature = signature;
    return false;
  }

  function createFilesSignature(code, files) {
    return `${code}:${files.map((file) => file.path).sort().join("|")}`;
  }

  function normalizePayloadFiles(payload) {
    const list = Array.isArray(payload) ? payload : payload ? [payload] : [];
    return flattenPayload(list)
      .map((item) => {
        const filePath = typeof item === "string"
          ? item
          : item.path || item.filePath || item.file || item.fullPath || item.url || "";
        if (!filePath) return null;
        return {
          path: filePath,
          name: item.name || api.basename(filePath),
          size: item.size || 0
        };
      })
      .filter(Boolean);
  }

  function flattenPayload(items) {
    const output = [];
    items.forEach((item) => {
      if (!item) return;
      if (Array.isArray(item)) {
        output.push(...flattenPayload(item));
        return;
      }
      if (typeof item === "object") {
        ["files", "data", "payload", "items"].forEach((key) => {
          if (item[key]) {
            output.push(...flattenPayload(item[key]));
          }
        });
      }
      output.push(item);
    });
    return output;
  }

  function dedupeFiles(files) {
    const seen = new Set();
    return files.filter((file) => {
      if (!file.path || seen.has(file.path)) return false;
      seen.add(file.path);
      return true;
    });
  }

  function addFilesFromFileList(fileList) {
    const files = Array.from(fileList || [])
      .map((file) => {
        const filePath = file.path || "";
        if (!filePath) return null;
        return {
          path: filePath,
          name: file.name || api.basename(filePath),
          size: file.size || 0,
          status: "等待上传",
          statusType: ""
        };
      })
      .filter(Boolean);

    if (!files.length) {
      showMessage("未能读取本地文件路径。请优先通过 uTools 文件匹配入口触发上传。", "error");
      return;
    }

    state.files = [...state.files, ...files];
    renderUploads();
  }

  function renderConnection() {
    const configured = isConfigured();
    const online = state.connectionStatus === "online";
    const failed = state.connectionStatus === "error";
    els.connectionDot.classList.toggle("ok", online);
    els.connectionDot.classList.toggle("error", failed);
    els.connectionTitle.textContent = online ? "已连接" : configured ? "未验证" : "未配置";
    els.connectionMeta.textContent = online
      ? state.config.serverUrl
      : failed
        ? "连接失败"
        : configured
          ? "请测试连接"
          : "请先完成设置";
  }

  function isConfigured() {
    return Boolean(state.config && state.config.serverUrl && state.config.token);
  }

  function syncSettingsForm() {
    els.serverUrl.value = state.config.serverUrl || "";
    els.authMode.value = state.config.authMode || "token";
    els.tokenInput.value = state.config.token || "";
    els.usernameInput.value = state.config.username || "";
    els.passwordInput.value = "";
    updateAuthFields();
  }

  function updateAuthFields() {
    const isPassword = els.authMode.value === "password";
    $$(".password-field").forEach((field) => field.classList.toggle("hidden", !isPassword));
    $(".token-field").classList.toggle("hidden", isPassword);
  }

  async function saveSettings(event) {
    event.preventDefault();
    await withButton(els.settingsForm.querySelector("button[type='submit']"), "保存中", async () => {
      const next = collectSettings();
      if (next.authMode === "password" && els.passwordInput.value) {
        const result = await api.login(next.serverUrl, next.username, els.passwordInput.value);
        next.token = result.token;
      }
      await api.testConnection(next);
      state.connectionStatus = "online";
      state.config = await api.saveConfig({ ...next, connectionStatus: state.connectionStatus });
      els.passwordInput.value = "";
      syncSettingsForm();
      renderConnection();
      showMessage("设置已保存，连接测试成功。", "success");
    }, async () => {
      state.connectionStatus = "error";
      renderConnection();
      const next = collectSettings();
      if (next.serverUrl || next.token) {
        state.config = await api.saveConfig({ ...next, connectionStatus: state.connectionStatus });
        syncSettingsForm();
      }
    });
  }

  async function testConnection() {
    await withButton(els.testConnectionButton, "测试中", async () => {
      const next = collectSettings();
      let token = next.token;
      if (next.authMode === "password" && els.passwordInput.value) {
        const result = await api.login(next.serverUrl, next.username, els.passwordInput.value);
        token = result.token;
      }
      await api.testConnection({ ...next, token });
      state.connectionStatus = "online";
      state.config = await api.saveConfig({ ...next, token, connectionStatus: state.connectionStatus });
      renderConnection();
      showMessage("连接测试成功。", "success");
    }, async () => {
      state.connectionStatus = "error";
      state.config = await api.saveConfig({ ...collectSettings(), connectionStatus: state.connectionStatus });
      renderConnection();
    });
  }

  function collectSettings() {
    const authMode = els.authMode.value;
    return {
      ...state.config,
      serverUrl: els.serverUrl.value.trim(),
      authMode,
      token: authMode === "token" ? els.tokenInput.value.trim() : state.config.token,
      username: els.usernameInput.value.trim(),
      connectionStatus: state.connectionStatus
    };
  }

  async function verifySavedConnection() {
    if (!isConfigured()) {
      return;
    }

    try {
      await api.testConnection(state.config);
      state.connectionStatus = "online";
    } catch (error) {
      state.connectionStatus = "error";
    }

    state.config = await api.saveConfig({ ...state.config, connectionStatus: state.connectionStatus });
    renderConnection();
  }

  async function addPreset(event) {
    event.preventDefault();
    const name = els.presetName.value.trim();
    const presetPath = normalizeRemotePath(els.presetPath.value);
    if (!name || !presetPath) {
      showMessage("请填写预设名称和远端路径。", "error");
      return;
    }
    const presets = state.config.pathPresets.filter((preset) => preset.name !== name);
    presets.push({ name, path: presetPath });
    state.config = await api.saveConfig({ ...state.config, pathPresets: presets });
    els.presetName.value = "";
    els.presetPath.value = "";
    renderPresets();
    renderPresetOptions();
    showMessage("路径预设已保存。", "success");
  }

  async function choosePresetPath() {
    const pickedPath = await openPathPickerDialog({
      title: "选择预设路径",
      message: "选择一个远端目录作为上传目标",
      value: els.presetPath.value || "/"
    });
    if (pickedPath) {
      els.presetPath.value = pickedPath;
    }
  }

  async function removePreset(index) {
    const presets = state.config.pathPresets.filter((_, currentIndex) => currentIndex !== index);
    state.config = await api.saveConfig({ ...state.config, pathPresets: presets.length ? presets : [{ name: "根目录", path: "/" }] });
    renderPresets();
    renderPresetOptions();
  }

  function renderPresets() {
    els.presetList.innerHTML = "";
    state.config.pathPresets.forEach((preset, index) => {
      const row = document.createElement("div");
      row.className = "preset-item";
      row.innerHTML = `
        <div class="preset-meta">
          <strong></strong>
          <small></small>
        </div>
        <button class="button button-secondary" type="button">删除</button>
      `;
      row.querySelector("strong").textContent = preset.name;
      row.querySelector("small").textContent = preset.path;
      row.querySelector("button").addEventListener("click", () => removePreset(index));
      els.presetList.appendChild(row);
    });
  }

  function renderPresetOptions() {
    els.uploadPreset.innerHTML = "";
    state.config.pathPresets.forEach((preset, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `${preset.name} (${preset.path})`;
      els.uploadPreset.appendChild(option);
    });
    renderQuickPresets();
  }

  function showQuickUpload() {
    state.standalone = true;
    els.quickUpload.hidden = false;
    $(".tabs").hidden = true;
    $$(".panel").forEach((panel) => panel.classList.remove("is-active"));
    renderQuickPresets();
    renderQuickUploads();
  }

  function renderQuickPresets() {
    if (!els.quickPresetList || !state.config) return;
    els.quickPresetList.innerHTML = "";
    state.config.pathPresets.forEach((preset) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "quick-preset";
      button.innerHTML = "<strong></strong><small></small>";
      button.querySelector("strong").textContent = preset.name;
      button.querySelector("small").textContent = preset.path;
      button.addEventListener("click", () => uploadFilesToPreset(preset, { quick: true }));
      els.quickPresetList.appendChild(button);
    });
  }

  function renderQuickUploads() {
    els.quickUploadSummary.textContent = state.files.length
      ? `已读取 ${state.files.length} 个文件，选择路径后立即上传。`
      : "未读取到可上传的本地文件。";

    if (!state.files.length) {
      els.quickUploadStatus.className = "file-list empty-state";
      els.quickUploadStatus.textContent = "暂无待上传文件";
      return;
    }

    els.quickUploadStatus.className = "file-list";
    els.quickUploadStatus.innerHTML = "";
    state.files.forEach((file) => {
      const item = document.createElement("div");
      item.className = "file-item";
      item.innerHTML = `
        <div class="file-meta">
          <strong></strong>
          <small></small>
        </div>
        <span class="status"></span>
      `;
      item.querySelector("strong").textContent = file.name;
      item.querySelector("small").textContent = file.path;
      const status = item.querySelector(".status");
      status.textContent = file.status;
      status.className = `status ${file.statusType || ""}`;
      els.quickUploadStatus.appendChild(item);
    });
  }

  function renderUploads() {
    if (!state.files.length) {
      els.uploadList.className = "file-list empty-state";
      els.uploadList.textContent = "暂无待上传文件";
      return;
    }

    els.uploadList.className = "file-list";
    els.uploadList.innerHTML = "";
    state.files.forEach((file) => {
      const item = document.createElement("div");
      item.className = "file-item";
      item.innerHTML = `
        <div class="file-meta">
          <strong></strong>
          <small></small>
        </div>
        <span class="status"></span>
      `;
      item.querySelector("strong").textContent = file.name;
      item.querySelector("small").textContent = `${file.path}${file.size ? ` · ${formatSize(file.size)}` : ""}`;
      const status = item.querySelector(".status");
      status.textContent = file.status;
      status.className = `status ${file.statusType || ""}`;
      els.uploadList.appendChild(item);
    });
  }

  async function uploadAllFiles() {
    if (!isConfigured()) {
      showMessage("请先完成 OpenList 设置。", "error");
      switchTab("settings");
      return;
    }
    if (!state.files.length) {
      showMessage("暂无待上传文件。", "error");
      return;
    }

    const preset = state.config.pathPresets[Number(els.uploadPreset.value)] || state.config.pathPresets[0];
    await uploadFilesToPreset(preset, { quick: false });
  }

  async function uploadFilesToPreset(preset, options = {}) {
    await withButton(els.uploadAllButton, "上传中", async () => {
      const render = options.quick ? renderQuickUploads : renderUploads;
      if (options.quick) {
        $$(".quick-preset").forEach((button) => {
          button.disabled = true;
        });
      }
      for (const file of state.files) {
        file.status = "上传中";
        file.statusType = "";
        render();
        try {
          await api.uploadFile({ filePath: file.path, remoteDir: preset.path });
          file.status = "已完成";
          file.statusType = "success";
        } catch (error) {
          file.status = error.message || "失败";
          file.statusType = "error";
        }
        render();
      }
      const failed = state.files.some((file) => file.statusType === "error");
      showMessage(failed ? "上传任务已结束，请检查失败项。" : "上传完成。", failed ? "error" : "success");
      if (options.quick) {
        $$(".quick-preset").forEach((button) => {
          button.disabled = false;
        });
        if (!failed && window.utools) {
          window.utools.showNotification && window.utools.showNotification(`已上传到 ${preset.path}`);
          window.setTimeout(() => window.utools.outPlugin && window.utools.outPlugin(), 700);
        }
      }
    });
  }

  async function loadDirectory(targetPath) {
    if (!isConfigured()) {
      showMessage("请先完成 OpenList 设置。", "error");
      switchTab("settings");
      return;
    }

    const normalizedPath = normalizeRemotePath(targetPath);
    els.currentPathInput.value = normalizedPath;
    setTableMessage("加载中...");

    try {
      const result = await api.list(normalizedPath);
      state.currentPath = normalizedPath;
      state.items = result.content || [];
      renderRemoteTable();
    } catch (error) {
      setTableMessage(error.message || "目录加载失败");
    }
  }

  function renderRemoteTable() {
    if (!state.items.length) {
      setTableMessage("目录为空");
      return;
    }

    els.remoteTableBody.innerHTML = "";
    const sorted = [...state.items].sort((a, b) => Number(Boolean(b.is_dir)) - Number(Boolean(a.is_dir)) || a.name.localeCompare(b.name));
    sorted.forEach((item) => {
      const row = document.createElement("tr");
      const type = item.is_dir ? "目录" : "文件";
      row.innerHTML = `
        <td class="name-cell"></td>
        <td>${type}</td>
        <td>${item.is_dir ? "-" : formatSize(item.size || 0)}</td>
        <td>${formatDate(item.modified || item.created)}</td>
        <td><div class="row-actions"></div></td>
      `;

      const nameCell = row.querySelector(".name-cell");
      nameCell.textContent = `${item.is_dir ? "📁 " : ""}${item.name}`;
      nameCell.classList.toggle("dir", Boolean(item.is_dir));
      if (item.is_dir) {
        nameCell.addEventListener("dblclick", () => loadDirectory(joinRemotePath(state.currentPath, item.name)));
        nameCell.addEventListener("click", () => loadDirectory(joinRemotePath(state.currentPath, item.name)));
      }

      const actions = row.querySelector(".row-actions");
      addRowButton(actions, "重命名", () => renameItem(item));
      addRowButton(actions, "复制", () => copyOrMoveItem(item, "copy"));
      addRowButton(actions, "移动", () => copyOrMoveItem(item, "move"));
      addRowButton(actions, "删除", () => deleteItem(item), "button-secondary");

      els.remoteTableBody.appendChild(row);
    });
  }

  function addRowButton(container, label, handler, extraClass = "button-ghost") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `button ${extraClass}`;
    button.textContent = label;
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      console.log(`[openlist-utools] action clicked: ${label}`);
      const oldText = button.textContent;
      button.disabled = true;
      button.textContent = "...";
      try {
        await handler();
      } finally {
        button.disabled = false;
        button.textContent = oldText;
      }
    });
    container.appendChild(button);
  }

  function setTableMessage(message) {
    els.remoteTableBody.innerHTML = `<tr><td colspan="5" class="empty-cell"></td></tr>`;
    els.remoteTableBody.querySelector("td").textContent = message;
  }

  async function createDirectory() {
    const name = await openInputDialog({
      title: "新建目录",
      message: `在 ${state.currentPath} 下创建目录`,
      value: ""
    });
    if (!name) return;
    try {
      await api.mkdir(joinRemotePath(state.currentPath, name));
      await loadDirectory(state.currentPath);
      showMessage("目录已创建。", "success");
    } catch (error) {
      showMessage(error.message || "目录创建失败。", "error");
    }
  }

  async function renameItem(item) {
    const nextName = await openInputDialog({
      title: "重命名",
      message: `修改 ${item.name} 的名称`,
      value: item.name
    });
    if (!nextName || nextName === item.name) return;
    try {
      await api.rename(joinRemotePath(state.currentPath, item.name), nextName);
      await loadDirectory(state.currentPath);
      showMessage("重命名完成。", "success");
    } catch (error) {
      showMessage(error.message || "重命名失败。", "error");
    }
  }

  async function deleteItem(item) {
    const confirmed = await openConfirmDialog({
      title: "删除确认",
      message: `确认删除 ${item.name}？此操作不可撤销。`
    });
    if (!confirmed) return;
    try {
      await api.remove(state.currentPath, [item.name]);
      await loadDirectory(state.currentPath);
      showMessage("删除完成。", "success");
    } catch (error) {
      showMessage(error.message || "删除失败。", "error");
    }
  }

  async function copyOrMoveItem(item, mode) {
    const label = mode === "copy" ? "复制" : "移动";
    const target = await openPathPickerDialog({
      title: label,
      message: `${label} ${item.name} 到目标目录`,
      value: state.currentPath
    });
    if (!target) return;
    try {
      await api[mode](state.currentPath, normalizeRemotePath(target), [item.name]);
      await loadDirectory(state.currentPath);
      showMessage(`${label}完成。`, "success");
    } catch (error) {
      showMessage(error.message || `${label}失败。`, "error");
    }
  }

  function goUp() {
    const current = normalizeRemotePath(state.currentPath);
    if (current === "/") return;
    const parent = current.split("/").slice(0, -1).join("/") || "/";
    loadDirectory(parent);
  }

  async function withButton(button, label, task, onError) {
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = label;
    try {
      await task();
    } catch (error) {
      if (typeof onError === "function") {
        await onError(error);
      }
      showMessage(error.message || "操作失败。", "error");
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  function openInputDialog({ title, message, value = "" }) {
    return openDialog({ title, message, value, input: true });
  }

  function openConfirmDialog({ title, message }) {
    return openDialog({ title, message, input: false });
  }

  function openPathPickerDialog({ title, message, value = "/" }) {
    if (!isConfigured()) {
      showMessage("请先完成 OpenList 设置。", "error");
      switchTab("settings");
      return Promise.resolve("");
    }

    return new Promise((resolve) => {
      let currentPath = normalizeRemotePath(value);

      const cleanup = () => {
        els.pathDialogForm.removeEventListener("submit", onSubmit);
        els.pathDialogCancelButton.removeEventListener("click", onCancel);
        els.pathDialogOpenButton.removeEventListener("click", onOpen);
        els.pathDialogUpButton.removeEventListener("click", onUp);
        els.pathDialogCurrent.removeEventListener("keydown", onKeydown);
        els.pathDialogOverlay.removeEventListener("click", onBackdrop);
      };

      const finish = (result) => {
        cleanup();
        els.pathDialogOverlay.hidden = true;
        resolve(result);
      };

      const renderLoading = () => {
        els.pathDialogList.innerHTML = '<div class="path-dialog-empty">加载中...</div>';
      };

      const renderError = (messageText) => {
        els.pathDialogList.innerHTML = "";
        const empty = document.createElement("div");
        empty.className = "path-dialog-empty";
        empty.textContent = messageText;
        els.pathDialogList.appendChild(empty);
      };

      const openPath = async (targetPath) => {
        currentPath = normalizeRemotePath(targetPath);
        els.pathDialogCurrent.value = currentPath;
        renderLoading();

        try {
          const result = await api.list(currentPath);
          const dirs = (result.content || [])
            .filter((item) => item && item.is_dir)
            .sort((a, b) => a.name.localeCompare(b.name));

          els.pathDialogList.innerHTML = "";
          if (!dirs.length) {
            renderError("当前目录没有子目录，可以直接选择此目录。");
            return;
          }

          dirs.forEach((dir) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "path-dialog-item";
            button.innerHTML = "<span></span><small>进入</small>";
            button.querySelector("span").textContent = dir.name;
            button.addEventListener("click", () => openPath(joinRemotePath(currentPath, dir.name)));
            els.pathDialogList.appendChild(button);
          });
        } catch (error) {
          renderError(error.message || "目录加载失败");
        }
      };

      const onSubmit = (event) => {
        event.preventDefault();
        finish(normalizeRemotePath(els.pathDialogCurrent.value || currentPath));
      };

      const onCancel = () => finish("");
      const onOpen = () => openPath(els.pathDialogCurrent.value);
      const onUp = () => {
        const current = normalizeRemotePath(els.pathDialogCurrent.value || currentPath);
        if (current === "/") return;
        openPath(current.split("/").slice(0, -1).join("/") || "/");
      };
      const onKeydown = (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          openPath(els.pathDialogCurrent.value);
        }
      };
      const onBackdrop = (event) => {
        if (event.target === els.pathDialogOverlay) {
          finish("");
        }
      };

      els.pathDialogTitle.textContent = title;
      els.pathDialogMessage.textContent = message;
      els.pathDialogOverlay.hidden = false;
      els.pathDialogForm.addEventListener("submit", onSubmit);
      els.pathDialogCancelButton.addEventListener("click", onCancel);
      els.pathDialogOpenButton.addEventListener("click", onOpen);
      els.pathDialogUpButton.addEventListener("click", onUp);
      els.pathDialogCurrent.addEventListener("keydown", onKeydown);
      els.pathDialogOverlay.addEventListener("click", onBackdrop);

      openPath(currentPath);
    });
  }

  function openDialog({ title, message, value = "", input }) {
    return new Promise((resolve) => {
      els.dialogTitle.textContent = title;
      els.dialogMessage.textContent = message;
      els.dialogInput.hidden = !input;
      els.dialogInput.value = value;
      els.dialogOverlay.hidden = false;

      const cleanup = () => {
        els.dialogForm.removeEventListener("submit", onSubmit);
        els.dialogCancelButton.removeEventListener("click", onCancel);
        els.dialogOverlay.removeEventListener("click", onBackdrop);
      };

      const finish = (result) => {
        cleanup();
        els.dialogOverlay.hidden = true;
        resolve(result);
      };

      const onSubmit = (event) => {
        event.preventDefault();
        finish(input ? els.dialogInput.value.trim() : true);
      };

      const onCancel = () => finish(input ? "" : false);
      const onBackdrop = (event) => {
        if (event.target === els.dialogOverlay) {
          finish(input ? "" : false);
        }
      };

      els.dialogForm.addEventListener("submit", onSubmit);
      els.dialogCancelButton.addEventListener("click", onCancel);
      els.dialogOverlay.addEventListener("click", onBackdrop);

      window.setTimeout(() => {
        if (input) {
          els.dialogInput.focus();
          els.dialogInput.select();
        } else {
          els.dialogConfirmButton.focus();
        }
      }, 0);
    });
  }

  function showMessage(text, type = "") {
    els.message.hidden = false;
    els.message.className = `message ${type}`;
    els.message.textContent = text;
    window.clearTimeout(showMessage.timer);
    showMessage.timer = window.setTimeout(() => {
      els.message.hidden = true;
    }, 5200);
  }

  function normalizeRemotePath(value) {
    const raw = String(value || "/").trim().replace(/\\/g, "/");
    const prefixed = raw.startsWith("/") ? raw : `/${raw}`;
    return prefixed.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  }

  function joinRemotePath(dir, name) {
    const base = normalizeRemotePath(dir);
    const cleanName = String(name || "").replace(/^\/+/, "");
    return base === "/" ? `/${cleanName}` : `${base}/${cleanName}`;
  }

  function formatSize(bytes) {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = Number(bytes) || 0;
    let index = 0;
    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index += 1;
    }
    return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString();
  }
})();
