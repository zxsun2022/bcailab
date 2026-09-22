# Architecture Overview

bcailab is a small tools platform running on Cloudflare. A shared auth system gives users a consistent login experience across tools while each tool can keep isolated data and logic.

## Components
- **Remix app** (`apps/web`): Landing page, auth flows, tool UIs.
- **Shared packages** (`packages/*`): UI primitives, auth helpers, D1 access helpers.
- **Mapdown** (`apps/mapdown`): a local-first Markdown mind-map editor for
  `map.bcailab.com`. Its Vite + React SPA owns its visual system and uses a small same-origin
  Pages Functions API for explicit account save. A single-use handoff creates an independent
  Mapdown session instead of sharing the Studio cookie. Frozen public snapshots are served from
  the cookie-free `share.bcailab.com` host. It is the
  one package on **TypeScript 7** while `apps/web` stays on 5.9.3 — `typescript` is pinned per
  package rather than in the root `pnpm.overrides` (docs/mapdown/decisions.md D-13).
  See docs/mapdown/.
- **D1**: Primary relational store for users, sessions, and tool data.
- **Material layer**: Dictation and Reading share one graded passage store (`passages`,
  `passage_sentences`, `passage_tags`, `passage_stats`), so a single passage can drive both
  listening and reading-aloud practice. `user_id IS NULL` marks global library content.
  See docs/material-layer-design.md.
- **Learner model**: Eligible Dictation and Reading results write per-tag observations
  (`learner_tag_observations`, keyed on the `passage_tags` vocabulary) which aggregate into a
  shared profile (`esl_learner_profiles`, generalised beyond reading: per-tag mastery + a CEFR
  estimate). Dictation is the precise signal (deterministic diff ops); reading is a
  down-weighted LLM-judged one. A background pass names patterns for the learner; it does not change mastery measurements.
  Writing feedback does not currently write measurement observations. Surfaced at `/english/progress`. See docs/learner-model-design.md.
- **Grader context**: what a grader is *told* about the learner is a separate layer from what the
  learner model measures. Each grader call assembles a bounded learner brief (`learner-context.ts`)
  that is never stored: tag accuracy states its provenance, and earlier AI feedback is labelled as
  such. Dictation and signed-in Writing feedback receive their respective projections; Reading
  remains behind the roadmap's bias-evaluation gate. See
  docs/decisions/0010-grader-context-is-separate-from-measurement.md.
- **R2**: Binary storage for generated tool assets (Speech MP3 + ESL reading attempt/reference audio).
  These are private user data served behind auth. The one exception is the `dictation/` prefix:
  global app content (pre-generated per-sentence MP3s), served publicly with immutable caching —
  see docs/tools/dictation.md. Mapdown's script-free published SVGs are also public, but only
  while their D1 publication record remains active.

## Design System
See [design-system.md](./design-system.md) for visual design guidelines including:
- Color palette, typography, spacing
- Border radius system (coordinated with serif fonts)
- Component patterns and usage examples

## LLM Calls
All model calls go through `apps/web/app/utils/llm.server.ts`, which owns the task → model
routing table (e.g. anonymous translation uses a cheaper model). The optional `GEMINI_BASE_URL`
env var can point calls at Cloudflare AI Gateway without code changes.

The task routing table in that module is the source of truth for current model IDs and
`envModelOverride` behavior. Do not infer a live model choice from dated rollout notes.

`callGemini` returns the whole response; `streamGemini` is the incremental variant over
`:streamGenerateContent?alt=sse`, used where the user watches output arrive (currently Translate
only). Both share the routing table, so a task streams or not without changing which model serves it.

## Key Flows
- Sign-in happens in a popup at `/login`, offering three methods: Google OAuth, an email
  one-time code (for users who cannot reach Google), and — once a user has set one — an
  email + password sign-in. Email is the primary identity; a Google login with a matching
  email attaches to the same account.
- Accounts are **passwordless by default**. A password is optional: a signed-in user can set
  one from `/profile`, after which they may also sign in with it. "Forgot or never set a
  password?" on `/login` reuses the same email OTP to verify ownership and set a new password,
  signing the user in. Passwords are stored as PBKDF2-HMAC-SHA256 hashes (WebCrypto, per-user
  salt) in `users.password_hash`; the hash never reaches the client (`User` omits it).
- Google OAuth handled in the Remix app; sessions are stored in D1 and referenced by a secure cookie.
- Email OTP codes are sent via Resend (`RESEND_API_KEY`); in local dev without the key, the
  code is logged to the server console and shown in the dev UI. The same OTP backs both
  code sign-in and password reset.
- Tools are protected behind login; public pages are selectively accessible (e.g. published post pages).
- Signed-in users can switch `Auto` / `Light` / `Dark` theme from the avatar menu or tool settings pages; the preference is stored locally in the browser.

## Navigation and surface ownership

English Studio separates its public landing surface from the authenticated Home. The shared
module registry drives product navigation and anonymous entry behavior; the product rail contains
destinations, not tool history. Writing sessions, saved translations and Speech history belong to
their respective main workspaces. See [the shell contract](studio-app-shell.md) and
[access rules](access-model.md).

Home is action-first: Continue and a recommendation, a compact basis line, and recent practice.
Retrospective ability/coverage/trend information lives on Progress; Home has no status grid.
Its bounded recommendation and record-publication inputs recover independently, with unavailable
profile data labelled as such. See [Home behavior](english-studio-ia-v2-design.md#33-home--action-zone-top-of-viewport).

Writing's entry is an assignment catalogue; freeform creation and existing sessions are separate
surfaces. Article detail owns the editor, revision navigation and feedback aside. The shared
Studio shell owns navigation and framing. See [Writing](tools/writing.md).

**Interface language.** One URL renders in English or Simplified Chinese
([ADR 0011](decisions/0011-chinese-ui-same-url-feedback-follows-interface.md)). The root loader
resolves the locale — an explicit `bcailab_locale` cookie, then `Accept-Language`, then English —
and passes it down through a `LocaleProvider` (not the `{ user }` Outlet context) and, for route
`meta`, through the matches. Document and root-data responses vary on `Cookie, Accept-Language`.
`POST /locale` sets the cookie and returns the visitor to the page they were on. Copy lives in two
typed catalogues under `apps/web/app/i18n/messages/`, the Chinese one typed against the English
one; the module registry keeps routing and access and no longer carries copy. Learning material
is never translated. Rollout and coverage: [the design](chinese-ui-design.md).

For the actual route/module inventory, run `pnpm context -p arch` as described in
[external consultation](external-consultation.md). Route filenames and exports are derived at
pack generation time; this document deliberately does not duplicate that complete list.
