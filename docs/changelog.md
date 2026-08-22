# Changelog

Delivery record for bcailab. **This file is history, not a plan** — it records what shipped
and what was learned, so `docs/roadmap.md` can stay about what is next.

Split out of `docs/roadmap.md` on 2026-08-01; entries below are moved verbatim and were
written at the time each item shipped. Newest first.

Only the owner marks work done. An agent that finishes an item reports it and lets the owner
make the final transition; see `AGENTS.md`.

- 2026-08-21 — **in_review: added explicit Mapdown account save and frozen publishing.**
  Mapdown now exchanges a 60-second, single-use Studio handoff for its own Host-only session;
  the existing `bcailab_session` remains unchanged. The local-first document library can
  explicitly save lossless JSON online, open online-only documents, show pending/current state,
  reject stale writes without overwrite, and keep rejected work as a local conflicted copy.
  Account-required publish uploads canonical Markdown plus the editor's script-free SVG and
  serves an unlisted, strict-CSP, `noindex` viewer at `share.bcailab.com`; updates are frozen and
  explicit, while unpublish and cloud delete revoke immediately. Added bounded quotas, owner
  scoping, report throttling with keyed reporter digests, D1 migration 0019, R2 storage, session
  cleanup and migrate-first operations docs. Evidence: local migration ran all 14 statements;
  runtime checks returned 200 for first handoff, 401 for replay, 201 for save/publish, 409 for a
  stale write, and 404 immediately after unpublish; authenticated browser QA covered online
  open, publish and unpublish at 375/768/1280 px without flow console errors; 6 new contract
  tests and 593 repo-wide tests pass; Mapdown/Web typechecks and production builds pass; lint
  has zero errors and the same 9 pre-existing Hook warnings. No remote migration, secret/domain
  change, deployment, push or production data mutation was performed. The owner must still
  accept this roadmap item.
  - Review follow-up (2026-08-21): fixed canonical Markdown validation for maps with front
    matter; changed password/code handoff completion to a document navigation so the resource
    route response executes; and made stale-write recovery refresh the server version while
    retaining one explicit pending local save, preventing repeated conflicted copies. Signed-out
    documents now trust persisted sync metadata instead of falsely reporting pending changes.
    SVG validation inspects real tag and attribute structure, so escaped node text and ARIA labels
    containing strings such as `url(` or `onclick =` remain publishable while executable elements,
    event attributes and resource URLs stay blocked. The public viewer now fits already-loaded
    images and preserves user zoom across resize. Publishing additionally uploads a fixed
    1200×630 PNG for link unfurlers (migration 0020 and a dedicated public route); the sanitized
    SVG remains the interactive/no-script viewer asset. Evidence: browser QA published a dark
    front-matter map containing event/URL-looking text, loaded the 1200×630 preview, preserved a
    1.25× user zoom through resize, showed synced state after sign-out, and recovered from a 409
    with exactly one conflicted copy before a successful retry. Password login reached the
    handoff resource by full document navigation. All 598 tests, three typechecks, both production
    builds, and lint pass (zero errors; the same 9 pre-existing Hook warnings). Migration 0020 was
    applied only to local D1; no remote migration, deployment, push, or production mutation ran.

- 2026-08-21 — **in_review: added Mapdown's local document library.** Every IndexedDB-indexed
  map is now reachable from File → Document library and the command/help registry, newest-first,
  with new/open/rename/duplicate and confirmed delete. Duplicate preserves the full internal
  document state; delete atomically removes the index entry and all snapshots, then offers a
  current-tab undo that restores the complete bundle. Imported filenames survive later
  autosaves. The dialog traps/restores focus, keeps Cancel focused for destructive confirmation,
  leaves the editor inert while open, reports storage failures without replacing the in-memory
  map, and reflows without horizontal overflow at 375 px. Account save and public URLs were
  deliberately kept out of that stage-1 commit. Evidence: 33 focused storage/IndexedDB/command tests; browser
  persistence/focus/mobile and confirmation-cancellation QA with no console errors; 587 passing
  tests repo-wide; Mapdown typecheck and production build; and root lint with 0 errors (the same
  9 existing Hook dependency warnings). The owner must still accept this roadmap item.

- 2026-08-18 — **accepted: optional account passwords and a `/profile` page.** Extended the
  existing passwordless auth (email OTP + Google, unchanged) instead of adopting better-auth,
  which was considered and declined. Added a nullable `users.password_hash` (migration 0018)
  and PBKDF2-HMAC-SHA256 hashing via WebCrypto (`apps/web/app/utils/password.server.ts`), kept
  off the client `User` type. `/login` gained an email + password mode and a code-based
  "forgot/never set a password" reset that reuses the email OTP; the new authenticated
  `/profile`, reached from the avatar menu, edits the display name and sets or changes
  the password (changing requires the current password). Evidence: 8 new password unit tests
  (576 total pass), typecheck, lint (0 errors), and production build all green, plus end-to-end
  browser verification of email-code sign-in, set-password, profile edit, password sign-in, and
  reset against the local dev server. Out of scope: password-login rate limiting beyond PBKDF2
  cost, session revocation on password change, and avatar upload. Shipped across PRs #41–#44 and
  accepted by the owner on 2026-08-18 after verifying the behaviour in production.
  - Review follow-up (2026-08-18): Google sign-in no longer overwrites a name/avatar the user
    set on `/profile` — both merge paths use `COALESCE(name, ?)` so Google only fills empty
    fields. `consumeLoginCode` is now an atomic compare-and-swap (`WHERE … AND consumed_at IS
    NULL`, returns whether it consumed) and `verifyLoginCode` refuses a code that a concurrent
    request already consumed, closing a double-consume race the reset flow would have widened.
    Profile fields can now be genuinely cleared (direct `SET`, no `COALESCE`), so "Saved." is
    honest. Added `referrerPolicy="no-referrer"` to the profile avatar and `role="status"`/
    `role="alert"` to the login/profile status messages. 3 new `consumeLoginCode` tests.
  - Design follow-up (2026-08-18): rebuilt `/profile` on a scoped `.profile-*` layout with its
    own 640px measure. It had been rendering in the 1400px site container while reusing the
    login popup's form styles, so inputs stretched the full viewport and two full-bleed red
    submits competed; "Saved." even reused the dev-mode OTP style. Kept as a page rather than a
    modal: it is a linkable destination with two independent forms and its own state.
  - Avatar customization removed (owner decision, 2026-08-18): the "Avatar image URL" field is
    gone — asking a user to paste an image URL is poor UX. The avatar now comes from Google or
    the default placeholder, so `updateUserProfile` writes the display name only and Google
    sign-in refreshes the avatar outright rather than `COALESCE`-ing it, which would otherwise
    freeze a stale picture with no way to update it. The display name keeps its no-clobber
    protection because it remains user-editable.
  - **Deploy ordering (required):** migration `0018` must be applied to the target D1 *before*
    the new code is deployed, because the code reads `users.password_hash` immediately. The
    column is nullable and backward-compatible, so applying it ahead of deploy is safe for the
    old code still running. `docs/workflow.md` has since been corrected: its numbered commands
    pushed first and migrated second, contradicting the migrate-first advice in its own footnote,
    and its production migration command omitted `--remote`, which makes wrangler 4.x target the
    local database and report success while production stays unmigrated.
  - **Known residual risk (owner decision):** the password-login endpoint has no per-account/IP
    failed-attempt throttling — only PBKDF2 cost. The roadmap scoped throttling out; flagging it
    because online brute-force protection is a release-level concern (NIST 800-63B). PBKDF2 is
    held at 100,000 iterations deliberately, to stay inside the Workers per-request CPU budget on
    the sign-in path rather than tracking OWASP's 600,000 blindly; revisit with a measured budget.

- 2026-08-17 — **accepted: added bounded session cleanup and secret rotation support.**
  `workers/session-cleanup/` is a dedicated Cloudflare Worker with a daily 03:17 UTC Cron
  Trigger because Pages Functions do not provide a scheduled entrypoint. Each run deletes at
  most 100 sessions with `expires_at < scheduledTime`, and the D1 helper is idempotent. Auth
  cookies continue signing with `SESSION_SECRET` while optionally accepting
  `SESSION_SECRET_PREVIOUS` during the 30-day cookie lifetime; rollback and final removal are
  documented in `docs/infra-cloudflare.md`. Tests cover strict expiry, the ceiling, empty
  batches, and old-secret verification.

- 2026-08-17 — **accepted: ESLint configured across the monorepo.** Added a flat ESLint
  configuration and root `pnpm lint` covering Web, Mapdown, packages, and scripts. React Hooks
  rules are enabled without typed linting or compiler-style behavior rules; Prettier remains out
  of scope. Mechanical violations were fixed without changing application behavior. Evidence:
  zero lint errors (nine existing dependency-array warnings), 564 passing tests, Web/scripts and
  Mapdown typechecks, and successful Web and Mapdown production builds.

- 2026-08-17 — **accepted: split the `@bcailab/db` implementation by domain.** Moved the
  monolithic database implementation into internal users, posts, TTS, reading, learner,
  writing, usage, dictation, and passage modules while keeping `src/index.ts` as the unchanged
  public barrel. SQL, return types, errors, and all call-site imports remain unchanged.
  Evidence: 564 passing tests, Web/scripts and Mapdown typechecks, zero lint errors, and
  successful Web and Mapdown production builds.

- 2026-08-17 — **accepted: removed the Reading evaluation-history N+1 query.** The passage
  page and evaluation worker now load latest evaluations for all attempts with one scoped D1
  query instead of one query per attempt plus a selected-attempt repeat. The page is bounded at
  three D1 queries and the worker at four. Evidence: a one-prepare fixture, 565 passing tests,
  typechecks, lint, and both production builds.

- 2026-08-15 — **accepted: removed dead `EslPassage` database code.** Deleted the eight
  zero-caller CRUD functions, the legacy `EslPassage` type, and its mapper from
  `packages/db/src/index.ts`; migration 0012 moved user reading passages to the unified
  `passages` table. This was a pure internal removal with no SQL, route, or public API
  behavior change. The pre-migration reference in `docs/material-layer-design.md` remains
  historical design prose. Evidence: commit `66a85c1`; subsequent repository verification.

- 2026-08-15 — **accepted: owner sweep of all outstanding `in_review` items.** The owner
  reviewed every remaining `in_review` entry one by one and accepted them all. This closes
  the English Studio iteration items A–E (writing prompt bank, saved translations, shared
  interaction/layout correctness, reading-evaluation dead output, scalable Studio navigation)
  and the Mapdown production MVP plus its five stabilization checkpoints (P0 active-draft
  persistence, visual polish, interaction-state clarification, canvas affordances, theme
  differentiation). The single-reviewer gap on the writing-prompt batch recorded under
  2026-08-10 is accepted as-is; no second-party content review was added. The 26 `in_review`
  changelog entries below are now `accepted` to match.

- 2026-08-12 — **accepted: rejected a cross-tool practice-session entity; kept each tool's
  native model.** Recorded as [ADR 0007](decisions/0007-no-cross-tool-practice-session-entity.md).
  The Recent-list dedup below raised a modelling question — what does a folded row represent?
  — and a full contract was drafted (`docs/practice-session-contract.md`, revised once after a
  second tool's review caught five factual errors in the first draft). The owner's conclusion:
  no sitting concept, no `practice_sessions` table. Reading and Dictation stay centred on
  material and attempts; Writing keeps its durable workspace with Draft and Round, exactly as
  already authorized in `docs/roadmap.md`. The deciding fact was that the entity had no
  consumer — a list folded by session but still linking `/reading/:passageId` would have
  recreated the identical-link defect the dedup fix below removed. The contract document is
  kept, marked not-adopted, for three findings worth having on hand if this is ever revisited:
  Round is roadmap-authorized Writing vocabulary rather than drift, Draft names a
  saved-but-unevaluated state rather than a rival counting unit, and Reading's pasted texts
  carry real `passages.id` material identity. One genuine copy defect survived the rejection
  and is fixed: Home's basis line counted `total_attempts` but labelled it "recorded
  sessions"; it now says "recorded attempts". Evidence: root typecheck, 564-test suite,
  production build, and authenticated verification that the basis line and Writing's own
  "Session"/"Round" vocabulary are each correct after the copy sweep.

- 2026-08-12 — **accepted: Recent lists show distinct destinations, not repeated ones.** Home and
  the Reading/Dictation workspaces listed raw attempts, so practising one passage three times
  produced three Recent rows whose links were byte-for-byte identical — three slots spent on
  one destination. Folded to one row per passage instead, carrying attempt count and best
  score so the row still tells the repeated-practice story when there is more than one
  attempt; a single attempt stays reachable through the passage's history rail at
  `?attempt=<id>`, so the fold costs no reachability. Neither Reading nor Dictation gained a
  query: Reading reuses the
  counts already in `listReadingPassageStatsByUser`, Dictation the `bestByPassage` map it
  already built. **Commit title correction:** this shipped as `14b4a23`, titled "recent lists
  show sessions, not attempts" — at the time, "session" seemed like the right word for a
  passage's whole practice history. The entity that title implies was examined immediately
  after and rejected (see the entry above; ADR 0007): the studio has no cross-tool session
  concept, and the fold below is and always was one row per **material**, not per session.
  The code and its comments were renamed to match (`byMaterial`, not `sessions`) in the
  rejection commit; this note corrects the shipped title, which the append-only changelog
  cannot edit away. Evidence: root typecheck, 564-test suite, production build, and
  authenticated verification (`distinctDestinations: 1` where it had been 3).

- 2026-08-12 — **accepted: Home is prospective, Progress is retrospective.** Applied
  `docs/learner-model-design.md` §9.4 to the two surfaces that had drifted into saying the same
  thing. `/english/progress` first gained the two panels it lacked — Coverage, and the dictation
  accuracy curve — after which Home's status grid was removed rather than duplicated. What
  remains on Home is a single basis line stating what the recommendation above is worth, plus
  the level picker and a three-row Recent list; the level picker moved out of the Level stat
  cell, where it had made that column several times the height of its neighbours. The accuracy
  curve was rebuilt on the way across: a fixed 0–100 axis had flattened a 26-point gain into a
  near-straight line, so the axis now follows the data with a 20-point floor (a steady learner
  does not read as erratic) and labels both bounds so a scaled axis cannot be misread as
  absolute. Reading and Dictation each gained the "Recent practice" section Writing's hub
  already had, so the three practice tools answer "what was I doing?" without a trip to
  Progress. Also fixed: Google avatars 503'd on every render because `lh3.googleusercontent.com`
  rejects requests carrying an unrecognised `Referer` — the three `<img>` tags now set
  `referrerPolicy="no-referrer"`, which stops leaking the page URL to Google as well. Corrected
  the IA v2 §3.2 claim that sessions expose an "upper-right" return; every route has always
  placed it at the leading edge, and the bullet now states the depth rule that decides between
  `Back to [tool]` and breadcrumbs. Evidence: root typecheck, 564-test suite, production build,
  a dead-class sweep across CSS and TSX, and authenticated browser verification of the avatar
  (`naturalWidth` 0 → 96) and of Reading's recent list against real attempt data.

- 2026-08-12 — **accepted: practice catalogues adopt the Writing row pattern.** Dictation and
  Reading moved from card grids to the row list Writing's library established, promoted out of
  `writing-library-*` into a shared `studio-row*` primitive so the name no longer leaks across
  modules. Two measurements changed the primitive on the way: row height dropped 92px → 72px
  because passage metadata is far shorter than a writing prompt's and the taller row cut a
  screen from eight entries to five, and the meta column became a capped `minmax(150px, 260px)`
  because as a `0.7fr` fraction it grew to 333px against 135px of ink and pushed every title
  away from its own metadata. Band grouping stays — Reading's fold and "your level" marker
  depend on it, and the level is already in the section header, so the row no longer repeats a
  band badge. Session hierarchy fixed alongside: Dictation's Play became a ghost control so
  Check is the only filled action on the sentence, Reading's dictation hand-off dropped to the
  shared secondary-link treatment instead of wearing the primary action's colour, and Reading's
  history rail now starts folded when there is no history, where it had been spending 290px to
  say "History (0)" beside a New Attempt link dimmed into looking disabled. Evidence: root
  typecheck, 564-test suite, production build, and browser checks of column counts across
  1400/1120/1064/1000/900/760/600/420px.

- 2026-08-12 — **accepted: Studio design-system primitives applied to the pages that skipped
  them.** `StudioPage` and `.btn` existed but the practice screens had not adopted them.
  Dictation's session buttons moved off bespoke serif Title Case onto the shared mono
  primitive; the rail's account row had no `font-family` at all and was rendering in the UA
  default, the only sans-serif in the shell; Speech's bare `<select>` elements joined
  Translate's control as a shared `.studio-select`; and Speech's submit button, unlike
  Translate's, had never disabled on empty input. Three colour-emoji empty-state icons became a
  typographic rule, and `.writing-main`, `.writing-dashboard`, and `.writing-dashboard-empty*`
  were renamed to `studio-*` — all three were already shared by Reading, Dictation, and the
  studio-wide Progress page. Added the root `ErrorBoundary` the app had never had: a bad link
  dropped signed-in learners onto the framework's unstyled default with no navigation. Added
  `--border-control`, a control-weight outline distinct from the divider weight, after
  measuring the level chips at 1.37:1 in light and 1.17:1 in dark — both below the 3:1 floor
  for non-text contrast, not just the dark theme originally reported. Fixed a dead CSS rule
  whose comment explained that the dictation breadcrumb must not run into the band label: the
  class had been renamed in the markup years' worth of refactors earlier, so the rule matched
  nothing and the two ran together as "Back to DictationA2". Also: the mobile hamburger became
  an opaque bar so content scrolls beneath it rather than behind it, and every band's fifth
  passage stopped being stranded on its own grid row. Evidence: root typecheck, 564-test suite,
  production build, computed-style verification of fonts and disabled states, and contrast
  ratios computed against both theme backgrounds.

- 2026-08-11 — **accepted: Translate composer focus indicator contained.** Kept the strong
  two-pixel action-color focus indicator while moving it inside the text composer, preventing
  the ring from covering the output divider and surrounding workspace borders. Evidence: Web
  typecheck, production build, and browser inspection of the focused composer geometry.

- 2026-08-11 — **accepted: Translate and Speech history surfaces simplified.** Removed the
  redundant New translation action from Saved translations and the duplicate History heading
  plus New generation action from Speech History. Both pages now rely on their persistent
  workspace tabs for returning to creation, so the content area has one job: show saved or
  generated history. Empty states remain explanatory without adding another competing button.
  Evidence: Web typecheck, production build, and authenticated 351px browser checks with no
  horizontal overflow or duplicate creation actions.

- 2026-08-11 — **accepted: Coach Home correction and utility workspace polish.** Replaced
  Home's equal-height framed action cards with an open editorial hierarchy: Continue keeps one
  leading accent, the recommendation is unboxed, alternatives form a stable vertical list, and
  status is separated by rules rather than another rounded container. Fixed three underlying
  state defects at the same time: a fallback B1 recommendation no longer says it fits an
  unknown current level; learners with practice history but no estimate can declare a level
  directly; and Coverage now queries the bands represented by actual Reading/Dictation history
  instead of inferring them from a bounded recommendation window. Writing continuation also
  shows its last edit. Translate now uses the shared page-tabs frame, a bounded 1120px canvas,
  visible From/To labels, and a compact mobile board whose primary action remains in the first
  viewport. Speech aligns its 780px title, tabs, and form; removes the decorative full-height
  compose card; adds a persistent Text to speak label with described help/count content and
  visible focus; and sizes the narrow editor so Generate remains reachable. Evidence: 21
  focused recommendation tests; the complete 564-test suite; root typecheck; production build;
  and authenticated 351px browser checks for all three pages with no horizontal overflow and
  visible primary actions.

- 2026-08-10 — **accepted: scalable English Studio navigation and material discovery.**
  Reworked the shared rail into a narrower, quieter navigation spine with a line-based active
  state; reshaped Coach Home into an action-first editorial workspace with a compact status
  strip and list-based detail; and changed `/writing` from a 48-card wall into a collection
  hub for General English, IELTS Academic Task 1, and Task 2. The new URL-backed
  `/writing/library` catalogue filters server-side and uses bounded keyset continuation. Its
  first page preserves the previous card design for three non-duplicated “Start here” prompts,
  then switches to compact rows so the pattern can scale. Documented the reusable
  hub → catalogue → detail contract for future Reading and Dictation libraries without
  imposing it on Translate or Speech. Owner-review follow-up places shallow detail returns at
  the leading edge and adds category-aware breadcrumbs to Writing's real three-level material
  hierarchy, extending prompt-backed workspaces through their source assignment while keeping
  freeform trails compact. Writing now consistently calls a durable workspace a Session and a
  revision within it a Round; the hub links its recent sessions to a bounded, authenticated
  `/writing/sessions` history. Catalogue filters now expose All and every level/task family as
  visible URL-backed choices, so one selection applies immediately and resets continuation
  state without requiring JavaScript. Evidence: 564 tests, Web typecheck, production build,
  local D1 collection census (24 General, 12 Task 1, 12 Task 2), and authenticated browser QA
  at 375/768/1280px covering pagination, no horizontal overflow, 44px mobile actions, visible
  focus, and mobile drawer focus restoration. Codex's in-app browser injects a third child into
  `<html>` and consequently reports Remix hydration warnings; standalone browser checks are
  clean and no application runtime error was observed.

- 2026-08-10 — **accepted: English Studio Home density and hierarchy.** Grouped continuation
  and coach recommendation into a tighter two-panel action zone, demoted recommendation
  alternatives from competing buttons to secondary text actions, and consolidated status into
  a bounded strip closer to today's work. Single Recent/Working on sections now use the full
  content width instead of leaving an empty grid column. Evidence: authenticated 351px cold
  state with 44px actions and no horizontal overflow; 564 tests, Web typecheck, production build.

- 2026-08-10 — **accepted: English Studio navigation and mobile-action polish.** The public
  module directory now mirrors the product rail’s information architecture by separating
  Practice (Dictation, Reading, Writing) from Tools (Translate, Speech, planned Dictionary),
  with a coherent `h1` → group `h2` → module `h3` outline. Global signed-out header actions
  and the landing-page start action now meet the 44px mobile touch baseline. On the anonymous
  Writing trial, the remaining quota stays grouped immediately above the submit action on
  narrow screens instead of wrapping to the opposite edge; the submit target is also 44px.
  Evidence: Web typecheck; browser screenshots at 375/768/1280px for the landing directory;
  Writing checks at 320/375/1280px with no horizontal overflow; measured 44px action targets.

- 2026-08-10 — **accepted: Dictation catalogue band spacing.** Restored the shared band-body
  wrapper around each `/dictation` card grid, so the band description divider no longer sits
  directly against the first row of passage cards. Evidence: Web typecheck and production
  build.

- 2026-08-10 — **accepted: Writing prompt batch approved and published; migrations `0016`/`0017`
  applied to production.** Batch `38d84de9ab133f3308d3ac95ec24a06c243ef60f58b6bcfc9a08244836864078`
  was approved and published to both the development D1 (`apps/web/.wrangler/state`) and
  production, so `/writing` now serves 24 General English (A2-C1), 12 IELTS Academic Task 1 and
  12 Task 2 assignments instead of the "preparing" empty state. **The batch had one reviewer, not
  two:** no second-party content review was performed, and the owner acted as both the
  independent content reviewer and the approving owner. That fact is recorded in
  `docs/approvals/writing-prompts-38d84de9.json` and carried into every published row's
  `review_manifest_json`, so the production record does not imply a reviewer who did not exist.
  Re-running a second-party content review remains open and would require a fresh manifest.
  Production migration applied `0016_writing_prompts.sql` and `0017_saved_translations.sql` only;
  `0015_drop_dormant_esl_tables.sql` was already applied to production and to the development
  database — both dormant tables were verified absent — so no `DROP` was executed in this pass.
  Evidence: pre-migration production check returned zero duplicate `(article_id, round_number)`
  groups, so `0016`'s unique index applied cleanly; `preflight`/`publish`/`verify` all pass on
  local and remote; production reports 48 rows at `status='published'` with
  `owner_approved_hash = content_hash`; the remote migration list is empty. No backup export was
  taken (owner's explicit choice). Nothing was deployed and nothing was pushed; only the owner
  may move the roadmap items to accepted.

- 2026-08-10 — **accepted: English Studio acceptance-review hardening.** Fixed the reported
  local Writing crash at both layers: the development D1 state now has additive migrations
  `0016`/`0017`, and parallel child loaders degrade to the Writing unavailable state instead
  of overriding the layout guard with `no such table`. Local workflow docs now point at
  `apps/web/.wrangler/state`, the state actually used by `pnpm dev`. Review follow-ups decouple
  a successful long translation from optional Save-proof creation; server-pin anonymous
  Writing to the one featured assignment; keep first-submit idempotency keys stable across
  loader revalidation; restore recoverable soft deletion for Writing articles and revisions;
  use hydration-safe recent dates; scope mobile touch sizing; and make destructive form
  triggers inert without the JavaScript confirmation path. The prompt pipeline now separates
  reusable domain validation from the authorized first-48 editorial policy, uses
  locale-independent canonical sorting and explicit publish-SQL quoting, and participates in
  root typecheck/tests. Evidence: 558/558 tests, clean Web + seed typecheck, production build,
  current 48-prompt/12-asset/review-pack checks, local trial GET 200, forged featured slug 409,
  Translate GET 200, and a local schema query confirming both additive tables. No prompt was
  published, no remote migration ran, and nothing was deployed. Follow-up inspection found
  both `0015` target tables already absent, so its missing local ledger record was reconciled
  without executing a DROP; the local migration list is now clean.

- 2026-08-10 — **accepted: English Studio landing-page copy refresh.** The public hero now
  describes focused practice across reading, writing, listening, speaking, and translation,
  and explains the recitation, AI writing coach, audio/shadowing, and in-workspace translation
  workflows in clearer learner-facing language. The page metadata carries the same product
  positioning. Evidence: web typecheck and production build.

- 2026-08-10 — **accepted: English Studio material, memory, and interaction iteration
  (D1-D5).** Writing is now material-led: a versioned D1 prompt contract, immutable article
  assignment snapshots, 48-source-prompt editorial pipeline (24 General English across
  A2/B1/B2/C1, 12 IELTS Academic Task 1 with content-addressed accessible assets, 12 Task 2),
  catalogue/detail/freeform/trial entry points, atomic idempotent first submission, distinct
  Task 1 factual evaluation, and generation-safe feedback retries. The current content batch
  hash is `38d84de9ab133f3308d3ac95ec24a06c243ef60f58b6bcfc9a08244836864078`;
  it was unpublished when this entry was written — see the batch-publication entry above for
  when and how it was approved and published.
  Translate now persists text only through an explicit signed-in Save backed by a short-lived
  HMAC completion proof. `/translate/saved` adds private owner-scoped list/detail/copy,
  25-row keyset pagination, idempotent retries, popup-auth handoff without losing the result,
  no-JavaScript redirect parity, and confirmed hard delete. Partial, expired, tampered,
  changed-snapshot, or wrong-subject results cannot write.
  Shared interaction work adds a focus-trapped/inert mobile drawer, accessible branded confirm
  dialog, stateful Reading record names, one migrated Reading/Writing feedback-language
  preference, honest Writing evaluation progress, safe LLM logging, and removal of new
  `next_drills` generation with legacy read compatibility. Standard browser QA found and fixed
  two remaining mobile touch-target defects (`036d2fc`, `984c27b`). Evidence: 552/552 tests,
  clean typecheck and production build, deterministic 48-prompt/12-asset/review-pack checks,
  all 17 migrations on a fresh local D1 with no foreign-key violations and indexed saved-list
  query plan, plus authenticated browser/D1 coverage at 375/768/1280px for preview/start/retry,
  explicit Save/replay/isolation/pagination/dialogs, focus restoration, and failure states with
  no console errors. Lint remains a placeholder (`lint not configured`). No prompts were
  published, no remote migration ran, and nothing was deployed; only the owner may accept the
  roadmap items and approve the content manifest.

- 2026-08-06 — **accepted: Mapdown Theme differentiation step 3 — the theme splits into
  shape × palette, and text colour becomes designed data.** The single theme id is now two
  orthogonal fields, both persisted in Markdown front matter (`shape:` / `palette:`): shape =
  shape language + canvas appearance + role base tokens + type scale; palette = the branch
  colour band. Palette entries are authored `{ fill, text }` pairs — `accessibleTextFor()` and
  `descendantTintPolicy` are deleted, and WCAG AA is a build-time test (every pair ≥ 4.5:1,
  one text colour per palette) instead of a runtime pick. Branch colour now fills only
  first-level nodes (XMind model): deeper nodes return to role base tokens and only connectors
  carry colour, so the authored pair is never blended away. Minimal Light's palette is
  redesigned as **Slate** (muted cool greys darkened for white text; the old #6b7280 family
  sat entirely inside the 3.67–4.85 luminance band where neither white nor near-black cleared
  4.5:1, which is what flipped text per branch), and the palette count grows to ten with named
  personalities (Slate, Soft Spectrum, Corporate, Night Glow, Ember, Glacier, Forest, Mono,
  Vivid, Earth); Soft Spectrum, Corporate and Night Glow keep their shipped hexes. Legacy
  `theme: X` documents still open and map onto `(shape: X, palette: X's default)`, and local
  snapshot recovery normalises the same way. Review added the two recovery regression tests
  that path was missing and found a defect through them: `normalizeThemeSelection()` threw on
  a stored document with no `theme` key at all, inside the one function whose contract is to
  survive malformed stored data — every other check in `recoverDocument` degrades to an
  earlier snapshot rather than throwing. Absent input now falls back like any unknown id. The Style picker presents Shape and Palette as
  two groups (with a mobile-scrollable popover for the 14 options), and shape/palette changes
  are separate undoable commands (`SetShape`/`SetPalette`). Spec: `spec/theme.md`
  §3/§8/§12/§14/§18/§19 and `spec/markdown-format.md` §2/§7.1/§15/§16 rewritten;
  `spec/data-model.md` §2.4 and the command union updated; `decisions.md` records D-24.
  Evidence: 529/529 repository tests (new: per-palette authored AA pairs, one-text-per-palette,
  legacy theme→pair mapping through Markdown import and snapshot recovery, explicit-axis-wins
  resolution, two-axis serialisation, palette fills/text as SVG literals, XMind-model fills,
  SetShape/SetPalette undo), clean Mapdown typecheck/build, and browser QA: Slate (min AA
  6.61), Vivid (5.26), Ember (4.75), Night Glow (6.45), Soft Spectrum (4.54), Corporate (5.25)
  and Forest (6.77) all render one uniform text colour per map with no black/white flip;
  Business × Forest editing overlay matches its covered node's fill/text exactly; a legacy
  `theme: soft-branches` document imports and renders the Soft shape with Soft Spectrum fills;
  the exported SVG carries the literal branch fill, authored text colour, role text and canvas
  colours; the Style menu fits 375px width and scrolls internally at 375×667. Only the owner
  may mark this checkpoint accepted/shipped.

- 2026-08-06 — **accepted: Mapdown Canvas affordances.** Four independent items. (a) Zoom
  now lives in a floating bottom-left capsule (− / percentage / +); clicking the percentage
  restores 100% without moving the viewport centre. The status-bar percentage and the View
  menu's inline zoom controls are gone; the View menu keeps Fit map, Centre selection and
  Reset zoom to 100%, and `Primary+0` still works. (b) An empty, undismissed map shows a
  dismissible one-line hint ("Enter = sibling · Tab = child") that disappears the moment the
  map gains any content beyond the root and can never appear in an export; dismissal is
  remembered in localStorage. (c) A fresh document's starter theme follows the system colour
  scheme (light → Minimal Light, dark → Dark), strictly as an initial value — a stored
  document or a user pick always wins. (d) Nodes draw an inset hover ring in `hoverOutline`,
  distinct from the outer selection ring and the editing textarea ring, suppressed while
  selected or dragged, with no hit target and no geometry change. All four are chrome or
  interaction tokens, so exports and document themes are untouched; the canvas frame was
  wrapped so the capsule and hint sit outside the ARIA tree role, and the frame — not the
  surface alone — carries the help-background marking, so opening Help inerts the capsule and
  hint along with the canvas rather than leaving two floating controls exposed to a virtual
  cursor. Spec:
  `spec/product-specification.md` §2.1 and `spec/interaction.md` §2.3/§12.5 updated;
  `decisions.md` records D-23. Evidence: 476/476 repository tests (4 new:
  `themeIdForSystemScheme` mapping, hint show/disappear/dismiss rules), clean Mapdown
  typecheck/build, and browser QA at 375/768/1280 px widths plus dark-system and
  reduced-motion emulation: capsule percent click resets to 100%, hint dismisses and stays
  dismissed, hover ring appears on pointer enter and never with selection, ⌘0 still resets,
  and the fresh starter renders the system-appropriate theme. Only the owner may mark this
  checkpoint accepted/shipped.

- 2026-08-06 — **accepted: Mapdown Theme differentiation steps 1–2.** Step 1 — the branch
  palette reaches the nodes: in `by-first-level-branch` mode the first-level node fill is the
  branch colour (previously it tinted connector strokes only), and node text is switched to
  the accessible partner of that fill (white or `#16181c`, whichever clears WCAG AA).
  Descendants follow `descendantTintPolicy`: `same` themes keep the full branch fill,
  `same-with-opacity` (Soft Branch Colors) blends it over the canvas at the same 0.65 the
  connectors use, keeping exports literal and solid. `single` mode and the root are untouched,
  and the canvas renderer, SVG export and editing overlay all read one `nodeFillAndTextFor()`
  helper, so a branch-coloured node and its editing textarea cannot disagree. Business's
  `#5a7f9e` could not clear AA with either text candidate (4.23/4.20) and was replaced by
  `#4a6f95` (white text, 5.25). Step 2 — shape language: the four presets now differ in
  corner radius, border weight, padding density and root treatment (hairline rounded Minimal,
  large-radius roomy Soft, squared heavy-border dense Business, medium-radius subtle-border
  Dark) instead of hue variants. C-01 is restated: selection is a ring and the ring must not
  coincide with a palette colour, now that branch colour reaches fills. Spec: `spec/theme.md`
  §8.3/§13 restated; `decisions.md` records D-22. Evidence: 472/472 repository tests (10 new:
  per-palette AA partners, same-with-opacity blend AA, first-level/descendant fills, root and
  single-mode verbatim, D-22 grayscale shape signatures, export literals for branch and
  blended fills), clean Mapdown typecheck/build, grayscale pixel QA showing all six theme
  pairs clearly distinct (RMSE 0.24–0.79), rendered exports containing the expected branch
  and blended fills, and browser QA: canvas shows `Alpha #6b7280/white` and
  `Beta #8a7f6d/dark`, toggling branch colours off restores `#f6f7f8`, and the editing
  textarea on a branch-coloured node matches its fill, text, 15px/500 and padding at
  <0.01px alignment. Only the owner may mark this checkpoint accepted/shipped.

- 2026-08-06 — **accepted: Mapdown three-tier type scale (Theme differentiation, step 2).**
  Node hierarchy is now expressed through type size, not indentation alone: the shared
  `TYPOGRAPHY` constant in `presets.ts` moves to root 18px/600, first level 15px/500, and
  every deeper node 13px/400, with line height fixed at 1.45. The four presets' root
  `paddingY` rises to 10 so the 18px label is not cramped. The scale stays at exactly three
  tiers — depth ≥ 2 clamps to 13px, never decreasing further — and 13px is the CJK legibility
  floor. `layoutOptionsForTheme()` now derives measurement from the same `roles.ts`
  `roleTokens`/`roleTypography` helpers as the canvas renderer, editing overlay and exporter,
  and the SVG exporter's local copies of those helpers were removed in the same pass —
  closing the duplicate-derivation class of bug c55276c repo-wide. Spec: `spec/theme.md` §6
  states the three-tier / no-per-depth-step / 13px-floor contract; `decisions.md` records D-21.
  Evidence: 462/462 repository tests (2 new: measurement-vs-renderer role parity across all
  four themes and depths, and the three-tier hierarchy with floor plus root padding), clean
  Mapdown typecheck/build, expected box metrics recomputed from the tokens
  (root height 18×1.45 + 2×10 = 46.1), and browser QA at 50%/100%/200% zoom showing the
  editing textarea font/padding matches its covered node at every scale. Only the owner may
  mark this checkpoint accepted/shipped.

- 2026-08-06 — **accepted: Mapdown two-sided connector mirror fix.** In two-sided layout the
  root's single stored `outwardEdgeX` always pointed at the right edge, so a left first-level
  connector started at the root's right edge, spanned the whole root, and placed its bézier
  control points at that long span's midpoint — the left curve then did not mirror the right
  one (the opaque root rect hid the crossing segment). `connect()` now picks the root edge
  facing each child by comparing the child's inward edge with the root centre, and only for
  the root (depth 0): non-root nodes keep their stored outward edge and `layoutRightOnly` is
  untouched, so right-only geometry is byte-identical. Spec `spec/layout-engine.md` §10.1/§10.2
  now states that the root has two outward edges — one per side — in two-sided mode, and each
  root connector MUST leave the edge facing its branch. Evidence: 460/460 repository tests
  (1 new regression test asserting the four path x coordinates of a left branch's connector
  strictly mirror a mirrored right branch's about x = 0, with the left connector starting at
  the root's left edge), clean Mapdown typecheck/build, and headless-Chrome pixel QA: node
  rects and connector curves render as exact horizontal mirrors (an original-vs-mirrored SVG
  render differs only in glyph antialiasing), and the before/after pixel diff is confined to
  the visible left connector region. Only the owner may mark this checkpoint accepted/shipped.

- 2026-08-05 — **accepted: Mapdown editing-state fidelity.** The editing textarea now overlays
  its node exactly: the highlight ring is a box-shadow drawn *outside* the box instead of a
  2px border that consumed 4px of content width, so two full-width CJK characters ("一二",
  28px of text in a 52px box) no longer wrap into two lines. Fill, text, corner radius and
  typography come from the covered node's role tokens through a shared `roleTokens` /
  `roleTypography` helper that the canvas renderer also uses, so dark system chrome can no
  longer bleed into a light map (the ring alone uses the theme's `editingOutline`). Every
  metric the textarea carries — font size, padding, radius, ring width — is multiplied by
  `viewport.scale`, keeping editing pixel-identical to the node at any zoom. First-level nodes
  are now measured with the rendered `level1FontWeight` (500) instead of the default 400, so
  layout and rendering agree on box width. The textarea keeps a 2px screen safety margin in
  its own right padding, absorbing canvas-measure vs browser-layout subpixel differences
  without enlarging the node box. Spec: `spec/theme.md` §9 and `design-tokens.md` now state
  the editing-overlay contract. Evidence: 459/459 repository tests (1 new), clean Mapdown
  typecheck/build, and browser QA at 100%/50%/200% showing textarea-vs-SVG getBoundingClientRect
  deltas ≤ 0.01px, no unexpected wrap for 「一二」, 16 CJK chars (248px, below the 260 maxWidth)
  or mixed CJK/Latin, root 16px/600 and first-level 14px/500 matching the rendered roles, and
  all four themes matching node fill/text under simulated dark chrome (Minimal Light
  #f6f7f8/#1c1e21, Soft Branch Colors #ffffff/#2b2a27, Business #eef2f7/#12263f, Dark
  #24272c/#e8eaed). Only the owner may mark this checkpoint accepted/shipped.

- 2026-08-05 — **accepted: Mapdown layout-switch and editing-fidelity fixes.** The Arrange
  layout toggle now visibly balances first-level branches when entering two-sided mode from
  the right-only placeholder state (all branches share one side), and presents as two
  selected-state options (Right-only / Two-sided) like the Document theme picker instead of a
  single toggle. Layout-mode, theme and branch-colour changes are now single undoable
  presentation commands that keep the selection and restore the exact previous mode, sides and
  theme on undo. Dragging a first-level branch to reorder it no longer silently flips its side.
  The editing textarea uses the node role's theme typography (root 16px/600, first level
  14px/500) instead of a fixed 14px, so a label no longer visibly shrinks while editing. Node
  and connector memoization now compares box/path geometry by value, restoring the intended
  single-node re-render while typing, and the text-measurement cache is bounded. Recovery
  rejects snapshots declaring a future schema version and sanitizes a dangling stored
  selection. Evidence: 458/458 repository tests (15 new), clean Mapdown typecheck/build, and
  browser QA showing Alpha/Gamma on the right and Beta on the left after switching
  (x=751/748 vs 475), undo returning Beta to the right, and editing font metrics 16px/600 and
  14px/500 matching the rendered roles. Only the owner may mark this checkpoint
  accepted/shipped.

- 2026-08-04 — **accepted: Mapdown interaction-state clarification.** Split the execution
  paths that the keymap already called `commit-edit` and `create-sibling`: Enter in an active
  textarea now commits only and returns the same node to selected mode, while a later Enter
  creates exactly one sibling/root child. A newly created empty leaf remains protected from
  repeated-Enter accumulation. Added the consolidated four-axis interaction state table and
  amended the product, interaction, keyboard, Help, acceptance and phase specifications.
  Markdown, SVG and PNG downloads now use the sanitized visible root label rather than the
  inaccessible internal document title. `⌘0`/`Ctrl+0`, the View menu and Command Center reset
  canvas zoom to 100% without moving the viewport centre or entering history. Evidence: 443/443
  repository tests, clean Mapdown production build, and browser checks proving node counts
  `1 → 1 → 2` across edit-Enter then selected-Enter, empty-node count stability, editing
  preserved across a `156% → 100%` reset, generated Help discovery and zero console warnings.
  Only the owner may mark this checkpoint accepted/shipped.

- 2026-08-04 — **accepted: Mapdown live-editing correctness.** Fixed the production path where
  Enter correctly committed a label and created the next empty node, but clicking away let the
  canvas selection handler and textarea blur both cancel that empty session; the second
  cancellation silently removed the label that Enter had just committed. Editing sessions are
  now synchronously consumed once. The canvas also lays out the visible draft while typing, so
  the textarea, SVG node and connectors resize and reflow together without adding per-character
  undo entries. Double-click now enters editing with the caret after the existing label, while
  `F2` keeps the select-all replacement behavior. Evidence: two new regression tests, 441/441
  repository tests, clean Mapdown typecheck/build, and real-browser reproductions showing a
  long root grow from about 95×39px to 248×109px, remain intact after Enter and leaving the empty
  next node, and accept appended text after a double-click. Only the owner may mark this
  checkpoint accepted/shipped.

- 2026-08-04 — **accepted: Mapdown visual-polish checkpoint.** Replaced fifteen equal-weight
  toolbar controls with seven top-level actions and grouped Arrange, View, Style and File
  popovers; added theme previews, clear action hierarchy, restrained chrome tokens, responsive
  mobile panels, status treatment and deterministic Escape/focus restoration. Selection now
  uses a separate outer ring, connectors and collapse badges are more legible, and layout plus
  fallback export measure the same root/level typography the canvas renders. Evidence: 439/439
  tests, clean production build, no browser console errors, desktop and 375px mobile menu/focus
  checks, and visual QA on the 72-node Chinese fixture. Only the owner may mark this checkpoint
  accepted/shipped.

- 2026-08-04 — **accepted: Mapdown active-draft persistence.** Autosave snapshots now include
  the text currently visible in the editing textarea before Enter, Escape or blur commits the
  editing session. The snapshot-only overlay keeps one undo group per session and avoids
  per-keypress layout, while `visibilitychange` and `pagehide` flush the latest draft and
  unresolved writes receive the spec-bounded unload warning. Evidence: focused persistence and
  storage tests, 437/437 repository tests, a clean Mapdown production build, and real-browser
  recovery after both a settled debounced save and a refresh roughly 100ms after typing. Only
  the owner may mark this checkpoint accepted/shipped.

- 2026-08-04 — **accepted: Mapdown production deployment (D-03).** Created the
  Git-connected `mapdown` Cloudflare Pages project from the shared repository, with `main`
  production builds rooted at `apps/mapdown`, the documented monorepo build command, and an
  app-local Wrangler output configuration. Bound `map.bcailab.com` and narrowed build watch
  paths to `apps/mapdown/*` + `packages/*`; the existing web project is independently narrowed
  to `apps/web/*` + `packages/*`. Evidence: both Pages checks pass, the production deployment
  for merge commit `7c69722` is active, Cloudflare lists the custom domain, and the live HTTPS
  URL returns HTTP/2 200 with the current Mapdown assets. Only the owner may mark this
  checkpoint accepted/shipped.

- 2026-08-04 — **accepted: Mapdown production interaction gates.** Completes Steps 15–17:
  a searchable Help/Command Center generated from the executable keymap and command registry;
  platform-aware shortcuts, disabled-command explanations, focus trapping and restoration;
  semantic document-order tree items with level, side, expansion and selection metadata;
  single-tab-stop canvas navigation, live operation feedback, reduced-motion handling and
  coarse-pointer targets. Markdown opening is atomic, confirms destructive replacement,
  reports parse warnings, enforces resource limits, and lazy-loads CommonMark so the initial
  bundle remains 81.55KB gzip. Evidence: 434/434 tests, clean production build, browser
  keyboard/focus/responsive/accessibility/import checks, and deterministic 100/500/2,000-node
  performance baselines in `docs/mapdown/performance.md`. Only the owner may mark this
  checkpoint accepted/shipped.

- 2026-08-04 — **accepted: Mapdown Phase 2 checkpoint — layout, export, parser and move
  interaction.** Adds sticky two-sided branches, document themes, pan/zoom/fit, SVG/PNG export,
  a real CommonMark parser with a mutation check that proves escaping is parser-visible, and
  the complete Step 10 move path. Pointer dragging now has a label/subtree-count preview,
  before/after/inside and cross-root side targets, patterned invalid feedback, a 4px threshold,
  Escape/pointer-cancel safety, and bounded edge autopan; keyboard and toolbar alternatives
  expose the same semantic move commands. Evidence: 425/425 tests, clean production build, and
  browser regression checks for threshold, valid reorder, invalid no-op, cancel, preview and
  cross-root side movement. Only the owner may mark this checkpoint accepted/shipped.

- 2026-08-04 — **accepted: Mapdown Phase 1 semantic editor (PR #26).** The review candidate
  contains the document model and ten enforced tree invariants, pure invertible commands,
  session-grouped undo/redo, right-only variable-size layout, keyboard-first editing with IME
  protection, canonical Markdown import/export, and IndexedDB autosave with validated snapshot
  recovery. Pre-landing review added production-backend IndexedDB coverage, direct IME guard
  boundary tests, stable canvas callbacks so typing does not reconcile every SVG node, correct
  F2 selection and editing-session undo behavior, and a recovery failure path that cannot
  permanently disable later saves. Final review also closed restored-session ID collisions,
  cross-session snapshot overwrites, selection clearing, and abandoned empty-node handling.
  Evidence: 287/287 tests, a clean production build, and browser regression checks. Only
  the owner may change this entry from `in_review` to accepted/shipped.

- 2026-07-30 — **Streaming translation output.** `/translate` no longer waits for the whole
  model response: a new SSE resource route (`/translate/stream`) streams the translation as it
  is generated, cutting time-to-first-text from the full generation time to first-token time
  (~1.7s vs ~2.7s on a 145-character sample; the gap widens with length). Added `streamGemini`
  to the shared LLM layer beside `callGemini`, so any task can stream without changing which
  model serves it. Because JSON cannot be read mid-stream, the streaming prompt emits the
  detected language as a `#lang:` header line that the server strips before forwarding deltas.
  Validation and quota moved into `translate-request.server.ts`, shared with the untouched
  `/translate` action, which remains the no-JS fallback. Usage is still charged only on a
  completed translation.
- 2026-07-30 — **Semantic colour layer.** Replaced pigment-named `--accent` / `--red`
  contracts with action, danger, warning and success families for both themes. Primary
  actions retain the Studio's vermilion while errors/destructive controls use a distinct
  crimson, warnings use ochre and completed/positive states use sage. Migrated form/login/
  translation errors, destructive menus, writing feedback, Speech warnings, Reading status,
  Dictation diffs and progress trends; the previously undefined `--sage` fallback is gone.
  Usage rules and light/dark values are documented in `docs/design-system.md`.
- 2026-07-30 — **Reading progress includes library attempts.** Repointed the completed-attempt
  history query from the rollback-only `esl_passages` table to the unified `passages` table,
  matching the foreign key introduced by the material-layer migration. `/reading/progress`
  now counts and averages evaluated attempts on global library material as well as the
  learner's own texts. Audited the remaining legacy-table reads: they belong to the retained
  legacy passage CRUD only; no other attempt/history query still joins the stale table.
- 2026-07-29 — **Studio brand and account controls restored.** Corrected two app-shell
  regressions found after deployment: the bcailab mark once again returns to the site
  homepage instead of bouncing a signed-in learner back to English Studio Home, and the
  pinned avatar is again an interactive account menu rather than a static identity row.
  The shared menu exposes profile context, theme, sign-out and tool Settings when available.
- 2026-07-29 — **English Studio secondary-page semantics and hydration consistency.**
  Extended the app-shell contract beyond primary catalogues and dashboards: Reading,
  Writing and Speech settings now use the shared page frame; progress, creation, settings
  and detail routes provide tool-specific browser titles; every secondary workspace has one
  semantic `h1`; and Writing's edit control no longer lives inside its heading. Fixed the
  real Reading workspace hydration mismatch by rendering persisted rail/panel preferences
  from deterministic SSR defaults and restoring them after hydration, applying the same
  rule to the equivalent Writing detail panel. Documented these as acceptance rules in
  `docs/studio-app-shell.md`.
- 2026-07-29 — **English Studio application shell and page-frame contract.** Replaced the
  collection of route-owned outer coordinate systems with two reusable layers:
  `StudioShell` now owns the rail/main/canvas nesting for every primary tool, and
  `StudioPage` owns the shared title, description, page action, local tabs, content origin
  and three controlled body widths. Migrated Home, the three Progress views, Dictation,
  Reading, Writing, Translate and both Speech workspaces. The result keeps catalogue,
  focused-form and two-pane layouts appropriately different without letting each page
  redefine its margins or heading rhythm. Speech now has a real page header while
  Generate/History remain tool-local tabs; history still never enters the product rail.
  Verified public surfaces at desktop, tablet and mobile widths and confirmed that the main
  inset, rather than the document body, owns long-page scrolling. Architecture and adoption
  rules: `docs/studio-app-shell.md`.
- 2026-07-29 — **English Studio rail boundary and unified Progress entry.** Strengthened
  the product navigation contract from "no history" to "destinations only": removed the
  pinned-action API from the shared rail, so Reading and Writing can no longer add local
  creation or progress controls beneath the tool list. `/english/progress` is now the one
  visible Progress entry; `/reading/progress` and `/writing/progress` remain stable,
  tool-scoped drill-down routes with their native metrics rather than being flattened into
  a synthetic score. The three views share an `Overview / Reading / Writing` workspace
  switcher while the rail continues to highlight product-level Progress. Reading's
  "Add text" moved to its catalogue header; Writing's root workspace now identifies itself
  as "New piece".
- 2026-07-29 — **English Studio shell and navigation contract.** Standardised the learner
  surfaces around one collapsible product rail: stable `English Studio` identity, `Home`
  and product-level `Progress` first, then practice/tools, with tool-local actions in a
  separate context section. Translate now stays inside the shell. Removed Speech,
  Dictation and Writing history rows from the rail until a cross-tool session contract
  exists, and removed the shared rail's arbitrary list slot so tools cannot reintroduce
  history ad hoc. Speech generation history moved to a real `/speech/history` workspace
  tab beside Generate, following the tool-local pattern rather than global navigation;
  concrete Dictation, Reading and Writing workspaces expose an explicit return to their
  tool. Fixed the viewport/scroll ownership bug that locked catalogues such as
  `/dictation` and `/reading`: ordinary pages now use the main content scroller, while
  only editor/session layouts opt into bounded inner scrolling.
- 2026-07-28 — **Library expanded to forty passages, with reference audio.** Ten graded
  passages per CEFR band instead of five, across five topics the library did not previously
  cover (health, shopping, family, transport, hobbies), generated per band so the register
  stays distinct. Fixed a blocking defect found on the way: `publish.ts` still wrote to the
  legacy `dictation_passages` / `dictation_sentences` tables while the app has read from
  `passages` since migration 0012 — anything published since that migration would have been
  invisible to both Dictation and Reading, and the pipeline had not been run end to end since.
  Closed the material layer's §9.1 reference-audio gap in the same pass, exactly as that doc
  asked, so the TTS bill is paid once: every newly published passage now also gets a
  whole-passage recording at `material/{id}/reference.mp3`. Added `intake.ts`, which the
  documented manual path never had — it turns a hand-written batch into `out/*.json` and
  enforces the constraints (digits are an error, not a warning: a learner cannot tell whether
  to type "25" or "twenty-five"). One passage was edited before publishing rather than accepted
  as generated, which is what the human review pass is for. Verified live: forty passages
  render on production, per-sentence audio streams, and a reference object downloads from R2
  at the recorded byte size.
- 2026-07-28 — **English Studio IA v2 / Coach Home** (all three phases, PR #17). The studio
  moves from tool-first — a menu of five peer apps — to coach-first: `/english/home` is the
  signed-in top surface and answers *continue this / do this next*, with progress data
  supporting the recommendation rather than fronting it. `/english` keeps its URL and its
  marketing job for signed-out visitors and redirects signed-in ones, so the acquisition
  surface and the app surface stay separable. A shared `english-modules.ts` registry now backs
  the landing page, the rail and the Home, which fixed a real bug: the rail's drifted copy of
  the module list bypassed trial routing, so an anonymous visitor picking Reading from it got a
  login bounce where the landing page would have opened `/reading/trial`. The rail became
  static navigation; Reading's catalogue became the material surface, grouped by band with
  practice state on each card and the learner's own texts as a visible secondary section.
  `/english/progress` was **kept** as the depth destination rather than folded into the Home —
  folding it in would have recreated the orphaned-progress problem the iteration set out to fix.
  `selectStarterPractice()` is the recommendation seam: pure, deterministic, 21 tests, ranking
  nothing by tag profile, and returning a *list* of actions with reasons so matching and the
  later planning layer inherit the shape. Two constraints are enforced by tests rather than
  assumed — a null level is never rendered as B1, and alternatives are directional
  (easier / challenge / different topic) rather than a slot-machine reshuffle. Design:
  `docs/english-studio-ia-v2-design.md`; structural prototype: `docs/mockups/ia-v2.html`.
  Deliberately excluded: the matching service, the session/planning layer, and any
  recommendation service, repository layer or feed framework.
- 2026-07-23 — Grader variance spike: `scripts/grader-variance.ts` calls the reading evaluator
  5× against the same (audio, passage) pair and reports per-dimension stddev + CEFR-guess
  agreement. Three real recordings tested (`docs/spikes/grader-variance-*-20260723.md`): a
  ~80-word plain passage (overall stddev 0.00, 100% CEFR agreement), a ~30-word jargon-dense
  sentence (stddev 2.79, one CEFR flip, 80% agreement), and a ~30-word plain sentence matched in
  length to rule out length as the driver (stddev 1.20, 100% agreement) — ruling out sentence
  length and pointing instead at vocabulary/register density as the likely source of what
  variance exists. All three stayed under the roadmap's 4-point threshold. Conclusion: the
  single-call reading grader is repeatable enough on most material that the deterministic-split
  rebuild is not currently justified — see the downgraded item in Later with its re-trigger
  condition. This turns the learner model's reading-observation down-weight
  (learner-model-design §5.2) from an untested assumption into a data-backed one, though
  further samples on jargon-dense material would sharpen it.
- 2026-07-21 — Shared learner model + unified progress centre: every scored attempt now
  writes deterministic per-tag observations (`learner_tag_observations`, keyed on the
  `passage_tags` vocabulary) that aggregate into a shared profile — `esl_learner_profiles`
  generalised beyond reading with per-tag mastery (`tag_mastery_json`) and a measured CEFR
  estimate. Dictation attributes errors deterministically by reusing the tagger's own
  per-word predicates (one definition, no drift); reading contributes a down-weighted
  LLM-judged signal from evaluation highlights. A throttled background pass names the
  patterns for the learner (the write path `esl_learner_profiles` was designed for and never
  had) and never decides them. Level self-selection is stored and a confident dictation
  measurement overrides it gradually and visibly. New `/english/progress` growth surface;
  per-tool dashboards stay as drill-downs. Migration 0014. Excludes the matching service by
  design (still Dictation v2 in Later), onboarding UI, and a writing→tag write path.
  Design: `docs/learner-model-design.md`.
- 2026-07-21 — English Studio repairs: partial dictation practice is persisted and
  resumable (an unfinished passage used to be discarded silently, which is why production
  had zero dictation attempts); module navigation stays inside the product, with the rail
  logo going to `/english` and the tool name doubling as a module switcher; `/reading`
  became a catalogue with creation moved to `/reading/new`, and dictation sessions dropped
  the competing rail; and each practice mode offers the same passage in the other mode at
  the point where that is the natural next step. Migration 0013. Deliberately excludes
  browse IA, which waits on the learner model — `docs/archive/english-studio-ia-design.md` §2.

- 2026-07-21 — Material layer unified: dictation and reading now share one graded passage
  store (`passages` / `passage_sentences` / `passage_tags` / `passage_stats`), so a single
  passage can be taken as dictation *and* read aloud. Adds a deterministic tagger — tags
  derived from text by code, never guessed by a model, so they are reproducible and can be
  recomputed over the whole library when the vocabulary changes — plus per-passage
  empirical difficulty accumulated from every scored attempt including anonymous ones.
  Reading gains a graded library alongside the learner's own texts, with authorization
  collapsed into one predicate. Migration 0012 moves all 20 library and 14 user passages
  with ids preserved and deletes nothing. Excludes the matching service by design.
  Known gap: whole-passage reference audio for library passages was not built (design
  §9.1) — do it with the next library expansion so TTS is paid once.
  Docs: `docs/material-layer-design.md`.
- 2026-07-21 — Try-before-sign-in extended to Reading and Writing: `/reading/trial`
  (fixed sample passage, record once, real evaluation) and `/writing/trial` (one coach
  feedback round), both public and both persisting **nothing** — no attempt or article
  rows, and the reading trial never writes the audio to R2 at all, passing the bytes
  straight to the evaluator instead of using a `trial/` prefix plus cleanup. 5/day per
  anonymous visitor via the `feature_usage` quota table built for Dictation v1. The
  `/english` Reading and Writing cards now route signed-out visitors into the trials
  instead of opening the login popup; the popup appears from inside the trial once the
  quota is spent. Docs: `docs/tools/esl.md`, `docs/tools/writing.md`.
- 2026-07-21 — Dictation v1 shipped: pre-generated global material library (20 passages,
  5 each at CEFR A2–C1; 211 per-sentence Chirp3 MP3s in R2 under a public `dictation/`
  prefix), `/dictation` library + session workspace with replay and speed control,
  deterministic diff scoring (`dictation-diff.ts`, British/American spellings equivalent,
  flooding guard), signed-in attempt history with background LLM error-pattern feedback,
  and anonymous access via the new generic `feature_usage` quota table. Content is seeded
  offline by `scripts/material-seed/` (generate → owner review → publish); there is no
  runtime generation. Two decisions during implementation: scoring runs server-side rather
  than client-side so the reference text never reaches the browser, and quotas were raised
  well above the design's original numbers because a v1 session consumes no LLM tokens.
  Docs: `docs/tools/dictation.md`, design `docs/dictation-v1-design.md`.
- 2026-07-20 — Iteration started 2026-07-15 completed: unified LLM call layer
  (`llm.server.ts` routing table, per-tier translate models, `GEMINI_BASE_URL` override);
  anonymous translate quotas (5,000 chars × 8/day anon; 20,000 chars × 200/day signed-in);
  email OTP login via Resend (domain verified 2026-07-16; real delivery to QQ/163
  mailboxes tested and sign-in confirmed 2026-07-20).
- 2026-07-15 — Homepage redesigned as studio page (every.to style); `/english` product
  landing page merging Reading/Writing/Translate/Speech as one product; `/translate`
  DeepL-style tool (Gemini-driven).
- 2026-04-02 — Reading progress dashboard; ESL reading compose layout refactor.
- 2026-03-05 — Reading/Recitation v2 redesign complete.
