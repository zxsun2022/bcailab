# Cloudflare Infra

This project uses Cloudflare Pages + D1 + R2.

## Session maintenance Worker

Pages Functions do not expose a Pages `scheduled()` entrypoint. Session cleanup therefore
runs as the separate `bcailab-session-cleanup` Worker in `workers/session-cleanup/`, which
uses the same production and preview D1 bindings as the Pages app. Its Wrangler Cron Trigger
runs daily at **03:17 UTC** and deletes at most 100 expired rows from each of the Studio
sessions, Mapdown sessions and Mapdown handoff-nonce tables. Re-running a batch is safe because
each delete is idempotent. Deploy the cleanup change only after migration 0019 exists.

Deploy or inspect the Worker from the repository root:

```sh
pnpm exec wrangler deploy --config workers/session-cleanup/wrangler.toml
pnpm exec wrangler tail bcailab-session-cleanup --config workers/session-cleanup/wrangler.toml
```

The Worker is intentionally separate from the Pages deployment; do not add its trigger to a
Pages `wrangler.toml` or expect a Pages build to schedule it.

## Pages Deployment Configuration

Pages **root directory** is set to `apps/web`. This is intentional:
the Remix `functions/` directory lives at `apps/web/functions/`, and Pages
only picks up a `functions/` dir relative to the configured root.

| Setting | Value |
|---------|-------|
| Root directory | `apps/web` |
| Build command | `cd ../.. && pnpm install --frozen-lockfile && pnpm --filter web build` |
| Build output directory | `build/client` |
| Build watch include paths | `apps/web/*`, `packages/*` |

The `cd ../..` is required because `pnpm install` must run from the monorepo
root to resolve workspace dependencies (`@bcailab/*`).

Mapdown is a second Git-connected Pages project:

| Setting | Value |
|---------|-------|
| Project | `mapdown` |
| Production URL | `https://map.bcailab.com` |
| Published custom domain | `https://share.bcailab.com` |
| Root directory | `apps/mapdown` |
| Build command | `cd ../.. && pnpm install --frozen-lockfile && pnpm --filter mapdown build` |
| Build output directory | `dist` |
| Build watch include paths | `apps/mapdown/*`, `packages/*` |

Both projects must retain their narrowed watch paths; otherwise every monorepo push triggers
two Pages builds.

Redirects for canonical URLs are managed in `apps/web/public/_redirects`.
Cloudflare Pages applies these at the edge before the request reaches Remix.
Use a method‑preserving redirect for canonical URLs that may receive non‑GET
traffic: `307` (temporary) or `308` (permanent). Many clients will change the
method to `GET` on `301/302`, and `303` always forces `GET`, so `308` is used
here for permanent, method‑preserving canonical redirects.

A `wrangler.toml` exists at the repo root (used by local `wrangler` commands) and in
`apps/web/`. Mapdown uses `apps/mapdown/wrangler.jsonc`; it binds the same D1 database and R2
bucket for account save and publication, while keeping its own session table. Keep database
and bucket ids in sync when resources change. `_routes.json` sends only `/api/*` and `/p/*`
through Functions; editor assets remain static.

The app-local Pages configs are required even though output directories are also set in
the dashboard. A monorepo build command changes to the repository root, where Wrangler
otherwise discovers the root `pages_build_output_dir` for the wrong app.

## Setup
1. Create D1 database:
   - `pnpm exec wrangler d1 create bcailab-db`
2. Apply migrations:
   - `pnpm db:migrate:local` (uses the same `apps/web/.wrangler/state` as `pnpm dev`)
   - `pnpm exec wrangler d1 migrations apply bcailab-db --remote` — **`--remote` is required.** Without
     it, wrangler 4.x targets the *local* database and reports success while production stays
     unmigrated. Always apply a migration **before** deploying code that reads the new column
     or table; see `docs/workflow.md` §正式环境上线.

## Pages Environment Variables
Set the following for the Pages project:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_TTS_SERVICE_ACCOUNT_JSON`
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (recommended: `gemini-flash-latest`)
- `GEMINI_BASE_URL` (optional; point at Cloudflare AI Gateway instead of the Google API origin)
- `OAUTH_REDIRECT_URL` (e.g. `https://bcailab.com/auth/callback`)
- `SESSION_SECRET`
- `SESSION_SECRET_PREVIOUS` (optional; old session signing secret during rotation only)
- `MAPDOWN_HANDOFF_SECRET` (dedicated high-entropy HMAC secret; must match the Mapdown Pages
  project and must not reuse `SESSION_SECRET`)
- `MAPDOWN_PREVIEW_ORIGIN` (optional; exact stable Mapdown Preview origin,
  `https://staging.mapdown.pages.dev`; never use a wildcard or an arbitrary commit-preview URL)
- `RESEND_API_KEY` (email OTP sign-in codes; set via `wrangler pages secret put RESEND_API_KEY`)
- `RESEND_FROM` (optional; default `bcailab <login@bcailab.com>` — the domain must be verified in Resend with SPF/DKIM DNS records)

Without `RESEND_API_KEY`, email sign-in still works in local dev: the code is logged to the
server console and shown inline in the dev UI.

The Mapdown Pages project requires `MAPDOWN_HANDOFF_SECRET` as a secret and the checked-in
`WEB_ORIGIN`, `MAPDOWN_ORIGIN`, and `PUBLISHED_ORIGIN` vars. Production D1/R2 bindings are in
`apps/mapdown/wrangler.jsonc`; confirm equivalent Preview bindings in the Pages dashboard.

Cross-app Preview sign-in requires a stable branch alias for **both** Pages projects and these
settings in their Preview environments:

- Web: `MAPDOWN_PREVIEW_ORIGIN=https://staging.mapdown.pages.dev`.
- Mapdown runtime: `MAPDOWN_ORIGIN=<the same exact stable Mapdown Preview origin>` and
  `PUBLISHED_ORIGIN=<that Preview origin, or an exact dedicated Preview share origin>`. Do not
  leave `PUBLISHED_ORIGIN` pointing at production or Preview publications will resolve against
  the production deployment and database.
- Mapdown build: the checked-in Vite config maps Cloudflare's `CF_PAGES_BRANCH=staging` to
  `https://staging.bcailab.pages.dev`, so the popup and its nonce are created by Preview Web
  rather than production Web. An explicit `VITE_WEB_ORIGIN` remains available as an override.
- Both projects: the same `MAPDOWN_HANDOFF_SECRET` and the same Preview D1 binding. The checked-in
  configs currently share preview database id `8707dea1-f2f7-4a3c-99ee-2245cb63e22c`.

All origins are HTTPS roots with no path, query, fragment, or credentials. Commit-specific
`*.pages.dev` hosts remain rejected so an untrusted preview cannot receive a handoff token.

Recommended additional settings:
- `PNPM_VERSION` = `9.12.0`
- `NODE_VERSION` = `20`

### Session secret rotation

The cookie signer always writes new cookies with `SESSION_SECRET` and accepts
`SESSION_SECRET_PREVIOUS` for verification. For a rotation:

1. Generate a new high-entropy secret and set it as `SESSION_SECRET` in both Pages Production
   and Preview environments.
2. Set the former value as `SESSION_SECRET_PREVIOUS` in the same environments. Keep this
   compatibility value for the 30-day maximum cookie lifetime.
3. After that window, remove `SESSION_SECRET_PREVIOUS` with the Pages secret-management UI or
   `wrangler pages secret delete SESSION_SECRET_PREVIOUS --project-name <project>`.

During the compatibility window, rollback means restoring the former value as `SESSION_SECRET`
and redeploying before removing the previous-secret value. Never commit either secret to the
repository or place it in `.dev.vars` shared with other developers.

## Local Development
- `pnpm install`
- `pnpm dev` (uses `remix vite:dev` with a Cloudflare dev proxy)
- Use `remix vite:build` + `wrangler pages dev` for a closer Pages runtime.

## D1 & R2 Bindings
Bindings are defined in the root/Web `wrangler.toml` files and Mapdown's
`wrangler.jsonc`. See the "Pages Deployment" section above for which copy is used where.

### Mapdown save/publish release order

1. Apply `0019_mapdown_cloud.sql` and `0020_mapdown_publication_png.sql` to Preview, verify them,
   then apply them to production with `pnpm exec wrangler d1 migrations apply bcailab-db --remote`.
2. Add the same new `MAPDOWN_HANDOFF_SECRET` value to both the Web and Mapdown Pages projects.
3. Confirm Mapdown's `DB` and `R2` bindings and attach `share.bcailab.com` as a second custom
   domain on the Mapdown Pages project.
4. Deploy Web and Mapdown, then deploy `bcailab-session-cleanup`.
5. Verify production and configured Preview sign-in exchange, explicit first save,
   stale-version rejection, publish, public SVG, PNG `og:image`, and unpublish returning an
   uncached 404. Do not deploy code that reads the new tables or `png_key` before step 1.

### Publication reports and takedown

Open reports are operational records, not product analytics. Inspect only the fields needed for
moderation; `reporter_digest` is an HMAC digest and must not be treated as an identity. Query:

```sql
SELECT id, public_id, reason, details, created_at
FROM mapdown_publication_reports
WHERE status = 'open'
ORDER BY created_at ASC;
```

After an authorized moderation decision, revoke in D1 first by setting `revoked_at` and
`updated_at` for the exact `public_id` while `revoked_at IS NULL`; verify `/p/{public_id}` is
404; then delete the row's exact `svg_key` and, when present, `png_key` from R2. Mark the matching
reports `actioned` only after revocation. Never use an unresolved wildcard or bulk delete for
takedown.

## Preview / Staging Environment
Pushing code is not enough for integration testing. You also need preview data resources.

Recommended setup:
- Use Cloudflare Pages **Preview** as the test runtime (no separate Workers service needed for this app).
- Create separate staging resources:
  - D1: `pnpm exec wrangler d1 create bcailab-db-staging`
  - R2: `wrangler r2 bucket create bcailab-assets-staging`
- Apply schema to staging D1:
  - `pnpm exec wrangler d1 migrations apply bcailab-db-staging --remote`
- In Pages project settings, configure **Preview** bindings/env vars:
  - `DB` -> staging D1
  - `R2` -> staging R2 bucket
  - `GEMINI_API_KEY`, `GEMINI_MODEL`, and all auth/session env vars
  - for Mapdown handoff, the paired stable Preview origins and shared secret described under
    "Pages Environment Variables"; Web and Mapdown must bind the same staging D1 because the
    nonce is created by Web and consumed by Mapdown

If preview/staging is missing newer D1 migrations, tool routes that depend on
them may be unavailable. In particular, the current `/writing` catalogue requires
`0007_writing.sql` and `0016_writing_prompts.sql`.
The UI now shows an unavailable state instead of crashing, but the migration
still needs to be applied for the tool to work.

With this setup, branch push -> Preview deploy -> isolated test database/bucket.
