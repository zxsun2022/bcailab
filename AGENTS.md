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
- Pages deploys from `apps/web` as the root directory; see `docs/infra-cloudflare.md`.
- Environment variables are documented in `docs/infra-cloudflare.md`.

## Editing Rules
- Avoid large sweeping refactors unless requested.
- Keep API responses backward compatible.
- Add tests when behavior changes meaningfully.

## Routing Conventions (Remix flat-file)
- Layout routes use the dot-segment pattern: `text.tsx` wraps `text._index.tsx`, `text.$id.tsx`, etc.
- A child route that should render as an **independent page** (not nested inside its parent) must use `_` to escape nesting.
  Example: `text.$id_.edit.tsx` renders `/text/:id/edit` as a sibling of `text.$id.tsx`, not a child.
  Without the `_`, the parent must render `<Outlet />` or the child page will never appear.

## User Context Pattern
- `root.tsx` fetches the optional user once and passes it down via `<Outlet context={{ user }} />`.
- Child routes that need the user without an auth check should use `useOutletContext<{ user: User | null }>()` instead of running a separate loader query.
- Routes that **require** authentication call `requireUser()` in their own loader; this redirects to `/?login=1` when unauthenticated.

## Unauthenticated Interaction
- On the homepage, clicking a tool card when not signed in opens the Google OAuth popup directly (same popup used by the Header login button). It does **not** navigate to the tool page first.
- The OAuth flow is popup-based: `window.open("/auth/google", …)` → callback posts a message → parent reloads. There is no standalone login page.

## Delete / Destructive Actions
- Destructive actions must be confirmed before executing.
- Currently implemented via the native `confirm()` dialog on form submit (`onSubmit` handler).
- Delete is available only from the posts list page, not from the edit page. The edit page offers Save and Cancel only.

## Docs
- Update `docs/` when adding new tools or changing infra.
