# Roadmap

**This file is the single source of truth for what is planned and authorized.** It is not the
delivery record and not an idea list; both were split out on 2026-08-01 (see the end of this
file). Any AI coding tool (Claude Code, Codex, etc.) or human working in this repo should:

1. Read this file before starting product work, to know what the current iteration is.
2. Only add or reprioritize items after the owner (Z.Sun) confirms — never unilaterally.
3. Report finished work as `in_review` with evidence; append the entry to `docs/changelog.md`
   in the same PR. **Only the owner marks work accepted** — an agent does not make that
   transition on its own.
4. An item without acceptance criteria is exploratory, not authorized. Ask rather than assume.

Product direction (agreed 2026-07): bcailab is a studio; **English Studio** is the flagship
product (an AI English coach: read, write, listen, translate). Translate is the free,
no-account acquisition funnel into it. A second product, **Mapdown**, was added 2026-08-01 —
a static, local-first Markdown mind-map editor at `map.bcailab.com`, sharing this repo's
infrastructure and eventually its accounts, but branded and styled independently (see Next).

## Now — English Studio material, memory, and interaction iteration

The owner authorized this iteration and decisions D1-D5 on 2026-08-09. Implementation
continued past the original branch: `codex/english-studio-major-iteration` is now fully
contained in **`codex/ui-navigation-polish`**, which carries the UI/IA work that followed and
is the branch to review. The detailed design and failure registry live in
[the iteration plan](english-studio-major-iteration-proposal.md); what has shipped and its
acceptance state is in [the changelog](changelog.md). Only the owner moves an item to
accepted.

### Product boundary and invariants

- This branch covers English Studio only. Mapdown Create with AI remains authorized in Next,
  but is a separate branch and release.
- Prompt levels are discovery metadata, not measured ability. Never render a null level as B1
  and never lock material by band.
- Translation text is persisted only after an explicit signed-in **Save** action. There is no
  automatic history or anonymous persistence.
- Writing-to-profile measurement remains deferred. Prompt metadata must allow a future writing
  vocabulary without claiming that the vocabulary exists now.
- New Reading evaluations stop requesting `next_drills`; stored historical feedback that has
  the field must remain readable.

### A. Writing prompt bank and guided entry — accepted

- Add a reviewable `writing_prompts` contract with stable identity, family/task type, prompt
  text, optional CEFR discovery band, topic, target words, optional reviewed asset, provenance,
  editorial status, and timestamps. Add a nullable prompt reference to writing articles while
  preserving the article's assignment as an immutable snapshot.
- Add deterministic intake/validation and idempotent publication tooling. The first batch is
  exactly 48 original prompts: 24 general prompts (six each for A2/B1/B2/C1), 12 IELTS
  Academic Task 1 prompts with reviewed chart/table/process/map assets, and 12 IELTS Task 2
  prompts across the four common task families.
- Generated artifacts may be committed as drafts, but no prompt becomes published until
  automated validation, an independent content review, and owner review of all flagged items
  plus the agreed sample are complete.
- Make `/writing` a material-led catalogue with family/task filters, visible learner work and
  progress, and repeated attempts as distinct articles. Preserve freeform writing at
  `/writing/new`; no prompt may be hidden because of level.
- Starting a published prompt must use its correct coach, target, and asset and save both its
  stable prompt reference and immutable assignment snapshot. Draft/retired prompts never
  appear or start; retiring/editing a prompt never rewrites existing work.
- Add a distinct IELTS Academic Task 1 evaluation contract. The anonymous trial uses one
  reviewed featured prompt without gaining catalogue access, persistence, or extra quota.

Acceptance evidence: validation/parser unit tests; a 48-item manifest with zero validator
errors and review status; local D1 checks for published/draft/retired visibility, immutable
snapshots, and repeated attempts; browser coverage for catalogue, prompt detail/start,
freeform entry, Task 1/Task 2, trial, progress, mobile, keyboard, and reduced motion.

Review evidence (2026-08-10): deterministic validation passes for all 48 source prompts
(24 general, 12 Task 1, 12 Task 2); all 12 derived Task 1 assets and the review pack match
batch hash `38d84de9ab133f3308d3ac95ec24a06c243ef60f58b6bcfc9a08244836864078`.
Fresh local D1 applies all 17 migrations with no foreign-key violations; browser/D1 fixtures
cover no-write preview, atomic/idempotent first submission, immutable snapshots, feedback
retry generations, failure recovery, trial, and responsive catalogue/detail layouts.

Publication status (2026-08-10): the batch is approved and published to development and
production D1; `/writing` serves all 48 assignments. The approval was recorded by a single
reviewer — the owner acted as both independent content reviewer and approving owner, with no
second party — in `docs/approvals/writing-prompts-38d84de9.json`. A second-party content
review is therefore still outstanding as a quality step, and would need a fresh manifest.
Publication does not by itself make this item accepted; only the owner makes that transition.

### B. Saved translations — accepted

- Add private, user-owned saved translations containing the source/result language metadata
  and timestamps. Saving is explicit, signed-in only, retry/double-click idempotent, and
  available after the existing popup-auth handoff without losing the in-memory result.
- Add an authenticated, bounded/paginated `/translate/saved` workspace with list/detail and
  confirmed hard delete. Every read and mutation is user-scoped; foreign and absent ids are
  indistinguishable. Failed/partial streams cannot be saved.
- Keep the feature out of the universal navigation rail: it is history inside the Translate
  workspace, consistent with the English Studio information architecture.

Acceptance evidence: pure validation/idempotency tests where applicable; local D1 checks for
no implicit or anonymous persistence, owner-only save/read/delete, retry stability, bounded
queries, and deletion; browser coverage for anonymous-to-auth Save, list/detail/delete,
mobile, keyboard, and failure recovery.

Review evidence (2026-08-10): proof tests cover tampering, expiry, subject changes,
normalization, size limits, and anonymous-to-auth handoff. Local D1/browser fixtures cover
explicit-only persistence, replay idempotency, snapshot integrity, two-user isolation,
same-result 404s, 25-row keyset pagination, confirmed hard delete, no-JavaScript redirect,
failed streams, and consecutive results that do not inherit `Saved` state. Private responses
use `Cache-Control: private, no-store`; no remote migration or deployment was performed.

### C. Shared interaction and layout correctness — accepted

- On narrow Translate layouts, keep the primary action reachable and reveal completed output;
  long input grows to a bounded height and the page owns ordinary reading scroll. Preserve
  streaming, selection, keyboard shortcuts, reduced motion, and no-JavaScript behavior.
- The mobile navigation drawer traps focus, makes covered content inert, closes by Escape and
  backdrop, locks background scroll, and restores focus. Navigation remains usable if drawer
  JavaScript fails.
- Give Reading's record control a state-dependent accessible name.
- Replace the duplicate Reading/Writing feedback-language keys with one English Studio
  preference, one-time compatibility fallback, and same-tab updates.
- Replace the five native web-app `confirm()` calls with one accessible branded dialog,
  including cancel/confirm, keyboard, pending, and return-focus paths. Mapdown is excluded.
- Replace Writing's static evaluation wait with honest narrative progress while preserving
  retry/failure behavior; do not add fake progress to Translate's real stream.

Acceptance evidence: relevant unit tests plus browser QA at desktop/tablet/mobile widths,
keyboard-only, reduced motion, and screen-reader accessibility-tree inspection. The four
planning-baseline failures (Translate mobile reveal, drawer focus escape, unnamed Reading
record control, unguided Writing trial) must all be closed without new console errors.

Review evidence (2026-08-10): browser QA at 375, 768, and 1280px verifies Translate action
reachability, output reveal, drawer `inert`/focus loop/Escape restoration, dialog role/title/
description/return focus, and Writing catalogue/detail layouts with no console errors.
Standard-tier QA found and fixed two remaining touch-target defects; the relevant Writing
links and Translate language selectors now measure 44px. Reduced-motion rules are present in
the production bundle; dynamic emulation was best-effort only because the isolated browser's
CDP allowlist rejects `Emulation.setEmulatedMedia`.

Acceptance-review follow-up (2026-08-10): nested Writing loaders now preserve the schema
unavailable state during Remix's parallel loading; trial submission is server-pinned to the
single featured slug; first-submit keys survive loader revalidation; article deletion retains
learner revisions; and recent-piece dates use the hydration-safe local formatter. Translation
completion is now independent from Save-proof eligibility, so output beyond the 40,000-character
Saved limit still completes and consumes quota without exposing Save. The first-batch census
was moved out of the shared prompt domain into seed policy, canonical sorting is locale
independent, publish SQL has explicit typed quoting, and the seed pipeline joins root
typecheck/tests. Mobile touch sizing is scoped to intended Studio controls, and destructive
form triggers cannot submit without the confirmation JavaScript path.

### D. Reading evaluation dead output — accepted

Remove `next_drills` from new evaluation prompts and generated schemas. Keep read compatibility
for existing stored payloads and leave the future one-tap drill/session lifecycle deferred.

Acceptance evidence: parser fixtures prove old feedback still loads; prompt/schema tests prove
new evaluations do not request or require `next_drills`.

Review evidence (2026-08-10): compatibility fixtures load legacy `next_drills`, while prompt
and schema tests prove new Reading evaluations neither request nor generate the field. The
full repository suite passes 558 tests.

### E. Scalable Studio navigation and material discovery — accepted

The owner authorized this follow-up on 2026-08-10 after reviewing the current desktop Writing
and Coach Home surfaces. It changes information architecture and presentation, not the
underlying learning, recommendation, or evaluation policies.

- Replace the heavy desktop rail treatment with a quieter, narrower navigation spine. Keep
  destinations, active state, account access, mobile drawer behavior, keyboard behavior, and
  the existing English Studio product boundary intact.
- Make `/english/home` action-first: continuation is primary, the coach recommendation is
  secondary, level/practice/coverage form a compact status summary, and detailed skills and
  recent activity read as lists rather than a dashboard card mosaic. Preserve the current
  recommendation seam and all null-level/no-locking invariants.
- Make `/writing` a category hub instead of rendering the complete prompt bank. It must expose
  General English, IELTS Academic Task 1, IELTS Academic Task 2, recent learner work, and the
  freeform path; a category selection opens a bounded catalogue and every published prompt
  remains reachable regardless of CEFR band.
- Keep catalogue state in the URL, query only the selected family/task and page, and use a
  bounded continuation mechanism rather than a client-side fetch of the whole bank. The
  resulting material-directory contract must be reusable by future Reading and Dictation
  catalogues without forcing material taxonomy onto Translate or Speech.
- Preserve the established editorial design tokens, responsive reading order, 44px primary
  touch targets, visible keyboard focus, reduced-motion behavior, and accessible names.
- Use **Session** for one durable Writing workspace and **Round** for a revision inside it.
  Rename the Writing hub's recent-work section accordingly and provide an authenticated,
  bounded `/writing/sessions` history where every non-deleted session remains reachable.

Acceptance evidence: focused query/filter/pagination tests; browser coverage at 375, 768, and
1280px for rail, Home, Writing hub, category catalogue, prompt detail, and continuation;
keyboard-only and reduced-motion checks; no new console errors; and the full repository test,
typecheck, and production build. Writing session history additionally covers empty, populated,
continued-page, and mobile layouts without loading an unbounded article collection. New materials, Reading/Dictation catalogue implementation,
global search, and a taxonomy/schema expansion are explicitly outside this follow-up.

Review evidence (2026-08-10): `/writing` now queries three collection counts instead of the
complete prompt bank; `/writing/library` keeps category, level/task-family, and opaque keyset
continuation state in the URL and reads at most 13 rows to render a 12-item page. The first
page promotes three non-duplicated assignments into the retained prompt-card treatment, then
uses compact rows for the remaining bank. Authenticated browser checks cover the rail, cold
Coach Home, Writing hub, catalogue, second-page continuation, drawer focus/Escape restoration,
visible keyboard focus, and 44px mobile actions at 375/768/1280px with no horizontal overflow.
Owner-review follow-up moves shallow detail return links to the leading edge and uses compact
breadcrumbs for Writing's real hub → collection → prompt hierarchy, including category-aware
prompt return destinations. Prompt-backed learner work extends that context through the source
assignment to the current piece; freeform work keeps a compact Writing → piece trail.
The in-app browser injects `#codex-browser-sidebar-comments-root` as a third child of `<html>`,
which produces Remix hydration warnings in that test surface; standalone browser checks are
clean, and no application runtime error was observed. The full suite passes 561 tests, Web
typecheck passes, and the production build succeeds.

Session-history follow-up (2026-08-10): Writing now uses Session for one durable workspace
and Round for an in-session revision. `/writing` exposes six recent sessions and links to the
authenticated `/writing/sessions` history; the history reads 21 rows to render a 20-item page
with a stable opaque continuation cursor. Cursor/unit coverage includes first and continued
pages. Authenticated empty-state browser QA at a 351px content width verifies breadcrumb
semantics, 44px actions, and no horizontal overflow. The full suite now passes 564 tests;
Web typecheck and the production build pass.

Filter-interaction follow-up (2026-08-10): bounded Writing catalogues expose every available
level or task-family choice as a direct URL-backed link, including All. Selection immediately
loads the filtered first page without an intermediate Apply action; native link semantics keep
the interaction available to keyboards and without JavaScript.

Home-density follow-up (2026-08-10): the action zone groups continuation and recommendation
into two lightweight, equal-height panels; recommendation alternatives become subordinate
text actions rather than competing buttons. The status summary moves closer in one bounded
strip, and a lone detail section uses the full available width instead of reserving an empty
second column. Authenticated cold-state QA at 351px verifies reflow, 44px primary and level
actions, and no horizontal overflow; the full suite, Web typecheck, and production build pass.

Owner-review correction (2026-08-11): removed the equal-height framed Home panels after they
turned useful whitespace into visible empty card space. Continue now leads with a single
editorial rule, the recommendation stays unboxed, alternatives form a stable vertical action
list, and status uses open dividers instead of another container. Null-level recommendations
no longer claim to fit a known level; learners with history but no estimate regain the direct
level picker; Coverage reads the practised passage bands rather than the bounded recommendation
window; and Writing continuation names its last edit. Translate and Speech now share the same
title → workspace tabs → tool canvas rhythm: Translate uses a bounded two-pane workspace with
visible From/To labels, while Speech uses a narrower unboxed compose surface with a persistent
text label, linked help/count text, visible focus, and a mobile-sized editor that keeps Generate
in the first viewport. Browser checks at a 351px content width confirm no horizontal overflow
and first-viewport primary actions on Translate and Speech; all 564 tests, root typecheck, and
the production build pass.

History-surface follow-up (2026-08-11): Saved translations and Speech History no longer
repeat creation actions that are already available through their workspace tabs. Saved
translations keeps Translate as the single return path; Speech History removes its second,
oversized History heading and begins directly with the generation list or concise empty state.

Translate focus follow-up (2026-08-11): the composer keeps a clear two-pixel keyboard focus
indicator, inset within the input so it no longer obscures the two-pane divider or workspace
boundaries.

### Explicitly excluded from this iteration

Mapdown Create with AI; writing-to-profile measurement; Dictation v2/session matching;
long-document translation; first-token/provider/AI-Gateway work; model-routing hot config;
LLM-signal weight promotion; Chinese UI; paid tier; profile settings; and further
Reading/Dictation library expansion.

## Now — Mapdown production MVP

The owner authorized Mapdown implementation through the Phase 2 production-MVP exit criteria
on 2026-08-04. Phase 1 merged in PR #26; Phase 2 implementation and deployment are complete
and **accepted** (owner, 2026-08-15). Its acceptance criteria
are `docs/mapdown/spec/phases.md` §4 plus the scenario matrix in
`docs/mapdown/spec/testing-acceptance.md`.

The owner additionally authorized three Mapdown stabilization checkpoints on 2026-08-04:

- **P0 active-draft persistence — accepted.** Text visible in the editing textarea must be
  included in the debounced local snapshot before the editing session commits; direct refresh
  inside and after the debounce window must restore it; the saved indicator must track the
  visible draft; typing must retain one undo group; the textarea, node box and connectors must
  follow the visible draft in real time without creating per-keypress history entries; and
  leaving the empty node created by Enter must remove only that empty node, never the text that
  Enter just committed. Double-clicking a node must continue editing at the end of its existing
  label; `F2` remains the select-all replacement path.
- **Visual polish — accepted.** Reduce the top-level toolbar to a
  clear 6–7-control information hierarchy without losing commands; establish primary,
  secondary and quiet control styles; replace the unstyled theme picker; distinguish selection
  from node type; improve connector and collapse-control legibility; and establish consistent
  chrome spacing, typography and focus treatment. Keep chrome visuals out of document themes
  and exported SVG/PNG. Before increasing node typography, align layout measurement with
  rendered font metrics. Verify desktop, tablet, mobile, keyboard and reduced-motion behavior.
- **Interaction-state clarification — accepted.** Editing Enter must commit only and return
  the same node to selected mode; selected-mode Enter must create exactly one sibling/root
  child; a new empty leaf must not multiply on repeated Enter. The state machine must be
  recorded as an event/guard/action/next-state table. Markdown, SVG and PNG downloads must use
  the sanitized current root label with a safe fallback. `⌘0`/`Ctrl+0` must restore canvas zoom
  to 100% without changing viewport centre, document content or semantic history.

The owner authorized a fourth and fifth Mapdown checkpoint on 2026-08-06:

- **Canvas affordances — accepted.** Four independent items, each shippable
  alone. (a) Move the zoom control out of the status bar and View menu into a floating
  bottom-left capsule (− percent +), where clicking the percentage restores 100%; the View
  menu keeps its entries. (b) Show a dismissable hint line on an untouched empty map naming
  the two authoring keys (Enter = sibling, Tab = child); it must disappear once the map has
  any content beyond the root and must never appear in an export. (c) Choose the initial
  document theme from the system colour scheme — light systems open Minimal Light, dark
  systems open Dark — as an **initial value only**: once the user picks a theme, or a stored
  document carries one, the system preference is ignored for that document. (d) Give nodes a
  hover treatment distinct from both the selected and the editing state. Acceptance for all
  four: chrome visuals stay out of document themes and exported SVG/PNG; keyboard and
  screen-reader behaviour is unchanged; verified at desktop, tablet and mobile widths and
  under reduced-motion.
- **Theme differentiation — accepted, all three steps.** The four presets read as hue variants
  of one design because the branch palette reaches only connector strokes: `branchColorFor()`
  is consumed for stroke colour alone, so node fills always come from a single per-role token
  and no theme can look structurally different from another. Three ordered steps, each
  shippable alone.
  1. **Palette reaches the nodes.** In `by-first-level-branch` mode the branch colour must
     drive first-level node fill as well as connector stroke, with node text switched to the
     accessible contrast partner of that fill. Descendants follow the theme's existing
     `descendantTintPolicy`. Acceptance: every palette colour in every preset yields node text
     at WCAG AA or better against its own fill; `single` mode renders exactly as it does today;
     SVG and PNG exports carry the fills as literals.
  2. **Presets differ in shape language, not only hue.** Give the presets genuinely distinct
     node geometry — corner radius, border presence and weight, padding density, and root
     treatment — instead of today's near-identical `node()` defaults. The typography scale
     belongs to this step. Acceptance: the four presets are distinguishable in a grayscale
     screenshot.
  3. **Split the theme into two orthogonal fields — shape language × palette.** Acceptance:
     Markdown front matter carries both fields; a document written with the current single
     `themeId` still opens and maps onto the pair; the picker presents the two axes separately.
- **Sequencing constraint (owner, 2026-08-06): step 3 must land before any Mapdown publish or
  share-URL feature.** The theme id is persisted in Markdown front matter, so it becomes a
  public contract the moment a published URL carries it; splitting the field is close to free
  now and requires format migration plus back-compatibility afterwards. Publish is not yet on
  this roadmap — when it is added, this constraint applies to it. **Step 3 shipped 2026-08-06
  (PR #37), so this gate is clear**; the front matter now carries `shape:` and `palette:` and a
  published URL can safely reference either axis.

The IA v2 / Coach Home iteration shipped 2026-07-28 (all three phases; see
`docs/changelog.md`).

Two invariants established by that iteration outlive it and apply to anything touching the
learner surfaces — recorded as [ADR 0006](decisions/0006-learner-surface-invariants.md), with
the full reasoning in `docs/english-studio-ia-v2-design.md`:

- **Never render a `null` level as "B1".** A policy may use B1 internally; the UI must not
  claim a level the system has not established.
- **Never lock material by band.** CEFR confidence is the product of practice volume and band
  *spread*, so a recommender that never explores starves the estimator that decides the
  learner's level. Fold other bands; do not gate them.

Also still open, and the natural successors at the seam Phase 2 left: the **matching** service
(Dictation v2, in Later) and the session/planning layer. Both replace
`selectStarterPractice()` and inherit its callers — the Home renders whatever that seam
returns, so neither needs an IA change.

## Now — Engineering quality iteration

The owner authorized this iteration on 2026-08-15 after reviewing the project diagnosis.
It is engineering-only: no external behavior, contract, schema, or UX change. Each item
ships as its own commit, in the order listed. Report each as `in_review` with evidence;
only the owner marks it accepted.

### 1. Remove dead `EslPassage` code — accepted (2026-08-15)

Shipped as `66a85c1`: removed the eight `EslPassage` CRUD functions, the `EslPassage` type,
and `mapEslPassage` — all zero callers after migration 0012 moved user reading passages
into the unified `passages` table. `docs/material-layer-design.md` §8 still names
`listEslPassagesByUser` as pre-migration design prose and is intentionally unchanged.

### 2. Configure ESLint across the monorepo — accepted (2026-08-17)

- Cover the whole monorepo — `apps/web`, `apps/mapdown`, `packages/*`, `scripts/` — with a
  per-package TypeScript version (web/scripts 5.9.3, mapdown 7.x), not one root override.
- Acceptance: a single `pnpm lint` runs everything and passes with **zero errors**; the
  existing `pnpm test`, `pnpm typecheck`, and production builds stay green.
- Enable `eslint-plugin-react-hooks` for the React surfaces. Do **not** enable type-aware
  (typed) linting in this pass — that is a later enhancement, not this item.
- **Prettier is out of scope.** This item is ESLint only.
- Do not rewrite business code to silence rules; fix mechanical violations only, and where a
  rule genuinely does not fit, disable it narrowly with a reason rather than changing behavior.

Review evidence (2026-08-17): `eslint.config.mjs` uses flat config with TypeScript parsing,
the standard ESLint recommended rules, and the traditional React Hooks rules
(`rules-of-hooks` plus `exhaustive-deps`). The newer compiler-style Hooks rules are not enabled
because they would require behavior-affecting ref/effect rewrites. `pnpm lint` covers the root,
Web, Mapdown, packages, and scripts with zero errors (nine existing dependency-array warnings).
The 564-test suite, Web/scripts typecheck, Mapdown typecheck, Web production build, and Mapdown
production build all pass. Mechanical lint fixes only: unused bindings, intentional control
character regexes, empty catch blocks, and equivalent escape syntax.

### 3. Split `@bcailab/db` into per-domain modules — accepted (2026-08-17)

- One internal module per complete domain (the full set in `index.ts`, not just four).
- `src/index.ts` stays the public barrel; every existing call site keeps importing from
  `@bcailab/db` unchanged. No new subpath public API.
- No change to SQL, return types, or error semantics — a pure mechanical move. The N+1 fix
  (item 4) is deliberately **not** folded into this item.

Review evidence (2026-08-17): the former 2,591-line implementation is now split into internal
`users`, `posts`, `tts`, `reading`, `learner`, `writing`, `usage`, `dictation`, and `passages`
modules, with shared public types and compatibility helpers separated from the barrel.
`packages/db/src/index.ts` remains a 15-line public re-export surface; all existing application
imports remain `@bcailab/db`. Tests, Web/scripts typecheck, Mapdown typecheck, lint, and both
production builds pass.

### 4. Fix the evaluation-history N+1 query — accepted (2026-08-17)

- First locate the exact query (or queries) and record the current and target query counts
  per page load; acceptance is a fixture/test proving the target bound is met.
- Scope is the identified query only, not a general query audit.

Review evidence (2026-08-17): `/reading/:id` previously issued one latest-evaluation query per
attempt plus a second query for the selected attempt (`N + 3` D1 queries after passage and
attempt loading). The evaluation worker had the same per-history-attempt pattern (`N + 3`).
Added `listLatestEslReadingEvaluationsByPassage`, which selects the latest row per attempt in
one user- and passage-scoped query. Both callers now use one evaluation query: the page is 3
D1 queries total and the worker is 4. A fixture asserts one `prepare` call and the latest-row
ordering predicate; 565 tests pass, typecheck/lint pass, and both production builds pass.

### 5. Session cleanup cron — accepted (2026-08-17)

- Recorded implementation parameters before coding: daily at 03:17 UTC, a maximum of 100
  deletes per run, strict `expires_at < now` deletion, and a separate Cloudflare Worker Cron
  Trigger because the app deployment is Pages. The delete is idempotent and uses the same D1
  binding as the app. Unit coverage asserts the strict predicate and batch ceiling.

### 6. Session secret rotation — accepted (2026-08-17)

- Recorded implementation parameters before coding: `SESSION_SECRET` signs new cookies while
  optional `SESSION_SECRET_PREVIOUS` verifies old cookies for the current 30-day maximum cookie
  lifetime; rollback restores the former value as primary before removing the compatibility
  value; final removal uses Cloudflare Pages secret management. Infra operations and the
  compatibility window are documented in `docs/infra-cloudflare.md`, with a cookie test proving
  old-secret verification.

## Now — Account passwords and profile — accepted (2026-08-18)

The owner authorized this on 2026-08-18 and accepted it the same day, after verifying the
shipped behaviour in production. It extends the existing passwordless auth (email OTP +
Google, both unchanged) rather than adopting a new auth framework; better-auth was explicitly
considered and declined because it would require re-schema-ing and rewiring every session call
site for features the custom system already provides. This delivers — and goes beyond — the
Later item "Profile settings (avatar + nickname) for email-OTP users".

- Add an **optional** account password. Accounts stay passwordless by default; a user may set a
  password from their profile and then also sign in with email + password. Passwords are stored
  as PBKDF2-HMAC-SHA256 hashes with a per-user salt in `users.password_hash` (nullable), never
  exposed on the client `User` type. Minimum length 8.
- `/login` keeps Google and email-code sign-in and adds a password mode plus a "Forgot or never
  set a password?" reset that reuses the existing email OTP: a verified code sets a new password
  and signs the user in.
- Add an authenticated `/profile` page reached from the avatar menu. It edits the display name
  and sets or changes the password; changing an existing password requires the current one,
  while setting the first password only requires the authenticated session.
- The avatar is **not** user-editable (owner decision, 2026-08-18): asking a user to paste an
  image URL is poor UX, so the avatar comes from Google or falls back to a default placeholder.
  Because Google is then its only source, a Google sign-in refreshes the avatar outright; the
  display name keeps its no-clobber protection since it *is* user-editable.
- Google sign-in continues to attach to an existing email account by matching email (unchanged).

Acceptance evidence: unit tests for password hashing round-trip, malformed-hash safety, and
strength validation; a local migration adding the nullable column; and end-to-end browser
verification against the running dev server of email-code sign-in, setting a password in
`/profile`, editing profile info, password sign-in, and code-based reset. `pnpm test`,
`typecheck`, `lint`, and the production build all pass. Explicitly out of scope: rate-limiting
the password-login endpoint beyond PBKDF2 cost, session revocation on password change, and
any user-supplied avatar (upload or URL).

Review evidence (2026-08-18): shipped across PRs #41–#44. Password hashing is PBKDF2-HMAC-SHA256
over WebCrypto with a per-user salt and a self-describing hash string; `users.password_hash` is
nullable and absent from the client `User` type. `/login` carries Google, email-code, password,
and code-based reset; `/profile` edits the display name and sets or changes the password, with
an entry in both the site header and the Studio rail avatar menus. A review pass additionally
made `consumeLoginCode` an atomic compare-and-swap so a concurrent reset cannot consume one code
twice, and stopped Google sign-in from clobbering a user-set display name. 579 tests, typecheck,
lint (0 errors), and both production builds pass; the local-D1 checks cover avatar preservation
on a name save and a real SQL `NULL` when the name is cleared.

Two items are carried forward rather than closed by this acceptance:

- **Password-login throttling remains absent** — only PBKDF2 cost stands between an attacker and
  online brute force. Scoped out deliberately; it is the first thing to add if password sign-in
  sees real use (NIST 800-63B expects rate limiting on a password verifier).
- **PBKDF2 is pinned at 100,000 iterations**, below OWASP's current 600,000, to stay inside the
  Workers per-request CPU budget on the sign-in path. Revisit against a measured budget rather
  than raising it blindly.

Operational note: migration `0018` reached production *after* the code deploy, so `/profile`
returned an error until it was applied. Apply the migration before deploying code that reads a
new column — see the deploy-ordering note in `docs/changelog.md`.

## Now — Mapdown local document library — accepted (2026-08-23)

The owner authorized Stage 1 of
[the save/publish proposal](mapdown/save-publish-proposal.md) on 2026-08-21 and accepted the
completed stage on 2026-08-23. This stage closes the existing local-storage gap before any
account, cloud-save, or public-URL contract is introduced.

- Add a Mapdown-native document library backed by the existing IndexedDB document index. Every
  indexed map is listed newest-first with its title, node count, last local update, import source
  when known, and a clear current-document state.
- Let people open, create, rename, duplicate, and delete local maps without an account or network
  connection. Opening or creating a map must first finish the current pending local save; a
  storage failure must keep the current in-memory map active rather than switching and losing it.
- Rename and duplicate update the document snapshot and index consistently. Delete requires an
  in-product confirmation, removes every stored snapshot for that map, and offers a current-tab
  undo that restores the complete stored document. Deleting the active map selects another local
  map or creates a new local map so the editor never has no active document.
- Expose the library from the File menu and the canonical command registry. The dialog traps and
  restores focus, works by keyboard and screen reader, reflows on mobile, and respects reduced
  motion. If IndexedDB cannot be read, the dialog shows an honest unavailable state while the
  in-memory editor remains usable.
- Keep folders, tags, document search, PWA installation, File System Access API, recovery-history
  UI, accounts, cloud sync, and publish/share URLs out of this stage.

Acceptance evidence: storage tests for list ordering, rename, duplicate, delete/restore, complete
snapshot cleanup, imported filename preservation, failed-write atomicity, and IndexedDB parity;
command-registry coverage; browser QA at desktop and mobile widths for open/new/rename/duplicate,
persistence across reload, keyboard focus, responsive layout, and delete confirmation/cancellation.
The destructive delete/undo execution is verified in isolated storage tests rather than against
the browser's live IndexedDB. Mapdown typecheck, lint, focused tests, full tests, and production
build passed before owner acceptance on 2026-08-23.

## Now — Mapdown account save and frozen publishing — accepted (2026-08-23)

The owner authorized stages 2 and 3 of
[the save/publish proposal](mapdown/save-publish-proposal.md) on 2026-08-21, accepting the
recommended `share.bcailab.com` publication host and requiring an account to publish. The
existing local document library remains the primary, fully offline workflow; signing in or
opening the library must never upload a document implicitly. The owner accepted the completed
implementation on 2026-08-23.

The owner authorized a silent-SSO follow-up on 2026-08-24: when Mapdown has no session, it may
perform one background, non-interactive handoff check against Studio. An existing Studio session
creates the same short-lived, single-use, audience-bound Mapdown session; no Studio session leaves
Mapdown visibly signed out without opening a popup or rendering the login page. Explicit Mapdown
sign-out suppresses another silent attempt in that tab, manual Sign in remains available, and no
document is uploaded implicitly. Acceptance requires signed-in/signed-out Studio paths, wrong
origin rejection, explicit-sign-out suppression, existing handoff contract tests, full tests,
typechecks, lint and both production builds.

### Stage 2 — explicit account save

- Add a small Pages Functions backend to the Mapdown project, bound to the existing D1 database
  and R2 bucket. `bcailab_session` remains host-only and unchanged. A signed, 60-second,
  audience-bound, single-use handoff from `bcailab.com` creates an independent host-only
  `mapdown_session`; token replay, tampering, expiry, wrong audience and wrong subject fail.
- Reuse the main site's Google, email-code and password sign-in UI, returning the popup to
  `/auth/mapdown` after authentication. The handoff secret is a dedicated
  `MAPDOWN_HANDOFF_SECRET`, configured on both Pages projects and never committed. Preview
  integration requires one exact `MAPDOWN_PREVIEW_ORIGIN` matching Mapdown's Preview
  `MAPDOWN_ORIGIN`, a build-time `VITE_WEB_ORIGIN` pointing Mapdown at the stable Web Preview,
  and the same Preview D1 on both apps; arbitrary commit-preview hosts remain rejected.
- Save a versioned, lossless internal JSON snapshot only after an explicit per-document action.
  The server issues the cloud document id; the client document id is only a user-scoped
  idempotency key. Cloud list/read/update/delete operations are owner-scoped, with a foreign id
  indistinguishable from a missing id and private responses marked `private, no-store`.
- Use optimistic concurrency. Updating version N succeeds only if N is current. A stale save
  never overwrites the remote copy and creates a separate local conflicted copy for inspection;
  no realtime collaboration or automatic merge is introduced.
- The local library shows Local only / Saved online / Published state, includes online-only
  documents after sign-in, and can download an online snapshot into IndexedDB without losing
  its node ids, collapse state, sides, selection or theme. Selection-only recovery snapshots do
  not turn Saved online into a false pending-content state.

Capacity limits, derived from synthetic 100/500/2,000-node maps rather than user telemetry:
100 private documents per user, 512 KiB UTF-8 per private snapshot, 120 Unicode code points per
title, and the existing 10,000-node structural ceiling. The 2,000-node representative map is
approximately 317 KiB as JSON, leaving headroom below both this product cap and D1's 2 MB row
limit.

Acceptance: cross-implementation handoff proof tests; replay/expiry/audience/tamper tests;
session-cookie scope tests; request-body, snapshot-schema, invariant, ownership, idempotency and
optimistic-concurrency tests; local D1 migration and Pages Functions verification; signed-out
offline regression; authenticated browser coverage for sign-in, first save, repeat save,
online-only open, conflict copy and cloud delete; typechecks, lint, full tests and production
builds. Deployment is migration-first under ADR 0008.

### Stage 3 — frozen publication

- Publishing requires a Mapdown account and an existing cloud document. The client explicitly
  uploads canonical Markdown, the already-rendered script-free SVG, and a 1200×630 PNG rendered
  from the same layout for link previews. The public record is a
  frozen version; ordinary local edits and cloud saves do not change it until **Update
  published version** is invoked.
- Publish/update confirmation names the map and node count and states that current changes are
  first saved online. The resulting public URL and Copy link stay visible inside the document
  library; online-only rows explain that a local open is required to render public assets.
- Serve unlisted URLs as `https://share.bcailab.com/p/{random-id}`. The viewer host receives no
  authenticated cookie, renders user content only through an isolated SVG `<img>`, applies a
  strict CSP and `noindex`, and provides keyboard-operable zoom/fit controls plus a no-JavaScript
  image fallback. The SVG remains the reader asset; `og:image` uses the PNG because common link
  unfurlers do not render SVG previews.
- Unpublish revokes the active record and returns uncached 404 responses immediately on the
  next request; republishing after revocation creates a new random URL. Deleting a cloud
  document also revokes its active publication. Old R2 objects may be cleaned after the D1
  revocation because the database record is the serving authority.
- Provide a bounded public report form without recording document content in logs. Reporter IP
  addresses are stored only as a keyed digest; at most three reports per public URL and digest
  are accepted in 24 hours. Operational takedown remains a D1 revocation, documented in the
  infrastructure procedure.

Capacity limits: 25 active publications per user, 256 KiB canonical Markdown, 2 MiB SVG and
4 MiB PNG per published version. The fixed PNG canvas contains 3.0 MiB of raw RGBA pixels before
compression; the representative 2,000-node map is approximately 129 KiB Markdown and 1.27 MiB SVG.

Acceptance: frozen/update semantics, active-publication quota, SVG/Markdown/content-type
validation, inert hostile labels, no authenticated cookie on the share host, CSP/noindex/OG
metadata, report throttling, republish-new-URL behavior, and uncached 404 after unpublish;
browser coverage at desktop and mobile widths with and without JavaScript; Mapdown and web
typechecks, lint, full tests, and both production builds. These checks passed before owner
acceptance on 2026-08-23.

## Now — Mapdown library page, live published viewer, and copy — accepted (2026-08-25)

The owner authorized this iteration on 2026-08-24 and confirmed its four scoping decisions:
the library becomes a full-page route replacing the dialog; the published viewer is driven by a
new public view snapshot rather than the published Markdown; **Copy** produces a local map in
the visitor's browser; and the interaction work targets the publish flow, save/sign-in feedback,
and the list itself, with editor canvas interaction explicitly out of scope. The design and the
reasoning are in
[the library and live viewer proposal](mapdown/library-and-live-viewer-proposal.md).

The owner reviewed the three surfaces in a browser and accepted the completed iteration **as a
first version** on 2026-08-25.

**Published-host fallback follow-up — accepted (2026-08-25).** The owner accepted commit
`0b96513` after it was pushed. The change closes the D-31 gap found by the first deploy. A
top-level `404.html` disables Pages' implicit SPA fallback, so unlisted paths on both Mapdown
hostnames return 404 while the three explicit app paths continue through middleware. Review
evidence: the route/config test requires the 404 page,
the production build copies it unchanged to the output root, Mapdown browser and Functions
typechecks/lint pass, and all 664 repository tests pass. `wrangler pages dev` remains blocked by
the recorded esbuild `import-source` incompatibility, so the post-deploy probe must confirm
unknown paths return 404 on both hostnames.

**Acceptance did not cover the Pages Functions runtime, and that gap is still open.** No local
run exercised the real D1/R2 handlers: `wrangler pages dev` fails to build Functions in this
environment (an esbuild/wrangler version mismatch), so the published page and the copy endpoint
were driven against a static harness rendering the real page markup and the real built bundle.
Before this reaches production, migration `0021_mapdown_publication_view.sql` is applied first
under ADR 0008, and the deploy is followed by a live check of publish → the live viewer →
**Make a copy** → unpublish returning an uncached 404 for both `/p/{id}` and `/p/{id}/map.json`.
That check is a deployment step, not a new authorization.

### Stage 1 — the document library becomes a page

- Add a three-route client router to the Mapdown SPA (`/`, `/library`, `/import`) with
  `_routes.json` coverage, so `_middleware.ts` sees those paths on the published origin and
  redirects them to the editor host. (The Pages `_redirects` rewrite this originally used was
  withdrawn on 2026-08-25 after it broke both routes in production; the middleware serves the
  shell instead — see the D-31 correction.) The editor remains the default landing surface and stays mounted beneath the library,
  so browser Back returns to the same document, viewport and undo history.
- Replace the modal document library with a full page: one merged local + online list, an
  explicit per-row state (Local only / Unsaved changes / Saved online / Published / Published ·
  outdated / Conflicted copy), title search, sort by last edited or title, inline rename, and an
  explicit action column.
- Move publish, update published version, unpublish, the resulting public URL and Copy link into
  a detail panel for the selected map, so a publish result is never occluded by the surface that
  produced it.
- Keep every storage and cloud contract unchanged: delete stays confirmed and in-tab undoable,
  no document is uploaded without an explicit per-document action, and the signed-out offline
  workflow is unchanged.

Acceptance: direct, menu and command-registry entry to `/library`; Back preserving editor state;
every row state visible without opening a menu and *Saved online* never shown for a map with
unsaved local content; publish results staying visible; search and sort reporting empty results
honestly; keyboard and screen-reader operation at desktop, tablet and mobile widths under
reduced motion; an honest unavailable state when IndexedDB cannot be read; and `/library` and
`/import` not serving the editor on `share.bcailab.com`.

### Stage 2 — the published page becomes a live read-only map

- Publish an additional versioned **public view snapshot** (tree order, node text, first-level
  sides, collapse state, theme pair) to R2, referenced by a new nullable `view_key` column on
  `mapdown_publications`. The published Markdown cannot serve this role: import assigns every
  first-level node `side: "right"` and carries no collapse state, so a Markdown-driven viewer
  would contradict the frozen SVG beside it. Cap 512 KiB per view snapshot.
- Build the viewer as a separate Vite entry importing only `layout/`, `theme/` and the viewport
  helper — never the editor, model commands or storage — so no public code path can mutate a
  document. The Pages Function keeps generating the HTML and owns `og:`, `noindex`, canonical
  and CSP.
- A reader can expand and collapse nodes, pan, zoom, fit and reset, by pointer and by keyboard.
  Editing, selection commands and drag-to-move do not exist on this surface.
- Without JavaScript, or before the bundle loads, or when `map.json` fails, the existing frozen
  SVG `<img>` remains the rendering. Publications created before this stage keep the image
  viewer. CSP gains `connect-src 'self'` and nothing else.

Acceptance: first paint matching the frozen SVG in sides, collapse state and theme; pointer and
keyboard collapse/pan/zoom/fit with no mutation of the publication; a working no-JavaScript page
and PNG unfurling; pre-existing publications rendering without error; hostile node text inert in
the live viewer; no editor/storage/model-command import reachable from the public bundle;
uncached 404 after unpublish for both the page and `map.json`; and server-side validation of the
view snapshot's shape, size, node ceiling and root.

### Stage 3 — Copy

- The published page offers **Make a copy**, linking to `map.bcailab.com/import?src={publicId}`.
  A new unauthenticated, read-only `GET /api/publications/{publicId}` on the editor origin
  returns the active publication's title and view snapshot; the share host gains no write path
  and no session.
- Mapdown builds a new local document from the snapshot, stores it in IndexedDB and opens it.
  Putting it in an account remains the existing explicit *Save online* action. The copy records
  its source public id as provenance; it is a new document with new ids and creates no fork
  graph and no notification to the original author.

Acceptance: copy working signed out and creating exactly one local document; structure, sides,
collapse state and theme preserved; a revoked or unknown id failing clearly and creating
nothing; the endpoint being read-only, `no-store`, identical 404 for revoked and unknown, and
exposing no author identity; a second copy creating a second document; and the share host
gaining no authenticated cookie or mutation endpoint.

Migration `0021_mapdown_publication_view.sql` is applied before the code that reads it is
deployed, `--remote` for production D1 (ADR 0008).

## Next
- **Mapdown — production MVP (accepted 2026-08-15).** A static, local-first, keyboard-first
  Markdown mind-map editor at `apps/mapdown`, live at `map.bcailab.com`. The editor works:
  keyboard authoring (Enter/Tab/Shift+Tab), two-sided layout, four document themes,
  Markdown/SVG/PNG export, IndexedDB autosave with validated recovery, pan/zoom/fit,
  searchable Help/Command Center, and accessible tree semantics.
  All seventeen implementation steps and D-03 deployment are complete with evidence in
  `docs/mapdown/README.md` and `docs/changelog.md`. The production deployment and all five
  stabilization checkpoints were accepted by the owner on 2026-08-15. Read
  `docs/mapdown/decisions.md` before reopening any settled question — it has nineteen records,
  several of which correct an earlier
  mistake of mine and say so.
- **Mapdown — create with an external AI (authorized 2026-08-08, not started).** Validate the
  product direction “AI-generated structure → Mapdown visualization” without putting a model
  inside Mapdown. Add a **Create with AI** flow for people learning a new subject or researching
  a topic: the user enters the topic, copies a model-agnostic prompt that defines Mapdown's
  supported Markdown outline format, sends it to an AI of their choice, then pastes the returned
  Markdown directly into Mapdown and creates a local editable map. Acceptance: (a) the prompt
  requires exactly one level-1 root heading, unordered-list descendants and indentation-based
  hierarchy, and asks for Markdown only — no explanation or code fence; (b) the pasted text is
  validated by the same parser as file import, with actionable errors and no mutation of the
  current map on failure; (c) a valid result opens immediately as a new locally saved map while
  the previous map remains recoverable; (d) the flow works with at least two external AI
  products and requires no account, API key or network request from Mapdown; and (e) the flow is
  keyboard- and screen-reader-operable at desktop and mobile widths. Explicitly excluded:
  built-in model calls, prompt-provider integrations, Agent/MCP/HTTP APIs, publish/share URLs,
  and server-side rendering. Those remain separate directions requiring their own evidence and
  authorization.
- **Dictation contributes practice duration** (owner-authorized 2026-08-12, not started).
  `total_practice_seconds` counts reading only: `learner-model.server.ts` passes
  `practiceSeconds: 0` for dictation because nothing times a dictation attempt. A learner who
  practises both modes therefore has a duration covering half their work. The surfaces were
  made honest rather than left overclaiming — Home dropped duration entirely, Progress renamed
  its card to *Reading time* and hides it at zero — so this item is about restoring the
  measurement, not about the copy. Acceptance: (a) a dictation attempt records elapsed practice
  time and adds it to `total_practice_seconds`; (b) resuming an in-progress attempt does not
  double-count time already recorded; (c) idle time with no interaction is excluded, by a
  documented rule; (d) Progress presents one duration covering every mode that measures one,
  renamed back from *Reading time*; and (e) existing rows are unaffected — historical dictation
  attempts stay at zero rather than being back-estimated. Explicitly excluded: timing Writing,
  whose unit of work is a submitted round rather than a timed sitting.

- **Free entry points made explicit** (owner-raised 2026-07-23): header + hero chip showing what
  is usable without an account. Its *data* half already lands in IA Phase 1 — the registry's
  `access: public | trial | auth` field is what makes free entry consistent — so this item is the
  presentation half, and it follows the colour work.
- Fold **writing** into the ability profile. Writing currently contributes only counters and
  Continue/Recent entries, because it has no tag vocabulary — a prompt is not a passage. The
  mechanism is settled (IA v2 design §6.3): a new vocabulary plus a writer emitting into the same
  `learner_tag_observations` table, surfaced on `/english/progress` rather than crowding the Home
  snapshot. Blocked on that vocabulary, not on schema.

## Later

- Long-document translation: chunked parallel translation; raise signed-in limit to ~100k
  chars. (Streaming output — the other half of this item — shipped 2026-07-30; see `docs/changelog.md`.)
- Faster first-token: evaluate Groq (or similar) for the translate task via the
  `llm.server.ts` routing table; adopt Cloudflare AI Gateway for cost/usage observability.
- **Model routing hot-config** (owner-raised 2026-07-21). As the task→model table grows
  (already three tiers after routing evaluation tasks to 3.6 Flash; multi-provider later),
  changing routing shouldn't need a deploy. The cheap intermediate — **not** an admin system —
  is to move `TASK_MODELS` from a code constant into D1/KV read at runtime, with the code
  default as fallback, so routing changes by SQL/`wrangler` alone. Pair with AI Gateway (above)
  for the per-task cost/latency data that tells you *which* task to re-route. An admin UI over
  that table comes only if a non-engineer ever needs to change it. Trigger: a 2nd provider, or
  the first time a routing change is wanted between deploys.
- **Reading grader — deterministic split.** Parked: the 2026-07-23 variance spikes showed the
  single-call evaluator repeatable enough that the ASR-diff rebuild is not justified.
  **Trigger to revisit:** a further spike run on more jargon-dense or unfamiliar-register
  material reproduces variance that actually crosses the 4-point threshold. Evidence and
  reasoning: [ADR 0005](decisions/0005-reading-grader-stays-single-call.md).
- Chinese UI (at least Translate + landing pages) — deferred 2026-07-15,
  [ADR 0003](decisions/0003-defer-chinese-ui.md).
- Paid tier (quota/model config already has an `anonymous/free/paid` shape).
- Posts product landing page (currently links straight into the tool).
- **Dictation v2 — level-adaptive material matching.** Retrieve from the tagged library rather
  than generate per request. The work is (a) a dimensional tag schema shared by library and
  learner profile, (b) a matching policy, (c) growing the library (now its own item above).
  It replaces `selectStarterPractice()` and inherits its callers, so the Home needs no IA
  change; the session / goal-first layer is the next tenant on that same seam, deliberately not
  built now. Prerequisites are delivered (shared learner model 2026-07-21, dictation v1).
  Reading and Writing migrate to the same interface gradually — an interface migration, not a
  rewrite. Full reasoning:
  [ADR 0004](decisions/0004-dictation-v2-retrieves-rather-than-generates.md).
- Dictation: bring-your-own-text — user pastes a passage and practices dictation on it.
  Noted 2026-07-20 as the one place runtime generation/synthesis genuinely earns its
  keep; it is user-initiated, distinct from adaptive difficulty, and should not be
  conflated with v2 matching.
- Decided 2026-07-16: Translate stays inside English Studio as its free funnel (not a
  standalone homepage product); revisit only if usage data shows a distinct audience.
- Engineering quality (remaining): vitest for LLM-output parsers; audio Range request
  support. ESLint, the evaluation-history N+1 query, session cleanup cron, and session
  secret rotation were promoted to "Now — Engineering quality iteration" (authorized
  2026-08-15) with acceptance criteria.
- ~~Profile settings (avatar + nickname) for email-OTP users~~ — promoted to
  "Now — Account passwords and profile" (authorized 2026-08-18), which delivers profile
  editing plus optional passwords.
- **Library expansion — first batch shipped 2026-07-28 (20 → 40 passages, ten per band); keep
  going.** The IA v2 design assumes material eventually grows ~100× (roughly 500 per band),
  because at five per band a motivated learner exhausted their level in two sittings and the
  Coach Home made that thinness visible. Ten per band buys room, not resolution. Expansion is
  mostly a content-and-review push rather than engineering: generate per band (parallel
  sub-agents keep the register distinct), `intake.ts` to validate, owner review, `publish.ts`,
  `tag.ts`. **Reference audio is now produced for every newly published passage** — the material
  layer's §9.1 gap, closed in the same pass so TTS is paid once. The twenty passages published
  *before* that change still lack a reference recording; backfilling them is optional and costs
  a fresh TTS pass for those rows only. Reading's topic/state filters are still **not** needed:
  the Phase 3 trigger was "the first expansion", but ten cards per band browse fine — revisit
  when a band passes roughly thirty.
- **Promote LLM judgment to a formal measurement signal** (owner direction 2026-07-27). The
  grader variance spikes (`docs/changelog.md`, 2026-07-23) showed LLM scoring repeatable enough to be more than
  a down-weighted hint. The architecture already anticipates this: `learner_tag_observations.source`
  distinguishes `deterministic` from `llm`, and the weighting lives in one constant
  (`SOURCE_WEIGHT` in `learner-model.ts`), so promotion is **a weight change with a documented
  evidence trail, not a migration** (IA v2 design §6.2). Do it on evidence — more variance runs
  across registers and speakers — not on vibes. New signal sources (a speaking evaluator, say)
  join the same way: one enum value, one weight.

## Exploration, history, and decisions

These used to live in this file and were split out on 2026-08-01, so that what remains here
is only what is planned or authorized:

- **Unscoped ideas** the owner is considering → `docs/exploration.md`. Not authorization.
- **What shipped**, with dates and what was learned → `docs/changelog.md`.
- **Settled decisions** and their rationale → `docs/decisions/`.
