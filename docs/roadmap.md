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

## Now (nothing scoped — awaiting the owner)

The IA v2 / Coach Home iteration shipped 2026-07-28 (all three phases; see `docs/changelog.md`). **The next
iteration is not scoped.** Candidates sit in Next below; picking among them is the owner's
call, not an implementer's.

Two invariants established by that iteration outlive it and apply to anything touching the
learner surfaces — the reasoning is in `docs/english-studio-ia-v2-design.md`:

- **Never render a `null` level as "B1".** A policy may use B1 internally; the UI must not
  claim a level the system has not established.
- **Never lock material by band.** CEFR confidence is the product of practice volume and band
  *spread*, so a recommender that never explores starves the estimator that decides the
  learner's level. Fold other bands; do not gate them.

Also still open, and the natural successors at the seam Phase 2 left: the **matching** service
(Dictation v2, in Later) and the session/planning layer. Both replace
`selectStarterPractice()` and inherit its callers — the Home renders whatever that seam
returns, so neither needs an IA change.

## Next
- **Mapdown — new product, specification landed 2026-08-01, implementation not scoped.** A
  static, local-first, keyboard-first Markdown mind-map editor: the semantic document is an
  ordered tree, the map is a projection of it, and everything exports to standard Markdown, SVG
  and PNG with no account and no server. Three-phase business plan confirmed by the owner:
  (1) fully free static tool, (2) local document history in IndexedDB, (3) optional bcailab
  accounts for cloud-saved maps, with paid tiers reserved for AI features and heavy use — free
  users keep the large majority of functionality. It lives in this repo as `apps/mapdown` and
  deploys as a **second** Cloudflare Pages project to `map.bcailab.com`; it inherits the
  account system but none of the Studio's visual language. The v1.0 specification, the decision
  log and the token-layering rules are in `docs/mapdown/`; start at `docs/mapdown/README.md`,
  and read `decisions.md` before reopening any settled question. **Entry point is Phase 0**
  (`docs/mapdown/spec/phases.md`): disposable spikes for Chinese IME inside canvas text editing,
  variable-size tidy-tree layout, and CJK-safe SVG export — the three places the whole product
  can fail. A real 科判 outline is the fixture for those spikes, because it is the only material
  that stresses all three at once (D-12). URL-fragment sharing is approved for after Phase 1,
  with two constraints that cannot be retrofitted (D-11). Scoping any of this into an iteration
  is the owner's call, not an implementer's.
- **`next_drills`: render or delete.** Reading evaluation generates `next_drills` on every
  attempt and stores it, but no page renders it — a pure dead output costing tokens. Either
  surface it (with a one-tap "practise this" that creates a passage from `target_text`) or drop
  it from the evaluation. Confirmed 2026-07-21.
- **Free entry points made explicit** (owner-raised 2026-07-23): header + hero chip showing what
  is usable without an account. Its *data* half already lands in IA Phase 1 — the registry's
  `access: public | trial | auth` field is what makes free entry consistent — so this item is the
  presentation half, and it follows the colour work.
- Unified feedback-language setting (currently duplicated per tool in localStorage).
- Fold **writing** into the ability profile. Writing currently contributes only counters and
  Continue/Recent entries, because it has no tag vocabulary — a prompt is not a passage. The
  mechanism is settled (IA v2 design §6.3): a new vocabulary plus a writer emitting into the same
  `learner_tag_observations` table, surfaced on `/english/progress` rather than crowding the Home
  snapshot. Blocked on that vocabulary, not on schema.
- Feedback wait experience: streaming or narrative loading instead of a spinner
  (the "magic moment" should not hide behind a spinner).
- Replace native `confirm()` dialogs with branded confirmation UI.

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
- **Reading grader — deterministic split** (not triggered by current evidence; revisit if the
  trigger below reproduces). The grader variance spike (see `docs/changelog.md`, 2026-07-23) found the
  single-call reading evaluator repeatable on 2 of 3 samples (stddev well under the 4-point
  threshold) and borderline-but-under on the third (a jargon-dense sentence). That does not
  justify the deterministic-measurement rebuild (ASR diff + calibrated pronunciation API) the
  v1 diagnosis proposed — the evaluator looks trustworthy enough as-is for most material.
  **Trigger to revisit:** a further spike run on more jargon-dense/unfamiliar-register material
  reproduces variance that actually crosses the threshold; until then this stays parked.
- Chinese UI (at least Translate + landing pages) — decided to defer, 2026-07-15.
- Paid tier (quota/model config already has an `anonymous/free/paid` shape).
- Posts product landing page (currently links straight into the tool).
- Translate history for signed-in users — opt-in only (current privacy stance: translation
  text is never persisted). Most interesting framed as learning material: saved translations
  feeding vocabulary/dictionary and the learner profile, not a standalone log.
- Dictation v2 — level-adaptive material **matching** (revised 2026-07-20, owner
  confirmed; supersedes the earlier "dynamic per-user generation" framing): elevate
  `learner_profile` into a shared learner-model layer (tools write observations, the
  profile layer aggregates), then **retrieve** from a large pre-generated, tagged
  material library instead of generating per request. The LLM's job is assessing the
  learner and interpreting error patterns, not producing material at request time.
  Rationale: a fixed item bank can be empirically calibrated from real accuracy data
  (every passage accumulates a sample; generated-once material never can), TTS cost is
  paid once and amortized across all users rather than per session, and retrieval is a
  D1 query rather than a multi-second generate-then-synthesize round trip. It also keeps
  the owner's per-passage review in the loop. Work shifts from generation to (a) a
  dimensional tag schema shared by library and learner profile, (b) a matching policy,
  (c) growing the library from 20 to several hundred passages (now its own raised item above).
  Reading/Writing migrate to the same interface gradually (interface migration, not a rewrite).
  Prerequisites: shared learner model (done 2026-07-21) + dictation v1 (done).
  **Where it attaches (2026-07-27):** IA v2 Phase 2 builds `selectStarterPractice()` — a pure
  function returning a list of recommended actions with reasons. Matching replaces that function
  and inherits its callers; the Home renders whatever the seam returns, so no IA change is needed.
  The **session / goal-first layer** (compose "today's practice" rather than return single items)
  is the tenant after matching, on the same seam — recorded 2026-07-27 from the second IA review
  as the eventual framing, deliberately not built now.
- Dictation: bring-your-own-text — user pastes a passage and practices dictation on it.
  Noted 2026-07-20 as the one place runtime generation/synthesis genuinely earns its
  keep; it is user-initiated, distinct from adaptive difficulty, and should not be
  conflated with v2 matching.
- Decided 2026-07-16: Translate stays inside English Studio as its free funnel (not a
  standalone homepage product); revisit only if usage data shows a distinct audience.
- Engineering quality: vitest for LLM-output parsers + ESLint; fix evaluation-history N+1
  query; audio Range request support; session cleanup cron; session secret rotation.
- Profile settings (avatar + nickname) for email-OTP users, who have no Google profile
  data to fall back on — noted 2026-07-20, not urgent.
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
- **Writing prompt bank — raised 2026-07-27** from "nice cold-start fix" to structural. With a
  graded prompt bank, all three practice tools share one shape (platform material + user's own),
  which is what lets the IA v2 list skeleton be instantiated three times instead of special-cased.
  Note it gives writing *material*, not *measurement*: prompts have no tag vocabulary, so writing
  still contributes nothing to the ability profile until the Next item above lands. Originally
  discussed 2026-07-21, `docs/learner-model-notes.md` §5.
- **Promote LLM judgment to a formal measurement signal** (owner direction 2026-07-27). The
  grader variance spikes (`docs/changelog.md`, 2026-07-23) showed LLM scoring repeatable enough to be more than
  a down-weighted hint. The architecture already anticipates this: `learner_tag_observations.source`
  distinguishes `deterministic` from `llm`, and the weighting lives in one constant
  (`SOURCE_WEIGHT` in `learner-model.ts`), so promotion is **a weight change with a documented
  evidence trail, not a migration** (IA v2 design §6.2). Do it on evidence — more variance runs
  across registers and speakers — not on vibes. New signal sources (a speaking evaluator, say)
  join the same way: one enum value, one weight.
- **vanmemo** (formerly vanbox) stays a permanently separate product — settled
  2026-07-21. It is getting its own top-level domain (vanmemo.com) and its own accounts,
  and its stack is Next.js + OpenNext on Workers with Auth.js, so a monorepo would share
  almost nothing while adding two build systems and two deploy pipelines. bcailab's only
  tie to it is a product link from the homepage — shipped 2026-07-23 as the third card in
  the homepage Products list (external link to vanmemo.com). This is no longer a decision
  awaiting a trigger; treat it as closed.

## Exploration, history, and decisions

These used to live in this file and were split out on 2026-08-01, so that what remains here
is only what is planned or authorized:

- **Unscoped ideas** the owner is considering → `docs/exploration.md`. Not authorization.
- **What shipped**, with dates and what was learned → `docs/changelog.md`.
- **Settled decisions** and their rationale → `docs/decisions/`.
