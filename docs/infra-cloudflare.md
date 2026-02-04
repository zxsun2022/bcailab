# Cloudflare Infra

This project uses Cloudflare Pages + D1 + (future) R2.

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
- `OAUTH_REDIRECT_URL` (e.g. `https://bcailab.com/auth/callback`)
- `SESSION_SECRET`

## Local Development
- `pnpm install`
- `pnpm dev` (uses `remix vite:dev` with a Cloudflare dev proxy)
- Use `remix vite:build` + `wrangler pages dev` for a closer Pages runtime.

## D1 & R2 Bindings
Bindings are defined in the root `wrangler.toml`.
