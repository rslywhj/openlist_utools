# OpenList uTools 插件

一个原生静态 uTools 插件，用于快捷管理自建 OpenList，并把 uTools 匹配到的本地文件上传到预设路径。

## 功能

- 支持 API Token 或账号密码登录换取 Token。
- 支持维护多个远端路径预设。
- 支持 uTools 文件匹配入口上传任意本地文件。
- 支持远端目录浏览、新建目录、重命名、删除、复制、移动。
- 支持独立关键词入口：`OpenList 设置`、`OpenList 路径预设`、`上传到 OpenList`。

## 调试

1. 打开 uTools 开发者工具。
2. 选择本目录下的 `plugin.json` 加载插件。
3. 使用 `OpenList 设置` 配置服务器地址和认证信息。
4. 使用 `OpenList 路径预设` 维护上传路径。
5. 使用 `上传到 OpenList` 打开独立上传页，或在文件上触发 uTools 文件匹配并选择 `上传到 OpenList`。

## 说明

- 当前只支持上传文件，不支持上传文件夹。
- 账号密码只用于登录换取 Token，不会保存明文密码。
- 上传优先使用 `PUT /api/fs/put`，端点不可用时回退到 `PUT /api/fs/form`。
