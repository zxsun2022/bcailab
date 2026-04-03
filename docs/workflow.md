# 开发、测试与部署工作流

本文档描述从本地开发到正式上线的完整流程，涵盖三个环境的配置要点和日常操作步骤。

## 环境总览

| 环境 | 运行方式 | D1 数据库 | R2 存储桶 | 环境变量来源 |
|------|---------|-----------|-----------|-------------|
| 本地开发 | `pnpm dev` (Vite + Cloudflare dev proxy) | 本地模拟 (wrangler `--local`) | 本地模拟 | `.dev.vars` |
| Cloudflare 测试 | Pages Preview（非 production 分支推送自动触发） | `preview_database_id` 指向的 D1 | `bcailab-assets-preview` | Pages Dashboard → Preview 环境变量 |
| 正式环境 | Pages Production（production 分支推送触发） | `bcailab-db` | `bcailab-assets` | Pages Dashboard → Production 环境变量 |

## Git 分支策略

```
feature/*  →  staging  →  main (production)
```

- `main` 是生产分支，Cloudflare Pages Production 部署绑定此分支。
- `staging` 是集成分支，用于汇总功能、触发 Preview 部署和进行测试。
- `feature/*` 是功能分支，从 `staging` 创建，完成后合并回 `staging`。

## 日常开发流程

### 第一步：本地开发

```bash
# 1. 从 staging 创建功能分支
git checkout staging
git pull origin staging
git checkout -b feature/my-feature

# 2. 启动本地开发服务器
pnpm dev
# 访问 http://localhost:5173

# 3. 如果有新的数据库 migration，先应用到本地
wrangler d1 migrations apply bcailab-db --local

# 4. 开发、测试、提交
git add <files>
git commit -m "描述你的改动"
```

**本地环境注意事项：**
- 环境变量从 `.dev.vars` 读取，该文件已在 `.gitignore` 中排除，不要提交。
- `OAUTH_REDIRECT_URL` 本地应为 `http://localhost:5173/auth/callback`。
- D1/R2 在本地使用 wrangler 模拟，数据存储在 `.wrangler/` 目录中。
- 如需更贴近 Pages 运行时的测试，可以用 `pnpm build && wrangler pages dev` 替代 `pnpm dev`。

### 第二步：Cloudflare 测试环境验证

```bash
# 1. 推送功能分支到 GitHub
git push origin feature/my-feature

# 2. Cloudflare Pages 自动构建，生成 preview URL
#    格式：https://<commit-hash>.bcailab.pages.dev

# 3. 如果有新的 migration，手动应用到测试数据库
wrangler d1 migrations apply bcailab-db --preview

# 4. 在 preview URL 上验证功能

# 5. 验证通过后，合并到 staging
git checkout staging
git merge feature/my-feature
git push origin staging
```

**测试环境注意事项：**
- Preview 部署使用 `wrangler.toml` 中的 `preview_database_id` 和 `preview_bucket_name`。
- 环境变量需要在 Cloudflare Pages Dashboard → Settings → Environment variables → **Preview** 中配置。
- `OAUTH_REDIRECT_URL` 测试环境需要设置为 preview 域名对应的回调地址，否则 OAuth 登录会失败。
- 缺少新 migration 的表会导致对应功能不可用（例如 `/writing` 依赖 `0007_writing.sql`）。

### 第三步：正式环境上线

```bash
# 1. 从 staging 合并到 main
git checkout main
git pull origin main
git merge staging
git push origin main

# 2. 如果有新的 migration，应用到生产数据库
wrangler d1 migrations apply bcailab-db

# 3. Cloudflare Pages 自动构建部署到正式环境
```

**正式环境注意事项：**
- Migration 必须在部署**之前或之后立即**执行。如果新代码依赖新表但 migration 未执行，功能会报错。
- 建议顺序：先执行 migration → 再 push 代码触发部署。
- 正式环境的 `OAUTH_REDIRECT_URL` 应为 `https://bcailab.com/auth/callback`。

## 数据库 Migration 速查

```bash
# 查看 migration 状态
wrangler d1 migrations list bcailab-db          # 生产
wrangler d1 migrations list bcailab-db --local   # 本地
wrangler d1 migrations list bcailab-db --preview  # 测试

# 应用 migration
wrangler d1 migrations apply bcailab-db          # 生产
wrangler d1 migrations apply bcailab-db --local   # 本地
wrangler d1 migrations apply bcailab-db --preview  # 测试
```

Migration 文件位于 `migrations/` 目录，按编号顺序执行。添加新 migration 后，需要在三个环境中分别手动应用。

## 需要保持同步的配置

### 两份 wrangler.toml

| 文件 | 用途 |
|------|------|
| `/wrangler.toml`（根目录） | 本地 `wrangler` CLI 命令使用 |
| `/apps/web/wrangler.toml` | Cloudflare Pages 部署时读取 |

修改 D1 database ID、R2 bucket name 等绑定时，**两个文件都要改**。

### 环境变量清单

以下变量需要在三个环境中分别配置：

| 变量 | 本地 (`.dev.vars`) | 测试 (Pages Preview) | 正式 (Pages Production) |
|------|-------------------|---------------------|------------------------|
| `GOOGLE_CLIENT_ID` | ✓ | ✓ | ✓ |
| `GOOGLE_CLIENT_SECRET` | ✓ | ✓ | ✓ |
| `GOOGLE_TTS_SERVICE_ACCOUNT_JSON` | ✓ | ✓ | ✓ |
| `GEMINI_API_KEY` | ✓ | ✓ | ✓ |
| `GEMINI_MODEL` | ✓ | ✓ | ✓ |
| `OAUTH_REDIRECT_URL` | `http://localhost:5173/auth/callback` | preview 域名对应的回调地址 | `https://bcailab.com/auth/callback` |
| `SESSION_SECRET` | ✓ | ✓ | ✓ |

## 常见问题

**Q: Preview 环境 OAuth 登录失败？**
检查 Pages Preview 环境变量中 `OAUTH_REDIRECT_URL` 是否匹配 preview 域名，以及 Google OAuth 应用的 Authorized redirect URIs 是否包含该地址。

**Q: 新功能在测试环境不可用？**
检查是否有新 migration 未应用到 preview 数据库：`wrangler d1 migrations list bcailab-db --preview`。

**Q: 本地 D1 数据丢失？**
本地数据存储在 `.wrangler/` 目录中。删除该目录或切换分支不会自动清除，但如果手动删除则需要重新 `--local` 应用所有 migration。

**Q: 构建失败？**
Pages 构建命令是 `cd ../.. && pnpm install --frozen-lockfile && pnpm --filter web build`。确保 `pnpm-lock.yaml` 是最新的（本地 `pnpm install` 后提交 lock 文件）。
