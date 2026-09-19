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
# 这个脚本与 pnpm dev 共用 apps/web/.wrangler/state，避免迁移到错误的本地库
pnpm db:migrate:local

# 4. 开发、验证、提交
pnpm verify  # 同时覆盖 Web 与 Mapdown；失败时停止，不要把 build 当作完整验证
git add <files>
git commit -m "描述你的改动"
```

**本地环境注意事项：**
- 环境变量从 `.dev.vars` 读取，该文件已在 `.gitignore` 中排除，不要提交。
- `OAUTH_REDIRECT_URL` 本地应为 `http://localhost:5173/auth/callback`。
- D1/R2 在本地使用 wrangler 模拟，数据存储在 `.wrangler/` 目录中。
- 如需更贴近 Pages 运行时的测试，可以用 `pnpm build && wrangler pages dev` 替代 `pnpm dev`。

### 本地验证入口

完整范围与限制见 [本地验证说明](verification.md)。只改一个产品时可运行
`pnpm verify:web` 或 `pnpm verify:mapdown`；共享或跨产品改动运行 `pnpm verify`。
浏览器交互仍按 [隔离 fixture 指南](../scripts/testing/README.md) 人工检查并记录。
这些是本地命令，不代表 Pages 自动等待检查，也不更改现有部署方式。

### 第二步：Cloudflare 测试环境验证

```bash
# 1. 如果有新的 migration，先应用到测试数据库
#    必须在推送之前：推送会触发自动构建部署，新代码一旦上线就会查询新列/新表
pnpm exec wrangler d1 migrations apply bcailab-db --remote --preview

# 2. 推送功能分支到 GitHub
git push origin feature/my-feature

# 3. Cloudflare Pages 自动构建，生成 preview URL
#    格式：https://<commit-hash>.bcailab.pages.dev

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
# 1. 如果有新的 migration，先应用到生产数据库
#    注意 --remote：不加这个参数，wrangler 会作用于本地库，生产其实没被迁移
#    注意 pnpm exec：用仓库锁定的 wrangler 版本，而不是机器上的全局版本
pnpm exec wrangler d1 migrations apply bcailab-db --remote

# 2. 确认迁移已生效，再推代码
pnpm exec wrangler d1 migrations list bcailab-db --remote   # 应显示 No migrations to apply

# 3. 从 staging 合并到 main（推送即触发自动构建部署）
git checkout main
git pull origin main
git merge staging
git push origin main

# 4. Cloudflare Pages 自动构建部署到正式环境
```

**正式环境注意事项：**
- **Migration 必须在部署之前执行，不能在之后。** 推送到 `main` 会立即触发 Pages 自动构建，
  新代码一上线就会查询新列/新表；此时若 migration 还没跑，该功能会直接报错。
  新增可空列这类改动是向后兼容的，提前应用对仍在运行的旧代码无影响。
- 迁移命令**必须带 `--remote`**。wrangler 4.x 默认作用于本地数据库，漏掉这个参数会
  让人误以为生产已迁移，实际没有。
- 曾经踩过：`0018_user_password.sql` 在代码上线后才应用，导致 `/profile` 报错
  （见 `docs/changelog.md` 2026-08-18 条目）。这条顺序已固化为
  [ADR 0008](decisions/0008-schema-migrations-precede-deploys.md)，其中也说明了
  **不向后兼容**的 migration（删列、改名、加 NOT NULL）为什么不能套用这个顺序，
  而必须拆成多次发布。
- 正式环境的 `OAUTH_REDIRECT_URL` 应为 `https://bcailab.com/auth/callback`。

### 推送后要确认部署真的跑完了

推送到 `main` 会创建一条 Pages 生产部署记录，但**记录存在不等于构建发生**。正常一次构建
只要约 80 秒（queued 30s → build 30s → deploy 12s）；若部署长时间停在 `queued` 且各阶段
状态为 `idle`，说明它没有被消费，站点仍在跑上一次的版本。

```bash
# 看最近的部署与状态（Status 若不是 deploy success，就不要认为已上线）
pnpm exec wrangler pages deployment list --project-name=bcailab

# 卡住时用官方重试接口重新触发（只针对该部署，不改变内容）
# POST /accounts/<account_id>/pages/projects/bcailab/deployments/<deployment_id>/retry
# 重试会生成一条新的部署记录，轮询它的 stages 直到 deploy=success。
```

判断线上跑的是哪个版本，可以比对待部署提交的构建产物与生产 HTML 引用的文件名
（`apps/web/build/client/assets/` 里的哈希文件名应与 `https://bcailab.com/` 引用的一致），
或看项目的 `canonical_deployment` 指向哪个 commit。

2026-09-19 实测：一次直接 `git push` 到 `main` 的部署在 `queued` 停留 18 分钟未构建，
手动重试后 100 秒内完成。部署列表显示自 2026-08-26 起有相当比例的部署停在 `queued/idle`，
属于长期现象；推完代码后要主动确认，不要默认"推送即上线"。

## 数据库 Migration 速查

```bash
# 查看 migration 状态
pnpm exec wrangler d1 migrations list bcailab-db --remote   # 生产
pnpm exec wrangler d1 migrations list bcailab-db --local --persist-to apps/web/.wrangler/state  # 本地
pnpm exec wrangler d1 migrations list bcailab-db --remote --preview  # 测试

# 应用 migration
pnpm exec wrangler d1 migrations apply bcailab-db --remote   # 生产
pnpm db:migrate:local                                        # 本地
pnpm exec wrangler d1 migrations apply bcailab-db --remote --preview  # 测试
```

**远程环境的参数不能省：**

- **`--remote`。** wrangler 4.x 下不带参数的 `wrangler d1 ... bcailab-db` 作用于**本地**数据库
  （输出会显示 `Resource location: local`），命令照样成功，却完全没碰到生产。
- **`--preview`。** 测试库必须同时带 `--remote --preview`；只写 `--preview` 会被 Wrangler
  拒绝，而漏掉 `--preview` 会命中生产库。
- **`pnpm exec`。** 直接敲 `wrangler` 会用机器上全局安装的版本，与仓库 `package.json` 锁定的
  版本可能不同，行为和默认参数都可能不一致。`pnpm exec` 始终使用仓库锁定的版本。

**关于 `[code: 7403] not authorized to access this service`：** 这个错误是**间歇性**的，
来自 Cloudflare API 而非本地配置。实测同一版本、同一命令会偶发失败一次、随后连续成功，
且 OAuth token 存放在 `~/Library/Preferences/.wrangler/config/default.toml`，为所有版本共用，
因此与 wrangler 版本无关。**直接重试即可**，不要据此去 logout/login 或改动账号权限。
若连续多次都失败，再用 `pnpm exec wrangler whoami` 确认登录状态与账号 ID。

Migration 文件位于 `migrations/` 目录，按编号顺序执行。添加新 migration 后，需要在三个环境中
分别手动应用，且在每个环境都**先迁移、后部署**。

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
检查是否有新 migration 未应用到 preview 数据库：
`pnpm exec wrangler d1 migrations list bcailab-db --remote --preview`。

**Q: 本地 D1 数据丢失？**
`pnpm dev` 使用的本地数据存储在 `apps/web/.wrangler/state/`。根目录默认的
`.wrangler/` 是另一份 state；不要用未带 `--persist-to` 的本地 Wrangler 命令检查或
迁移开发服务器数据库。删除 app state 或切换分支不会自动清除，但如果手动删除则
需要重新运行 `pnpm db:migrate:local`。

**Q: 构建失败？**
Pages 构建命令是 `cd ../.. && pnpm install --frozen-lockfile && pnpm --filter web build`。确保 `pnpm-lock.yaml` 是最新的（本地 `pnpm install` 后提交 lock 文件）。
