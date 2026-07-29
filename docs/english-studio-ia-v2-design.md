# English Studio — IA v2: Coach Home (final)

Status: **final specification, approved direction — ready to implement** once the owner
signs off on this text. Written 2026-07-27 after two external review rounds and three
prototype revisions. Supersedes the deferred half of `docs/english-studio-ia-design.md` (v1)
and all earlier drafts of this file.

Companion artifacts (keep in sync only in spirit — this doc is the authority):
- `docs/mockups/ia-v2.html` — interactive structural prototype (rev3, neutral colours,
  no real data). Shows Home (cold / partial / active), Reading, Writing.
- `docs/mockups/ia-v2-brief.md` — the self-contained brief the second review round read.
  Historical; its §7 open questions are resolved here.

Intended reader: the AI agent (or human) implementing this. Where a decision is delegated,
this doc says so explicitly.

---

## 0. North star (owner, 2026-07-27)

The product is an AI English coach. Its non-commoditisable assets are the **evaluation
function** and the **learner-state loop**; material, TTS, and editors are replaceable. The
long-term shape, stated by the owner and adopted here as the frame every decision below
serves:

- **LLM-generated material at scale** — the library grows ~100× cheaply, every level richly
  stocked, for every practice mode (including a writing prompt bank).
- **LLM as a legitimate measurement signal** — grader variance spikes (2026-07-23, three
  recordings, stddev ≤ 3.5 on a 0–100 scale) showed LLM scoring is repeatable enough that
  it may graduate from "down-weighted hint" to formal signal. The architecture must make
  that a **configuration change, not a schema change** (§6.2).
- **An accumulated learner context**: multi-dimensional ability (listening / speaking /
  reading / writing, each with finer dimensions such as fluency), visible to the learner.
- **The system proposes the highest-leverage next step** (maximum expected improvement),
  delivers feedback, and closes the loop.
- **Modules cooperate rather than sit side by side**, and **new training modes and new
  ability dimensions must be addable without structural rewrites** (§6).

The IA's job is to make this loop the visible spine of the product, and to leave clean
seams where the future layers (matching, planning/session composition, new modes) attach.

## 1. Current state — facts (verified in code)

### 1.1 Modules

| Module | What it does | Material model | Anonymous |
|---|---|---|---|
| Dictation | Sentence-by-sentence listening + typing; **deterministic** word-diff scoring | library only | yes (quota) |
| Reading | Read aloud; LLM-judged evaluation | library **+ user-pasted text** | trial |
| Writing | Coach feedback across revision rounds | **user text only; no library** | trial |
| Translate | Free acquisition funnel | none | yes |
| Speech | TTS utility | user-generated | no |

No real users yet. Library: 20 passages (5 per band A2–C1) + ~14 user passages.

### 1.2 The learner model (shipped 2026-07-21)

- `learner_tag_observations`: append-only, per (attempt, tag) exposure/hits, keyed on the
  12-tag `passage_tags` vocabulary; `source: deterministic | llm`.
- `esl_learner_profiles`: `tag_mastery_json` (mastery/exposure/trend per tag),
  `cefr_declared` / `cefr_measured` / `cefr_measured_confidence`, resolved `cefr_estimate`.
- Aggregation is throttled (every ~3 attempts, background). LLM only *names* patterns.
- `SOURCE_WEIGHT` (deterministic 1.0 vs llm 0.4) is a **module constant** in
  `learner-model.ts` — the future "LLM graduates to formal signal" is one number.
- The one-tap level picker's data layer exists unused: `cefr_declared` column +
  `setLearnerDeclaredLevel` helper, **no callers**; `resolveCefr` returns `null` (not B1)
  when nothing is known.

### 1.3 The four structural defects this design fixes

1. **Custom material outranks library material, twice**: `reading._index.tsx` renders
   "Yours" above the graded bands, and `ReadingNavRail` lists "Your passages" above
   "Library" — with the parent layout and index **each querying the same data**.
2. **The unified progress centre is orphaned**: `/english/progress` is reachable only from
   the marketing landing; per-tool rails point at per-tool dashboards.
3. **The module switcher is a drifted copy with a real bug**: `ToolNavRail` maintains a
   simplified module list that bypasses the landing page's trial routing — an anonymous
   user picking Reading from the switcher hits `requireUser` → login bounce, where the
   landing would have sent them to `/reading/trial`. Translate has no switcher at all.
4. **No tier expresses the learner loop** — only tools.

### 1.4 A cross-module feedback bug found during this design

CEFR confidence = volume × band-spread; **practising only one band caps confidence at
0.5**, which is exactly the override threshold. A recommender that only serves same-band
material therefore **starves the estimator** and the measured level can never take over.
Consequence for this design: the recommendation policy must periodically explore adjacent
bands (§4.3), the UI must never make other bands look off-limits (§5.2), and coverage must
be visible so exploration reads as purposeful (§3.3).

## 2. Settled decisions

Carried from prior iterations (do not relitigate):

1. Matching (learner → material ranking) is deferred; this design leaves a replaceable seam.
2. Deterministic layer measures; the LLM interprets — *amended by §6.2*: LLM measurement
   may be promoted per-signal, by configuration, backed by variance data.
3. Dictation is the placement instrument; no separate placement test.
4. One passage, two modes = a handoff at the summary, not a combined page.
5. Translate stays in English Studio as the free funnel.
6. No admin/back-office system yet.
7. Colour semantics are a separate track (today `--accent` and `--red` are the same hex;
   primary CTAs and form errors are indistinguishable). The IA work makes **no** colour
   decisions.

Decided across the two review rounds of this design:

8. **Action-first, not analytics-first** (round 1). The Home leads with "continue / do this
   next"; progress data supports the recommendation's credibility.
9. **Route**: `/english` stays the public marketing landing and **redirects signed-in users
   to `/english/home`** (`english_.home.tsx`, escaped layout per repo convention).
10. **Shared module registry** (`english-modules.ts`) consumed by landing, rail, and Home —
    fixes §1.3(3) as a side effect of being the single source of truth.
11. **Static rail, no dropdown** (owner). The rail lists no material, so the dropdown lost
    its reason to exist. Home hosts no Explore section — the rail *is* explore.
12. **Home = action zone + status grid** (owner, round 2 §7.1 refinement): a zoned grid,
    not a vertical feed. Actions top; status panels below.
13. **`/english/progress` is kept as the full detail page** (round 2, 7.1) — linked from
    Home's status panels and the rail, **not** redirected away. Progress history is a
    first-class destination that will grow (charts, per-dimension drill-downs); Home shows
    the snapshot, the progress page holds the depth. Per-tool dashboards remain deeper
    drill-downs for now.
14. **One strong recommendation with meaningful alternatives** (round 2, 7.4): a single
    primary card, whose secondary actions are **directional** — "easier", "challenge me",
    "different topic" — not an equal-weight triple and not a slot-machine "next random".
    (Directional alternatives also feed the estimator: "challenge me" is adjacent-band
    exploration with learner consent — §1.4.)
15. **Band remains the primary grouping; topic becomes a filter within band** as the
    library grows (round 2, 7.3). Full-text search + state filters arrive with scale;
    none of this is built at 20 passages.
16. **Never lock material by level**; show all bands, fold non-current ones. Reasons: the
    estimate is itself uncertain; learners legitimately want easier (fluency) and harder
    (stretch) material; locking is a gamified-retention mechanic serving a subscription
    model we don't have; and §1.4 makes exploration *necessary*.
17. **Writing reuses the list skeleton, not the semantics** (round 2, 7.5). Writing cards
    speak writing: prompt type, target length, draft round, feedback state — never
    accuracy/mastery it doesn't have. Writing does not contribute to the ability profile
    until it has a real vocabulary (future work, §6.3); the UI must not fake symmetry.
18. **The one-tap level picker ships with the Home** (round 2, 7.6 — hard requirement):
    cold start without it is a single forced path. Data layer exists; only UI is missing.
19. **Session-first / goal-first is acknowledged as the eventual next framing** (round 2,
    7.7): "what do I practise *today*" — a composed short session — is closer to a real
    coach than any dashboard. It is **not built now**; it arrives with the matching/planning
    layer and must attach at the recommendation seam without IA changes (§6.4).

## 3. The design

### 3.1 Tiering

```
bcailab                            ← all products
 └─ English Studio Home            ← /english/home, signed-in top surface
      ├─ Action zone               Continue · Next (one primary + directional alts)
      └─ Status grid               Level · Volume · Coverage · Ability snapshot
      │                            · Trend · Recent   → links into /english/progress
      ├─ /english/progress         full progress detail page (kept, first-class)
      └─ Tools (one tier down, via the static rail)
           Dictation · Reading · Writing      ← practice loop
           Translate · Speech                 ← adjacent tools
            └─ material surface (library as main axis)
                 └─ session (same global rail + explicit return to tool)
```

### 3.2 The static rail (every page; clarified 2026-07-29)

- Product identity in the rail header is always **English Studio**. It does not change to
  "Reading", "Speech", etc.; the active entry and page heading provide that context.
- Entries from the shared registry: **Home**, then **Progress**, then Practice: Dictation,
  Reading, Writing · Tools: Translate, Speech. Signed-out users are routed per the
  registry's `access` field (`public` → straight in; `trial` → trial route; `auth` →
  login popup) — this is the §1.3(3) bug fix.
- Below a separator, **per-tool actions** when inside a tool: Reading → "+ Add text",
  "Reading progress"; Writing → "+ New piece" (its "+" creates work, not material — until
  the prompt bank exists), "Writing progress". Actions live in the rail so they stay
  visible no matter how long the material list grows.
- Translate keeps its two-pane shape inside the same shell; entering it must not remove
  the rail.
- The rail has one collapse state shared across the product rather than one preference per
  tool.
- No attempt/article/generation history appears in the rail until "session" has one
  consistent cross-tool contract (identity, resumability and lifecycle). Existing history
  remains on catalogue/progress/history surfaces. `ToolNavRail` intentionally has no
  arbitrary-content/list slot, so this rule is enforced by its component API rather than
  relying on each tool to remember it.
- Speech follows the workspace pattern directly: `Generate / History` is local navigation
  above the Speech canvas, and `/speech/history` renders the generation list in the main
  content area. Neither tab nor any generation record appears in the product rail.
- A concrete session keeps the global rail and exposes an explicit upper-right
  **Back to [tool]** action.
- The shell owns viewport height. The main content column is the default and only page
  scroller; session layouts may opt into bounded inner scrollers where their editor or
  feedback rail genuinely needs them.

### 3.3 Home — action zone (top of viewport)

- **Continue** (when unfinished work exists): resumable dictation, recent writing draft.
  Highest priority — requires no intelligence and is unambiguously right.
- **Next** — exactly one recommendation card, with the *why* folded inside
  ("Dense in **word-final -s** — currently your weakest feature") and directional
  alternatives per decision 14. Honest language until matching exists: "fits your current
  level" — never "personalised for your weaknesses".
- Backed by `selectStarterPractice()`: a pure, unit-tested function over bounded inputs
  (profile row, resumable attempts, recent activity, published material). Fallback order
  when same-band unpractised material runs out: same band other mode (the settled
  dictation↔reading handoff) → adjacent band → weakest-scoring revisit. Includes periodic
  adjacent-band exploration (§1.4). **No recommendation service, no repository layer, no
  feed framework.**

### 3.4 Home — status grid

Panels, all reading existing data: **Level** (+ confidence, + basis sentence) · **Volume**
(attempts, minutes) · **Coverage** (bands practised — makes exploration legible, §1.4) ·
**Ability snapshot** (top tags by weakness/strength with trend arrows; "all 12 →" links to
the progress page) · **Accuracy trend** (small chart) · **Recent** (bounded list).

Rules: the grid renders **nothing** in the cold state (no "no data yet" wall);
every panel that has more depth links into `/english/progress`; writing appears in
Continue/Recent but **never** in ability panels (decision 17).

### 3.5 Home — cold start

`resolveCefr` returns `null` for a new user. The Home then shows a single strong CTA
instead of the grid:

> **Let's find your level.** One dictation passage — about 3 minutes, and it doubles as a
> level check. [Start] [or pick your level yourself]

The picker (decision 18) writes `cefr_declared` via the existing helper; skippable;
starter policy may *use* B1 for `null` internally, but the UI never *claims* B1. Dictation
is the CTA because it is the only calibrated instrument — a recommendation, not a gate;
the rail leaves every module reachable.

### 3.6 `/english/progress` — the detail page

Kept and promoted (decision 13). Receives what Home's snapshot links to: full 12-tag
mastery with history, accuracy trends per mode, practice history, CEFR history
(declared vs measured over time). This page is where future ability dimensions land
(§6.3) without crowding Home. `/reading/progress` and `/writing/progress` survive as
tool-scoped drill-downs beneath it.

### 3.7 Material surfaces

**Reading (restructured now):**
- The rail's passage list is removed (nav-only rail) — also removing the duplicated query.
- Library is the main axis, grouped by band; learner's band open first and labelled
  "your level"; other bands folded, never locked (decision 16).
- Card state carries practice status: `New` / `In progress 4/11` / `Best 86%`. Completed
  is card state, **not** a section.
- **Your texts**: a clearly visible secondary section at the bottom — list only; the add
  action lives in the rail. Not merged into the library's filter space: user text has no
  band/tags, cannot be dictated, feeds no mastery — provenance is a **capability
  boundary**, not a label.
- Topic/state filters and search: build **when the library grows** (trigger: first
  expansion batch, not calendar time). At 20 passages they are overbuild.

**Dictation:** its catalogue already leads with the library. Attempt history is not shown
in the global rail; resumable/completed state remains on catalogue and progress surfaces.

**Writing:** unchanged until the prompt bank lands (roadmap item). When it does, it
instantiates the same list skeleton with writing semantics (decision 17): prompt cards
carry type/length; state carries draft round and feedback status.

## 4. What round 2 explicitly resolved

For traceability — reviewer point → disposition:

| Point | Disposition |
|---|---|
| 7.1 Home overload | Resolved by **keeping `/english/progress`** as the depth destination; Home carries snapshot panels that link into it (decisions 12, 13) |
| 7.2 Overbuild risk under the assumptions | Accepted as low: material expansion is cheap (LLM-generated); the structure is phased and each phase is independently useful |
| 7.3 Band vs topic at scale | Band stays primary; topic is an in-band filter at scale (decision 15) |
| 7.4 One recommendation at scale | One primary + directional alternatives (easier / challenge / different topic); no equal-weight triple, no slot machine (decision 14) |
| 7.5 Writing symmetry is decorative | Agreed: skeleton reuse, writing-native semantics, no fake measurement; future contribution path noted (§6.3) |
| 7.6 Cold start needs the picker | Picker is in scope, hard requirement (decision 18) |
| 7.7 Third framing exists | Session-first acknowledged as the future layer on the same seam (decision 19, §6.4) |

## 5. Risks that remain real

1. **Cold-start thinness**: the model needs several attempts before panels mean anything.
   Mitigated by the CTA + picker; not eliminated.
2. **Everything is untested against real users.** The design is cheap, phased, reversible —
   that is the mitigation, not proof.
3. **Demoting user text is a real behaviour change** for Reading's original workflow
   (~14 passages in production). Deliberate, owner-approved.
4. **The "challenge me" affordance depends on copy quality**: adjacent-band exploration
   must read as purposeful (coverage panel helps), or it feels like the product second-
   guessing the learner.

## 6. Extensibility contracts (the "no structural rewrite later" requirement)

The owner's requirement: new training modes, new ability dimensions, more active
assessment, and a future planning layer must arrive **without reshaping this IA**. Four
contracts deliver that:

### 6.1 Modules are data

`english-modules.ts`: `{ id, label, route, trialRoute?, access: public|trial|auth,
group: practice|utility, status: active|planned }`. Landing, rail, and Home consume it.
**Adding a module = one entry + its routes.** Nothing else changes.

### 6.2 Measurement sources are weighted configuration

`learner_tag_observations.source` already distinguishes `deterministic` from `llm`;
aggregation weights live in one place (`SOURCE_WEIGHT`). **Promoting LLM judgment to a
formal signal — the owner's stated direction, supported by the variance spikes — is a
weight change with a documented evidence trail, not a migration.** New sources (e.g. a
speaking evaluator) add an enum value and a weight. The observation schema (append-only,
re-derivable) stays fixed.

### 6.3 The ability model grows by vocabulary, not by schema

Today's 12 tags are the listening/reading vocabulary. A new skill (speaking fluency,
writing accuracy…) = a new vocabulary + a writer that emits observations in the same
table + panels on the **progress page** (not Home — Home shows only the snapshot).
Writing joins the profile exactly this way when its vocabulary exists — that is the
honest version of the symmetry the UI currently must not fake.

### 6.4 One recommendation seam, three future tenants

`selectStarterPractice()` (now) → matching service (ranked by tag profile) → planning /
session layer (7.7: composed "today's session"). All three produce "next action(s) with
reasons"; Home renders whatever the seam returns. The seam's output shape should therefore
be a **list of recommended actions with reasons** from day one, even while its length is 1.

## 7. Implementation plan

Three phases, independently shippable and revertible. **Not one big change.**

**Phase 1 — Navigation truth.** Registry; static rail with Home entry, groups, per-tool
actions; anonymous routing fixed via `access`; Translate's way back. No page redesign.

**Phase 2 — Coach Home.** `english_.home.tsx`; `/english` signed-in redirect; action zone
(Continue + one recommendation with directional alternatives); status grid; cold-start CTA
+ level picker; `selectStarterPractice()` (pure, tested, list-shaped output, adjacent-band
exploration); `/english/progress` kept and linked (its own enrichment can trail);
bounded queries; degrade to a module launcher on any personalisation failure — never blank.

**Phase 3 — Reading surface.** Rail passage list removed (dup query gone); band-grouped
library with card states, folded bands, "your level" marker; own-texts secondary; add
action in rail. Filters/search deferred to the first library expansion.

States every phase must respect: signed-out (landing + correct per-module routing) /
cold / partial / active / band-exhausted (fallback chain) / stale resumable target /
degraded (query failure). Pure-logic tests via `pnpm test` for the starter policy
(null level never rendered as B1; declared vs measured precedence; resume priority;
fallback order; multiple in-progress; deleted/unpublished targets; anonymous access
resolution for all three `access` values). Loaders verified against the dev server.

## 8. Documentation sync (with implementation)

- `docs/english-studio-ia-design.md` — mark the deferred half resolved here.
- `docs/architecture.md` — `/english/home`, redirect behaviour, kept `/english/progress`,
  rail/registry model.
- `docs/roadmap.md` — scope as the next iteration (phases → Done as they ship); raise the
  library content push; keep colour separation and free-entry surfacing as separate items;
  move the level picker out of Later into this scope.
- `docs/learner-model-design.md` — §9 note: progress centre = `/english/progress` detail
  page + Home snapshot; §6.2 of this doc noted against `SOURCE_WEIGHT`.
- `docs/mockups/ia-v2-brief.md` — add a line pointing here as the resolution.
