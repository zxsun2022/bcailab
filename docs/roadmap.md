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

## Continuing learner-surface constraints

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

The accepted English Studio iteration (D1–D5) added three more that still bind:

- Translation text is persisted only after an explicit signed-in **Save** action. There is no
  automatic history or anonymous persistence.
- Prompt levels are discovery metadata, not measured ability.
- Reading evaluations no longer request `next_drills`; stored historical feedback that has the
  field must remain readable.

The **matching** service (Dictation v2) remains in Later at the `selectStarterPractice()` seam.
The older suggestion of a shared session/planning entity is not active scope: [ADR 0007](decisions/0007-no-cross-tool-practice-session-entity.md)
rejects a cross-tool practice-session entity. Each tool retains its native model.

## Now — Learner context for graders

The owner authorized Stage 1 of [the learner context proposal](learner-context-proposal.md) on
2026-09-15 and confirmed its five decisions as recommended. The problem, verified in code: every
grader remembers one object rather than the learner — Reading one passage, Writing one session,
Dictation feedback one attempt. Writing's feedback never reaches the shared learner layer, and the
only cross-mode input any grader receives is at most eight profile phrases on the Reading
evaluator.

### Decisions (owner, 2026-09-15)

- **D1 — Context is separate from measurement.** A grader may be given profile aggregates labelled
  with their provenance, and earlier coach feedback labelled as earlier AI judgement; nothing in
  context is written back as a measurement. Recorded as
  [ADR 0010](decisions/0010-grader-context-is-separate-from-measurement.md).
- **D2 — Saved translations are excluded** from grader context.
- **D3 — Rollout order is Dictation → Writing → Reading.** Reading receives context only after the
  bias evaluation in (d) passes. The evaluation also runs against today's `persistent_issues`
  injection, whatever Stage 1's outcome.
- **D4 — Stage 2 follows Stage 1** as context-only structured categories (see Next).
- **D5 — The design text describes the code.** `docs/learner-model-design.md` §1 and §7 were
  corrected in the authorizing change. Folding Reading's `cefr_guess` into the CEFR estimate is a
  measurement change that needs its own evidence, and is not part of this item.

### Scope

- A pure learner brief and per-grader projection beside `learner-model.ts`, and a server assembler
  reading at most four bounded sources: the profile row; the latest feedback round of up to six
  other non-deleted Writing sessions; up to six other completed Dictation attempts with feedback;
  and up to six Reading evaluations on other passages. Bounds, grouping, truncation and the
  projection table follow proposal §4.2–§4.3. Assembly is deterministic over the history available
  at call time; it is not a reproducible record of what a past evaluation saw (proposal §4.1).
- Every tag-accuracy line states its provenance. Tags only Dictation writes are deterministic
  measurement; Reading's six tags blend down-weighted LLM observations into `tag_mastery_json`, so
  they are labelled as possibly including earlier AI judgement.
- One prompt section with one renderer, placed after each grader's rubric and before the work
  being judged, carrying the usage rules in proposal §4.4. When Reading is enabled, its brief
  replaces the current `persistent_issues`/`strengths` injection.
- The Dictation prompt gives the learner's level — or "not established" — separately from the
  passage band.
- For Reading's gate: a `--brief <file>` option on `scripts/grader-variance.ts` for the preliminary
  screen, and a harness that runs the bias evaluation in (d) over its recording set.

### Acceptance criteria

- (a) **Pure logic, vitest-covered.** Output stays under the character ceiling however much history
  exists; a null level renders "not established" and never B1; no empty section appears when
  evidence is absent; ordering and truncation are deterministic; each projection contains only
  what proposal §4.3 assigns to its grader; every tag line carries its provenance, and no tag in
  Reading's six-tag set is ever labelled as measured.
- (b) **Data scope, verified against local D1 on the dev server.** A brief never contains another
  user's data, rounds of a deleted Writing session, soft-deleted Dictation attempts, or evaluations
  of deleted Reading attempts, and the assembler never reads `saved_translations`.
- (c) **Prompts.** Dictation feedback, Writing feedback and Reading evaluation include their
  projection for signed-in learners, enabled in that order. Trial prompts are unchanged, proven by
  prompt fixtures. The Dictation prompt no longer presents the passage band as the learner's level.
- (d) **Bias evaluation before Reading is enabled.** A standard deviation is not evidence here: it
  measures stability, and a context that shifts every result the same way passes it. Recorded in
  `docs/spikes/`:
  - *Preliminary screen.* The single-recording `--brief` spike — five runs each with no brief, a
    false brief and a true brief. It can stop Reading early; it cannot enable it.
  - *Recording set, fixed before any run.* At least six recordings from at least two speakers,
    testing at least `th_sound` (word-level attribution) and `linking` (prosodic attribution). Each
    tested weakness is present in at least two recordings and absent in at least two, and at least
    two recordings also carry known errors outside their tested tag. Ground truth is never the
    grader's own judgement: it comes by construction where possible — a passage's reference TTS
    recording for "absent", scripted errors on pre-listed words for "present" — and otherwise from
    a human annotation committed before the first run.
  - *Runs.* Five per recording with no brief, and five with a brief asserting that recording's
    tested weakness.
  - *Pass, all of:* the brief shifts the pooled mean overall score by at most 2 points, and no
    single recording's mean by more than 4; where the tested weakness is absent, its attributed
    accuracy — hits ÷ exposure, exactly as `attributeReadingErrors` computes it — falls by at most
    0.05 pooled; and the share of known errors outside the tested tag that get highlighted falls by
    at most 0.10 pooled, since Reading keeps at most eight highlights and a primed weakness can
    crowd real errors out.
  - The same evaluation runs against today's `persistent_issues` injection and is recorded
    regardless. These thresholds are fixed here, before any run; changing them is the owner's call.
    A failing result is reported to the owner rather than worked around, and choosing between the
    fallbacks in proposal §5 is also the owner's call.
- (e) **Cost and latency.** At most four additional bounded D1 reads per evaluation, performed
  inside each grader's existing evaluation task, so no page request gains a query unless it
  already waits on the model call (Reading's inline path when `waitUntil` is unavailable). Assembly
  failure degrades to no brief and never fails an evaluation.
- (f) **Unchanged contracts.** No migration, and no change to stored feedback schemas,
  `learner_tag_observations`, `SOURCE_WEIGHT`, the naming pass, or CEFR resolution.
- (g) **Privacy.** No brief content in logs — counts and ids only.
- (h) **Verification.** `pnpm test`, typechecks, lint (0 errors) and both production builds pass.
- (i) **Docs in the same PR.** The grader-context sections of `docs/tools/esl.md`,
  `docs/tools/writing.md` and `docs/tools/dictation.md`; the learner-model paragraph of
  `docs/architecture.md`; and a `docs/changelog.md` entry marked `in_review`.

### Explicitly excluded

Stage 2 categories (Next); Writing observations or a Writing measurement vocabulary (Next); any
change to aggregation, `SOURCE_WEIGHT`, the naming pass or CEFR resolution, including folding in
Reading's `cefr_guess` (D5); the recommender and Dictation v2 matching; a Today queue, an enrolment
unit, or an offline job runner; any new learner-facing surface; trials; and saved translations
(D2).

### Progress

Accepted on 2026-09-18: the Dictation and Writing steps below. Accepted on 2026-09-21: the
Reading gate tooling and its corpus kit — the tools, not a bias result. Still open: Reading, which
the rollout order (D3) places last and the bias evaluation in (d) gates. No recording or experiment
exists and nothing in Reading's prompt changed, so this item stays active for that half and its
acceptance is deliberately not claimed here.

- **Dictation feedback step — accepted (2026-09-18).** Dictation feedback, first in the rollout
  order, now receives the learner brief. Evidence: the pure
  `learner-context.ts` is covered by 17 tests (a null level never rendered as B1, provenance on
  every tag line, exposure and mastery thresholds, exclusion of the current, unfinished and deleted
  attempts, dimension normalisation, the grammar-only projection, quote flattening, the
  1,800-character ceiling, determinism); three prompt fixtures prove the band is stated as the
  passage's and the brief sits before the errors; one fixture pins the new Writing query. For (b),
  the real assembler ran against a fresh, fully migrated local D1 through wrangler's platform proxy
  — workerd's D1, not a mock — over seeded rows that must stay out: another user's sessions and
  attempts, a deleted session's retained rounds, soft-deleted and unfinished attempts, a newer
  failed round, a pending session and a saved translation. All 17 checks passed, with three reads
  and none touching `saved_translations`; the Writing query plan uses `idx_writing_articles_user`
  and the per-article round index. The dev server renders a dictation passage page on the changed
  route with no console errors. 714 tests, all typechecks, lint (0 errors) and the production build
  pass. **Follow-up verification (2026-09-15):** the signed-in Dictation action was exercised over
  HTTP on an isolated dev server, using a synthetic session and migrated in-memory D1. A real model
  call produced feedback with the brief, and stored accuracy matched the deterministic action
  result. See `docs/spikes/learner-context-writing-verification.md`. The owner accepted this step
  on 2026-09-18, together with the Writing step below; the Reading half of Stage 1 stays open.
- **Writing feedback step — accepted (2026-09-18).** First drafts, revisions and retries now
  receive the Writing projection, with two bounded reads inside the evaluation task. The current
  session is excluded before the six-session limit; the existing within-session delta is retained.
  Listening weaknesses are explicitly labelled; trial prompts match pre-change SHA-256 fixtures.
  Evidence: 720 tests, all typechecks, lint (0 errors; 9 existing warnings), and both production
  builds pass. Isolated dev-server checks verify user/deletion/current-session scope, the read
  budget and successful real-model first-draft, revision and retry feedback. Details in the same
  spike. Reading remains disabled for the new brief pending its bias gate.
- **Reading gate tooling — accepted (2026-09-21); experiment pending.** The variance script
  accepts `--brief` and now uses the production prompt/highlights. The registered-corpus harness
  compares baseline, candidate brief and legacy profile over five calls per condition and recording,
  using production attribution and the fixed thresholds in (d). It refuses uncommitted manifests,
  changed experiment code/audio hashes, incomplete runs and malformed evaluation output. It writes
  both comparisons and preserves incomplete runs without a pass. Evidence: 734 tests, all
  typechecks (including grader tools), lint (0 errors), and Web build pass; Mapdown build passed
  in the preceding Writing step and its code is unchanged. CLI dry-run and preregistration rejection
  were checked with synthetic tone fixtures, without model calls. Protocol:
  `docs/spikes/reading-context-bias-protocol.md`. **Still needed:** the pre-annotated recording
  corpus and the actual preliminary/full experiments. Reading's new projection/assembler and
  prompt integration remain unimplemented until the gate is evaluated; existing profile injection
  is unchanged. No bias result or Stage 1 completion is claimed.
- **Reading gate corpus kit — accepted (2026-09-21); recordings pending.**
  [`docs/spikes/reading-bias-corpus/`](spikes/reading-bias-corpus/README.md) gives an eight-recording,
  two-speaker slate over two passages that isolate `th_sound` and `linking`, recording scripts,
  ground-truth and known-error annotation rules, and `scripts/grader-bias/prepare.ts`, which builds
  the registered manifest (hashes, offsets, and the candidate brief rendered by the production
  learner-context code). Two owner decisions precede recording: the pinned model, and whether the
  tags-only brief it renders is Reading's first rollout shape (reading notes have no renderer yet).


## Now — Chinese interface for Chinese-speaking learners

The owner named the first cohort on 2026-09-22 — Chinese-speaking learners — and required a
Chinese interface, confirming three decisions the same day. Recorded as
[ADR 0011](decisions/0011-chinese-ui-same-url-feedback-follows-interface.md), which supersedes
[ADR 0003](decisions/0003-defer-chinese-ui.md); mechanism, coverage and reasoning in
[the design](chinese-ui-design.md).

This runs alongside "Now — Learner context for graders", which is open only for its Reading half
and is blocked there on two owner decisions and a recording corpus that do not exist yet. Neither
item is deprioritized by the other, and nothing here touches the learner brief.

Half the capability already exists and the scope depends on knowing which half: Reading and
Writing already produce Chinese feedback from a shared `localStorage` preference that defaults to
English and is reachable only from inside those two tools' settings; **Dictation has no language
option at all**; and the interface is English with no catalogue, switcher or locale routing.

### Decisions (owner, 2026-09-22)

- **D1 — Scope is the whole of English Studio**, including the homepage that leads with it.
  Mapdown, Posts and `/about` are out. Learning material stays English.
- **D2 — One URL per page.** The locale is a cookie, negotiated from `Accept-Language` on a first
  visit, with an explicit switcher and no redirect. No `/zh` prefix; search engines will index the
  English rendering, and that cost is accepted.
- **D3 — Feedback language follows the interface by default**, and Dictation gains Chinese output.
  The existing setting survives as an explicit override.
- **D4 / D5 (recommended, not separately confirmed)** — Simplified only, with `zh-TW` negotiating
  to it; and nothing stored is retranslated.

### Scope

- A pure locale module plus a cookie and a `POST /locale` switcher that works without JavaScript,
  a `LocaleProvider` beside the existing `Outlet` context rather than inside it, and one helper so
  route `meta` is localized too. Design §3.
- Two typed catalogues, where the Chinese one is typed against the English one so a missing string
  is a type error rather than a silent English fallback.
- Every learner-facing surface of English Studio in the design's §4 coverage list, including page
  titles, meta descriptions, validation and error text, empty states and assistive text.
- Locale-aware typography rules for the styles that do not survive translation — mono uppercase
  labels with letter-spacing, italic emphasis, line height and fit — written into
  `docs/design-system.md` as rules, not patched per component. Design §6.
- The feedback preference becomes three-valued (follow the interface / English / Chinese), and
  `dictation-feedback.server.ts` gains the language directive the other two graders have. Design §5.

### Acceptance criteria

- (a) **Negotiation is pure and unit-tested**: cookie outranks header; `zh`, `zh-CN`, `zh-Hans`,
  `zh-SG`, `zh-TW`, `zh-HK` resolve to `zh`; weighting decides a mixed header; unknown or
  malformed input resolves to `en` and never throws.
- (b) **An untranslated string cannot ship.** The Chinese catalogue is typed against the English
  one, and a test asserts the two key sets are identical. There is no runtime fallback that
  renders English inside a Chinese page.
- (c) **Server-rendered in the negotiated language**, with no flash of English after hydration;
  `<html lang>` matches; the error boundary renders with a sane `lang` when loader data is absent.
- (d) **Coverage is checked against the design's §4 list**, surface by surface, and the checklist
  is recorded. No user-visible English remains on a covered surface, including titles, meta
  descriptions, form errors, empty states and `aria-label`s.
- (e) **Switching works without JavaScript**: the form posts, the cookie is set for a year, the
  visitor returns to the page they were on, and an explicit choice outranks the header on every
  later visit.
- (f) **One URL, two languages, no stale cache.** Document responses are verified not to be
  cached across locales — either uncached or varying on the cookie.
- (g) **Feedback language.** Default follows the interface; the setting offers three states; an
  existing explicit `en`/`zh` preference migrates to an explicit override and is never silently
  converted; Dictation feedback is produced in Chinese when selected, for first attempts, retries
  and trials alike, proven by prompt fixtures whose only change is the language directive.
- (h) **Nothing else moves.** No migration; no change to stored feedback schemas,
  `learner-context.ts`, the learner brief's English rendering, `learner_tag_observations`,
  `SOURCE_WEIGHT`, or CEFR resolution. Stored feedback renders in its original language.
- (i) **Verification.** `pnpm test`, typechecks, lint (0 errors) and both production builds pass;
  the first-contact path is walked on an isolated dev server with `Accept-Language: zh-CN` and
  again after switching to English; light and dark themes and mobile width are each checked for
  the typography rules in (d), with screenshot evidence.
- (j) **Docs in the same PR.** The feedback-language sections of `docs/tools/dictation.md`,
  `docs/tools/esl.md` and `docs/tools/writing.md`; the Chinese typography rules in
  `docs/design-system.md`; `docs/access-model.md` if locale affects any access rule; and a
  `docs/changelog.md` entry marked `in_review` per stage.

### Stages

Independently shippable, in the order a Chinese visitor meets them, so stopping early still
leaves the most valuable part done.

1. **Mechanism and first contact** — negotiation, cookie, switcher, provider, meta helper,
   typography rules; homepage, `/english`, header, login popup, and Dictation end to end.
2. **The remaining tools** — Reading, Writing, Translate, Speech, with their trials, settings and
   progress surfaces.
3. **Signed-in surfaces and feedback language** — Home, Progress, the three-valued preference, and
   Dictation's Chinese feedback.

### Explicitly excluded

Mapdown, Posts and `/about`; learning material, prompts, passage titles and TTS audio; Traditional
Chinese; locale-prefixed URLs and any Chinese SEO work; bilingual feedback output; retranslating
stored feedback; product analytics; and giving signed-out visitors Dictation feedback — which
stays signed-in only, so the Chinese entry path still ends without an explanation of the learner's
errors. That hole is real and is recorded in the design's §8, not fixed here.

### Progress

- **Stage 1 — mechanism and first contact: `in_review` (2026-09-22).** Negotiation, cookie,
  no-JS switcher, provider, meta helper and Chinese typography rules; the homepage, `/english`,
  site header, studio rail, sign-in popup, error boundary and Dictation library/session/summary
  render in Chinese. Evidence and the surface-by-surface checklist: `docs/changelog.md` and
  design §9.
- **Stage 2 — the remaining tools: `in_review` (2026-09-22).** Translate, Speech, Reading and
  Writing, with their trials, settings and progress pages, and the profile page, render in the
  interface language; dates follow it. Evidence: `docs/changelog.md` and design §9. Stage 3 is not
  started; until it is, Home and the Progress overview show English content inside a Chinese rail.
- **Stage 3 — signed-in surfaces and feedback language: `in_review` (2026-09-22).** Home and the
  Progress overview render in the interface language; the shared feedback setting offers Follow
  interface / English / Chinese; Dictation feedback is produced in Chinese when the resolved
  language is Chinese. Evidence: `docs/changelog.md` and design §9. **One departure from criterion
  (g), for the owner's decision:** an earlier stored `en` migrates to Follow interface rather than
  to an explicit English choice, because the earlier code persisted `en` as a default and the two
  cannot be told apart (design §5, *As built*). A stored `zh` stays explicit as written.


## Next
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
- **Free entry points made explicit** (owner-raised 2026-07-23): header + hero chip showing what
  is usable without an account. Its *data* half already lands in IA Phase 1 — the registry's
  `access: public | trial | auth` field is what makes free entry consistent — so this item is the
  presentation half, and it follows the colour work.
- **Learner context Stage 2 — structured feedback categories** (owner-authorized 2026-09-15;
  starts only after "Now — Learner context for graders" is accepted). Writing annotations and
  Dictation error patterns gain an optional `category` from one closed list, so the learner brief
  groups recurring issues by category rather than by the model's free-text names, and Dictation
  notes become filterable for Reading. Context only, under
  [ADR 0010](decisions/0010-grader-context-is-separate-from-measurement.md): categories never enter
  `learner_tag_observations`, and choosing a Writing measurement vocabulary stays the item below.
  Acceptance: (a) one module defines the closed list, with a one-line definition per category, and
  both graders' prompts and output normalisers reference it instead of restating it; (b) stored
  feedback without the field still loads and renders, proven by parser fixtures over old Writing
  and Dictation payloads, as the `next_drills` compatibility work did; (c) a missing or unknown
  category normalises to absent and never fails an evaluation; (d) the brief groups on `category`
  when present and falls back to Stage 1 grouping otherwise, with unit tests over mixed old and new
  history; (e) Reading's projection gains category-filtered Dictation notes only after Stage 1's
  anchoring spike is re-run with them and passes; and (f) no migration, no measurement change, and
  no learner-facing surface change. Explicitly excluded: backfilling categories into stored
  feedback, Writing observation rows, and showing categories to learners.
- Fold **writing** into the ability profile. Writing reaches the shared learner surfaces only as
  Home's Continue/Recent entries: it writes nothing to the profile — no observations, counters, or
  CEFR signal — because it has no tag vocabulary; a prompt is not a passage. The mechanism is
  settled (IA v2 design §6.3): a new vocabulary plus a writer emitting into the same
  `learner_tag_observations` table, surfaced on `/english/progress` rather than crowding the Home
  snapshot. Blocked on that vocabulary, not on schema. Stage 3 of
  `docs/learner-context-proposal.md` records three problems the vocabulary decision must solve —
  exposure without a reference text, grader recall inflating mastery, and keeping production apart
  from perception in aggregation — and the Stage 2 categories above are its intended input.
  Writing's feedback reaching other graders does **not** wait on this item (ADR 0010).

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
- ~~Chinese UI (at least Translate + landing pages)~~ — promoted to "Now — Chinese interface for
  Chinese-speaking learners" (owner requirement, 2026-09-22), at a wider scope than this entry
  described. [ADR 0003](decisions/0003-defer-chinese-ui.md) is superseded by
  [ADR 0011](decisions/0011-chinese-ui-same-url-feedback-follows-interface.md).
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
- ~~**Library expansion — keep going.**~~ — promoted to "Now — Material library expansion"
  (authorized 2026-08-27), which carries the scope and acceptance criteria. The reasoning below
  is kept because it is the reasoning that item inherits. First batch shipped 2026-07-28
  (20 → 40 passages, ten per band). The IA v2 design assumes material eventually grows ~100× (roughly 500 per band),
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

## Accepted work — summaries and preserved anchors

These entries are historical, not the active queue. Their original scope, evidence, caveats
and recorded acceptance are preserved verbatim in [accepted roadmap history](roadmap-accepted-history.md).
The 2026-09-18 and 2026-09-21 entries were accepted by the owner before being moved here; the older ones were
not newly accepted by any documentation move.

<a id="now--engineering-quality-iteration"></a>
<a id="1-remove-dead-eslpassage-code--accepted-2026-08-15"></a>
<a id="2-configure-eslint-across-the-monorepo--accepted-2026-08-17"></a>
<a id="3-split-bcailabdb-into-per-domain-modules--accepted-2026-08-17"></a>
<a id="4-fix-the-evaluation-history-n1-query--accepted-2026-08-17"></a>
<a id="5-session-cleanup-cron--accepted-2026-08-17"></a>
<a id="6-session-secret-rotation--accepted-2026-08-17"></a>

- **Engineering quality iteration** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#now--engineering-quality-iteration); [delivery record](changelog.md).

<a id="now--account-passwords-and-profile--accepted-2026-08-18"></a>

- **Account passwords and profile — accepted (2026-08-18)** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#now--account-passwords-and-profile--accepted-2026-08-18); [delivery record](changelog.md).

<a id="now--mapdown-local-document-library--accepted-2026-08-23"></a>

- **Mapdown local document library — accepted (2026-08-23)** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#now--mapdown-local-document-library--accepted-2026-08-23); [delivery record](changelog.md).

<a id="now--mapdown-account-save-and-frozen-publishing--accepted-2026-08-23"></a>
<a id="stage-2--explicit-account-save"></a>
<a id="stage-3--frozen-publication"></a>

- **Mapdown account save and frozen publishing — accepted (2026-08-23)** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#now--mapdown-account-save-and-frozen-publishing--accepted-2026-08-23); [delivery record](changelog.md).

<a id="now--mapdown-library-page-live-published-viewer-and-copy--accepted-2026-08-25"></a>
<a id="stage-1--the-document-library-becomes-a-page"></a>
<a id="stage-2--the-published-page-becomes-a-live-read-only-map"></a>
<a id="stage-3--copy"></a>

- **Mapdown library page, live published viewer, and copy — accepted (2026-08-25)** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#now--mapdown-library-page-live-published-viewer-and-copy--accepted-2026-08-25); [delivery record](changelog.md).

<a id="now--mapdown-canvas-first-chrome"></a>

- **Mapdown canvas-first chrome — accepted (2026-08-26)** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#now--mapdown-canvas-first-chrome--accepted-2026-08-26); [delivery record](changelog.md).

<a id="now--mapdown-the-root-label-is-the-maps-name-everywhere"></a>

- **Mapdown: the root label is the map's name everywhere — accepted (2026-08-26)** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#now--mapdown-the-root-label-is-the-maps-name-everywhere--accepted-2026-08-26); [delivery record](changelog.md).

<a id="now--english-studio-material-memory-and-interaction-iteration"></a>
<a id="product-boundary-and-invariants"></a>
<a id="remaining-quality-note"></a>
<a id="explicitly-excluded-from-this-iteration"></a>

- **English Studio material, memory, and interaction iteration (D1–D5) — accepted (2026-08-15)** — already accepted; its items A–E are listed below. [Original scope and evidence](roadmap-accepted-history.md#now--english-studio-material-memory-and-interaction-iteration--accepted-2026-08-15); [delivery record](changelog.md). Its product invariants still apply and are kept under *Continuing learner-surface constraints*. The Writing prompt batch had a single reviewer; the owner accepted that as-is on 2026-08-15, and a second-party content review would be a new, separately scoped task.

<a id="a-writing-prompt-bank-and-guided-entry--accepted"></a>

- **A. Writing prompt bank and guided entry — accepted** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#a-writing-prompt-bank-and-guided-entry--accepted); [delivery record](changelog.md).

<a id="b-saved-translations--accepted"></a>

- **B. Saved translations — accepted** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#b-saved-translations--accepted); [delivery record](changelog.md).

<a id="c-shared-interaction-and-layout-correctness--accepted"></a>

- **C. Shared interaction and layout correctness — accepted** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#c-shared-interaction-and-layout-correctness--accepted); [delivery record](changelog.md).

<a id="d-reading-evaluation-dead-output--accepted"></a>

- **D. Reading evaluation dead output — accepted** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#d-reading-evaluation-dead-output--accepted); [delivery record](changelog.md).

<a id="e-scalable-studio-navigation-and-material-discovery--accepted"></a>

- **E. Scalable Studio navigation and material discovery — accepted** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#e-scalable-studio-navigation-and-material-discovery--accepted); [delivery record](changelog.md).

<a id="now--mapdown-production-mvp"></a>

- **Mapdown production MVP and five stabilization checkpoints (accepted 2026-08-15)** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#now--mapdown-production-mvp); [delivery record](changelog.md).

<a id="now--readability-and-home-action-hierarchy-iteration-6--in_review"></a>

- **Readability and Home action hierarchy (iteration 6) — accepted (2026-09-18)** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#now--readability-and-home-action-hierarchy-iteration-6--accepted-2026-09-18); [delivery record](changelog.md).

<a id="now--documentation-authority-and-drift-repair-iteration-5--in_review"></a>

- **Documentation authority and drift repair (iteration 5) — accepted (2026-09-18)** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#now--documentation-authority-and-drift-repair-iteration-5--accepted-2026-09-18); [delivery record](changelog.md).

<a id="now--local-verification-entry-points-iteration-4--in_review"></a>

- **Local verification entry points (iteration 4) — accepted (2026-09-18)** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#now--local-verification-entry-points-iteration-4--accepted-2026-09-18); [delivery record](changelog.md).

<a id="now--writing-reliability-and-home-data-correctness"></a>
<a id="1-writing-retry-lifecycle-f01--in_review"></a>
<a id="2-writing-draft-recovery-and-account-isolation-f02f03--in_review"></a>
<a id="3-home-bounded-inputs-and-degradation-f04f05--in_review"></a>

- **Writing reliability and Home data correctness (F01–F05) — accepted (2026-09-18)** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#now--writing-reliability-and-home-data-correctness--accepted-2026-09-18); [delivery record](changelog.md).

<a id="now--material-library-expansion"></a>

- **Material library expansion — accepted (2026-09-18)** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#now--material-library-expansion--accepted-2026-09-18); [delivery record](changelog.md).

<a id="dictation-contributes-practice-duration"></a>

- **Dictation contributes practice duration — accepted (2026-09-21)** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#former-next-summary); [delivery record](changelog.md).

## Exploration, history, and decisions

These used to live in this file and were split out on 2026-08-01, so that what remains here
is only what is planned or authorized:

- **Unscoped ideas** the owner is considering → `docs/exploration.md`. Not authorization.
- **What shipped**, with dates and what was learned → `docs/changelog.md`.
- **Settled decisions** and their rationale → `docs/decisions/`.
