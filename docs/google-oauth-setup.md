# Google OAuth 部署指南

本文档介绍如何配置 Google 登录功能。

## 1. 创建 Google Cloud 项目

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 点击顶部的项目选择器，选择「新建项目」
3. 输入项目名称（如 `bcailab`），点击「创建」
4. 等待项目创建完成，确保已切换到新项目

## 2. 启用 API

1. 在左侧菜单选择「API 和服务」→「库」
2. 搜索并启用以下 API：
   - **Google+ API**（或 Google People API）
   - **Google Identity Toolkit API**

## 3. 配置 OAuth 同意屏幕

1. 进入「API 和服务」→「OAuth 同意屏幕」
2. 选择用户类型：
   - **外部**：允许任何 Google 账户登录
   - **内部**：仅限 Google Workspace 组织内用户
3. 填写应用信息：
   - 应用名称：`bcailab`
   - 用户支持电子邮件：你的邮箱
   - 开发者联系信息：你的邮箱
4. 点击「保存并继续」
5. 添加范围（Scopes）：
   - `openid`
   - `email`
   - `profile`
6. 点击「保存并继续」完成配置

## 4. 创建 OAuth 凭据

1. 进入「API 和服务」→「凭据」
2. 点击「创建凭据」→「OAuth 客户端 ID」
3. 应用类型选择「Web 应用」
4. 填写名称（如 `bcailab-web`）
5. 添加「已获授权的 JavaScript 来源」：
   - 本地开发：`http://localhost:5173`
   - 生产环境：`https://你的域名.com`
6. 添加「已获授权的重定向 URI」：
   - 本地开发：`http://localhost:5173/auth/callback`
   - 生产环境：`https://你的域名.com/auth/callback`
7. 点击「创建」
8. **保存好显示的 Client ID 和 Client Secret**

## 5. 生成 SESSION_SECRET

在终端运行以下命令生成一个安全的随机密钥：

```bash
openssl rand -base64 32
```

保存输出的字符串作为 `SESSION_SECRET`。

## 6. 配置本地开发环境

在项目根目录创建 `.dev.vars` 文件（此文件已在 .gitignore 中）：

```ini
GOOGLE_CLIENT_ID=你的客户端ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=你的客户端密钥
OAUTH_REDIRECT_URL=http://localhost:5173/auth/callback
SESSION_SECRET=你生成的随机密钥
```

## 7. 配置 Cloudflare Pages 环境变量

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入「Workers & Pages」→ 选择你的 Pages 项目
3. 点击「Settings」→「Environment variables」
4. 添加以下变量（Production 和 Preview 环境都需要配置）：

| 变量名 | 值 | 类型 |
|--------|-----|------|
| `GOOGLE_CLIENT_ID` | 你的客户端 ID | Plain text |
| `GOOGLE_CLIENT_SECRET` | 你的客户端密钥 | **Encrypted** |
| `OAUTH_REDIRECT_URL` | `https://你的域名.com/auth/callback` | Plain text |
| `SESSION_SECRET` | 你生成的随机密钥 | **Encrypted** |

> **注意**：Preview 环境的 `OAUTH_REDIRECT_URL` 需要使用预览域名，如 `https://xxx.pages.dev/auth/callback`，并在 Google Console 中添加对应的重定向 URI。

## 8. 验证配置

1. 本地运行 `pnpm dev`
2. 访问登录页面，点击 Google 登录
3. 应该能够跳转到 Google 授权页面
4. 授权后应该能够成功回调并登录

## 常见问题

### redirect_uri_mismatch 错误

Google Console 中配置的重定向 URI 必须与 `OAUTH_REDIRECT_URL` **完全一致**，包括：
- 协议（http/https）
- 域名
- 端口（如有）
- 路径

### 400 错误：invalid_client

检查 `GOOGLE_CLIENT_ID` 和 `GOOGLE_CLIENT_SECRET` 是否正确，是否有多余的空格。

### 登录后 session 丢失

确保 `SESSION_SECRET` 在所有环境中保持一致。如果更换了密钥，现有的 session 会失效。
