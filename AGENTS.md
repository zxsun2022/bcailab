# bcailab AI Working Guide

This repository is intentionally structured for multi-agent collaboration across tools.

## Repo Layout
- `apps/` - Product surfaces (Remix app, future tools)
- `packages/` - Shared libraries (UI, auth, DB, utilities)
- `docs/` - Architecture and operational docs
- `ai/` - Agent prompts, conventions, and research notes

## Conventions
- Prefer small, focused commits and clear diffs.
- Keep public interfaces typed and documented.
- Avoid hidden magic: configs should be explicit and minimal.
- Follow the design tokens defined in `apps/web/app/styles/global.css`.

## Cloudflare
- IaC is managed via `wrangler.toml` + `migrations/`.
- Environment variables are documented in `docs/infra-cloudflare.md`.

## Editing Rules
- Avoid large sweeping refactors unless requested.
- Keep API responses backward compatible.
- Add tests when behavior changes meaningfully.

## Docs
- Update `docs/` when adding new tools or changing infra.
