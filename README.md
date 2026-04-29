# OpenList uTools 插件

一个原生 uTools 插件，用于快速管理自建 OpenList 服务，并把 uTools 匹配到的本地文件上传到预设远程目录。

## 功能特性

- 支持 OpenList API Token 认证
- 支持账号密码登录并换取 Token
- 支持维护多个远程上传路径预设
- 支持通过 uTools 文件匹配入口上传本地文件
- 支持远程目录浏览、新建目录、重命名、删除、复制和移动
- 提供独立入口：设置、路径预设、上传页面和文件右键上传

## 技术栈

- uTools 插件 API
- 原生 HTML、CSS、JavaScript
- `preload.js` 封装文件系统、配置存储和 OpenList 请求逻辑

## 目录结构

```text
openlist_utools/
├── plugin.json
├── index.html
├── index.css
├── index.js
├── preload.js
├── logo.png
└── README.md
```

## 调试方式

1. 打开 uTools 开发者工具。
2. 选择本目录下的 `plugin.json` 加载插件。
3. 使用 `OpenList 设置` 配置服务地址和认证信息。
4. 使用 `OpenList 路径预设` 维护上传目标目录。
5. 使用 `上传到 OpenList` 打开上传页面，或在文件匹配场景中选择上传入口。

## 插件入口

- `OpenList 管理`
- `OpenList 设置`
- `OpenList 路径预设`
- `上传到 OpenList`
- 文件匹配入口：选择本地文件后上传到预设路径

## 说明

- 当前只支持上传文件，不支持上传文件夹。
- 账号密码只用于登录换取 Token，不会保存明文密码。
- 上传优先使用 `PUT /api/fs/put`，不可用时回退到 `PUT /api/fs/form`。
