# bcailab AI Working Guide

This repository is intentionally structured for multi-agent collaboration across tools.

## Roadmap Discipline
- `docs/roadmap.md` is the single source of truth for iteration planning (Now / Next / Later / Done).
- Read it before starting product work; move finished items to Done (with date) in the same commit/PR.
- Never add or reprioritize roadmap items without explicit owner confirmation.
- The goal: any AI coding tool can pick up where another left off using only the repo's docs.

## Repo Layout
- `apps/` - Product surfaces (Remix app, future tools)
- `packages/` - Shared libraries (UI, auth, DB, utilities)
- `docs/` - Architecture and operational docs
- `ai/` - Agent prompts, conventions, and research notes

## Tests
- `pnpm test` (vitest, config at repo root). Scope is deliberately narrow: **pure,
  deterministic logic whose bugs are silent** — scoring, parsing, normalization.
- Route loaders/actions and `*.server.ts` modules need D1/R2 bindings; verify those
  against the running dev server instead of mocking the platform.
- Tests live next to their module as `*.test.ts` under `apps/web/app/`.

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
- **Never expand task scope on your own.** A bug fix is a bug fix; a feature request is that feature. Do not "clean up" surrounding code or add unrelated improvements unless explicitly asked.
- **Assume first, ask only when critical.** If enough information exists to make a reasonable choice, proceed. Only pause to ask when missing information would materially change the approach.

## Task Complexity Handling
- **Trivial** (typo, single-line fix, obvious rename): execute immediately, no confirmation needed.
- **Moderate** (new feature within an existing pattern, small refactor): proceed directly if the user's intent is clear — keywords like "实现", "执行", "加上", "改成" are sufficient signal.
- **Complex** (architectural change, multi-file refactor, new tool): outline the approach briefly before writing code.

## Routing Conventions (Remix flat-file)
- Layout routes use the dot-segment pattern: `text.tsx` wraps `text._index.tsx`, `text.$id.tsx`, etc.
- A child route that should render as an **independent page** (not nested inside its parent) must use `_` to escape nesting.
  Example: `text.$id_.edit.tsx` renders `/text/:id/edit` as a sibling of `text.$id.tsx`, not a child.
  Without the `_`, the parent must render `<Outlet />` or the child page will never appear.
- For index-route mutations inside a layout route (e.g. `esl.reading._index.tsx` under `esl.reading.tsx`), forms should submit with `action="?index"` when the action is defined on the index route.
  Without `?index`, Remix posts to the parent route action by default.

## Tool Route Canonicalization
- Canonical speech routes are `/speech` and `/speech/audio/:id`.
- Keep legacy `/tts`, `/tts/history`, and `/tts/*` redirects for backward compatibility.

## User Context Pattern
- `root.tsx` fetches the optional user once and passes it down via `<Outlet context={{ user }} />`.
- Child routes that need the user without an auth check should use `useOutletContext<{ user: User | null }>()` instead of running a separate loader query.
- Routes that **require** authentication call `requireUser()` in their own loader; this redirects to `/?login=1` when unauthenticated.

## Unauthenticated Interaction
- The homepage is a studio page: product cards link to landing pages. `/english` is public; clicking an **auth-required** module card there (or an auth-required product card like Posts on the homepage) when not signed in opens the Google OAuth popup directly (same popup used by the Header login button). It does **not** navigate to the tool page first. The popup helper lives in `apps/web/app/utils/login-popup.ts`.
- Modules marked `public: true` in `english.tsx` (currently Translate and Dictation) skip the popup and link straight into the tool, which handles anonymous users itself via daily quotas. These are the acquisition funnels — do not gate them behind the popup.
- Modules with a `trialSlug` (currently Reading and Writing) send signed-out users to an anonymous trial route instead of the popup. Trial routes escape their tool's auth-required layout with the `_` route-name prefix (`reading_.trial.tsx`, `writing_.trial.tsx`), persist **nothing**, and enforce their own daily quota via `feature-quota.server.ts`; the popup appears from inside the trial once that quota is spent. Signed-in users hitting a trial route are redirected to the real tool.
- The OAuth flow is popup-based: `window.open("/auth/google", …)` → callback posts a message → parent reloads. There is no standalone login page.

## Delete / Destructive Actions
- Destructive actions must be confirmed before executing.
- Currently implemented via the native `confirm()` dialog on form submit (`onSubmit` handler).
- Delete is available only from the posts list page, not from the edit page. The edit page offers Save and Cancel only.

## Docs
- Update `docs/` when adding new tools or changing infra.

## External Consultation
- To ask an AI outside this repo (ChatGPT, Gemini, a fresh session) for a diagnosis or
  review, generate a context pack rather than pasting docs: `pnpm context [-p arch|product|debug|full]`.
- The pack labels hand-written docs as *(intent)* and code-derived facts as *(derived)*,
  so the consultant can spot drift instead of trusting a stale doc.
- See `docs/external-consultation.md` for profiles, flags, and secret-handling rules.
- Advice that comes back is input, not authorization — roadmap changes still need owner confirmation.

## Documentation Sync Rule
- Any code change that affects external behavior must update docs in the same task/PR.
- External behavior includes route/path changes, API request/response contracts, env vars, DB schema/migrations, auth flow, deployment/infra, user-visible UX rules, and feature constraints.
- Pure internal refactors (no behavior or contract change) do not require doc edits.
- If no doc update is needed, explicitly state `Docs impact: none` with a short reason.
