# Cloudflare Infra

This project uses Cloudflare Pages + D1 + R2.

## Pages Deployment Configuration

Pages **root directory** is set to `apps/web`. This is intentional:
the Remix `functions/` directory lives at `apps/web/functions/`, and Pages
only picks up a `functions/` dir relative to the configured root.

| Setting | Value |
|---------|-------|
| Root directory | `apps/web` |
| Build command | `cd ../.. && pnpm install --frozen-lockfile && pnpm --filter web build` |
| Build output directory | `build/client` |

The `cd ../..` is required because `pnpm install` must run from the monorepo
root to resolve workspace dependencies (`@bcailab/*`).

Redirects for canonical URLs are managed in `apps/web/public/_redirects`.
Cloudflare Pages applies these at the edge before the request reaches Remix.
Use a method‑preserving redirect for canonical URLs that may receive non‑GET
traffic: `307` (temporary) or `308` (permanent). Many clients will change the
method to `GET` on `301/302`, and `303` always forces `GET`, so `308` is used
here for permanent, method‑preserving canonical redirects.

A `wrangler.toml` exists at **both** the repo root (used by local `wrangler` commands)
and `apps/web/` (picked up by Pages at deploy time). The D1/R2 bindings are
identical in both; keep them in sync manually when changing.

## Setup
1. Create D1 database:
   - `wrangler d1 create bcailab-db`
2. Apply migrations:
   - `wrangler d1 migrations apply bcailab-db --local`
   - `wrangler d1 migrations apply bcailab-db`

## Pages Environment Variables
Set the following for the Pages project:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_TTS_SERVICE_ACCOUNT_JSON`
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (recommended: `gemini-flash-latest`)
- `OAUTH_REDIRECT_URL` (e.g. `https://bcailab.com/auth/callback`)
- `SESSION_SECRET`

Recommended additional settings:
- `PNPM_VERSION` = `9.12.0`
- `NODE_VERSION` = `20`

## Local Development
- `pnpm install`
- `pnpm dev` (uses `remix vite:dev` with a Cloudflare dev proxy)
- Use `remix vite:build` + `wrangler pages dev` for a closer Pages runtime.

## D1 & R2 Bindings
Bindings are defined in `wrangler.toml`. See the "Pages Deployment" section
above for which copy is used where.

## Preview / Staging Environment
Pushing code is not enough for integration testing. You also need preview data resources.

Recommended setup:
- Use Cloudflare Pages **Preview** as the test runtime (no separate Workers service needed for this app).
- Create separate staging resources:
  - D1: `wrangler d1 create bcailab-db-staging`
  - R2: `wrangler r2 bucket create bcailab-assets-staging`
- Apply schema to staging D1:
  - `wrangler d1 migrations apply bcailab-db-staging`
- In Pages project settings, configure **Preview** bindings/env vars:
  - `DB` -> staging D1
  - `R2` -> staging R2 bucket
  - `GEMINI_API_KEY`, `GEMINI_MODEL`, and all auth/session env vars

With this setup, branch push -> Preview deploy -> isolated test database/bucket.
