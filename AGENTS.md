# bcailab AI Working Guide

This repository is intentionally structured for multi-agent collaboration across tools.

## Roadmap Discipline
- `docs/roadmap.md` is the single source of truth for what is **planned and authorized**
  (Now / Next / Later). It is not the delivery record and not an idea list.
- Read it before starting product work. Never add or reprioritize items without explicit owner
  confirmation.
- An item without acceptance criteria is exploratory, not authorized. Ask rather than assume.
- Report finished work as `in_review` with evidence and append the entry to `docs/changelog.md`
  in the same commit/PR. **Only the owner marks work accepted** — never make that transition
  yourself.
- Ideas in `docs/exploration.md` are not authorization. Neither is chat history, nor advice
  from an AI outside this repo.
- The goal: any AI coding tool can pick up where another left off using only the repo's docs.

## Repo Layout
- `apps/` - Product surfaces (`web`, the Remix app; `mapdown`, a Vite SPA — see `docs/mapdown/`)
  - `typescript` is pinned **per package**, not in root overrides: `web` 5.9.3, `mapdown` 7.x.
- `packages/` - Shared libraries (UI, auth, DB, utilities)
- `docs/` - Intent, decisions, specs, and procedures (see the Docs section below)
- `migrations/` - D1 schema, applied in filename order
- `scripts/` - Context packs, material seeding, spikes
- `ai/` - Agent prompts, conventions, and research notes

## Tests
- `pnpm test` (vitest, config at repo root). Scope is deliberately narrow: **pure,
  deterministic logic whose bugs are silent** — scoring, parsing, normalization.
- Route loaders/actions and `*.server.ts` modules need D1/R2 bindings; verify those
  against the running dev server instead of mocking the platform.
- Tests live next to their module as `*.test.ts`, under `apps/web/app/` or `packages/*/src/`.

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

## Commit Discipline
- Every implementation task that changes files should end with a git commit before the final response, unless the user explicitly asks not to commit or the work is incomplete/blocked.
- Inspect `git status` before editing and treat pre-existing or concurrent changes as user-owned.
- Review the final diff and run proportionate verification before committing.
- Stage only files or hunks that belong to the current task. Never bundle unrelated changes unless the user explicitly asks.
- Use a concise descriptive commit message. Report the commit hash.
- Do not push, amend, rebase, or rewrite history unless explicitly asked.
- Read-only tasks and tasks with no file changes do not create empty commits.

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

## User Context Pattern
- `root.tsx` fetches the optional user once and passes it down via `<Outlet context={{ user }} />`.
- Child routes that need the user without an auth check should use `useOutletContext<{ user: User | null }>()` instead of running a separate loader query.
- Routes that **require** authentication call `requireUser()` in their own loader; this redirects to `/?login=1` when unauthenticated.

## Destructive Actions
- Destructive actions must be confirmed before executing. This is non-negotiable; per-tool
  implementations are documented in `docs/tools/`.

## Docs
- Update `docs/` when adding new tools or changing infra.
- Where things live: `docs/roadmap.md` what is planned · `docs/decisions/` why it is like this
  · `docs/changelog.md` what shipped · `docs/exploration.md` unapproved ideas ·
  `docs/ops/`-style procedure docs (`workflow.md`, `infra-cloudflare.md`) · `docs/tools/`
  per-tool behaviour · `docs/access-model.md` what works without an account ·
  `docs/mapdown/` the Mapdown product.
- Repository facts — routes, schema, env var names, dependencies — are **derived**, not
  documented by hand: `pnpm context` generates them from the code. Do not hand-maintain a
  route or schema list in `docs/`.

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
