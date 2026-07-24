# English Studio — IA v2: the Coach Home

Status: **final design, ready to implement.** Written 2026-07-23. Direction approved by the
owner after external review; the review's `DONE_WITH_CONCERNS` items are resolved below.
Supersedes the deferred half of `docs/english-studio-ia-design.md` (v1).

Intended reader: the AI agent (or human) implementing this. Where this doc delegates a
decision, it says so.

**What changed from the first proposal:** the proposal was *dashboard-first* (progress data as
the top surface). External review argued for **action-first**, and was right — see §2. It also
found four factual errors in the proposal, corrected in §1 and listed in §0.1.

---

## 0. Summary

The IA moves from **tool-first** (a menu of five peer apps) to **coach-first**: a Home that
answers *continue this / do this next*, with progress data supporting the recommendation rather
than fronting it. Tools become executors one tier below.

```
bcailab                          ← all products
 └─ English Studio Home           ← /english/home, THE signed-in top surface
      ├─ 1. Continue              unfinished dictation / recent writing draft
      ├─ 2. Next practice         ONE recommendation + a short honest reason
      ├─ 3. Explore               the modules (subordinate; the escape hatch)
      ├─ 4. Progress snapshot     CEFR · working on · strengths
      └─ 5. Recent activity       a few records, not an archive
           │
           └─ Activities (one tier down)
                Dictation · Reading · Writing      ← the graded practice loop
                Translate · Speech                 ← adjacent tools, not on the loop
                 └─ focused "what to practise" surface (prepared material foregrounded)
                      └─ session (no competing rail)
```

### 0.1 Corrections to the earlier proposal

Anyone who read the first draft should note these were **wrong**:

| Claim in the proposal | Reality |
|---|---|
| "Reading loses its rail, as dictation already did" | Dictation's catalogue **still has a rail** (`dictation.tsx:58`) — a *history* rail, hidden only in the session. Reading's is a *passage-listing* rail. Different content; "matching dictation" was never the right framing. |
| Cold start defaults the learner to B1 | `resolveCefr` returns **`level: null`** when nothing is declared or measured (`learner-model.ts`). B1 exists only in prose. The picker UI does not exist. |
| Reading's rail is "redundant" with the catalogue | It is also **literally duplicated DB work**: `reading.tsx` and `reading._index.tsx` each query own-passages + library. |
| (not noticed at all) | The module switcher **bypasses the trial rules** for anonymous users — a real behavioural bug, §5. |

---

## 1. Current state — facts

### 1.1 Routes (relevant subset)

```
/                    studio homepage (all bcailab products; vanmemo card added 2026-07-23)
/english             English Studio landing — PUBLIC marketing page, 5 module cards
/english/progress    unified progress centre (auth) — shipped 2026-07-21, currently orphaned
/dictation           catalogue, public; layout renders a HISTORY rail here
/dictation/:id       session, public + quota-gated; rail hidden
/reading             catalogue (auth) — own passages listed ABOVE graded library
/reading/new         create from your own text
/reading/:id         practice
/reading/progress    reading-only dashboard
/reading/trial       public anonymous trial (fixed passage)
/writing             composer (auth)      /writing/:id  article + revision rail
/writing/progress    writing-only dashboard
/writing/trial       public anonymous trial
/translate           two-pane tool (public) — does NOT use ToolNavRail, no switcher
/speech              TTS utility
```

### 1.2 The four structural problems

**(a) Custom material outranks prepared material, in two places.** `reading._index.tsx` renders
"Yours" above the graded bands; `ReadingNavRail.tsx` lists "Your passages" above "Library".
Reading has both a rail and a catalogue listing the same passages, each querying separately.

**(b) The progress centre is orphaned.** `/english/progress` is reachable only from the
marketing landing. It is in no switcher. Per-tool rails point at per-tool dashboards instead.

**(c) The switcher is flat, incomplete, and wrong for anonymous users.**
`ENGLISH_STUDIO_MODULES` in `ToolNavRail.tsx` is a five-item flat list with no home entry — and
it is a *second, simplified copy* of the module list in `english.tsx`, which carries the real
access metadata (`public`, `trialSlug`, `planned`). Consequence: an anonymous visitor on
`/dictation` who picks "Reading" from the switcher hits `requireUser` and is bounced to
`/?login=1`, whereas the landing page would have sent them to `/reading/trial`. **Same user,
same module, two different behaviours.** Translate has no switcher at all, so it is a dead end.

**(d) Nothing expresses the learner loop.** There is no tier at which "where am I / what next"
is the subject. Tools own the product.

### 1.3 Data available to a Home today

All present and populated:

| Data | Source | Enables |
|---|---|---|
| Resolved CEFR + basis | `esl_learner_profiles.cefr_estimate` / `cefr_declared` / `cefr_measured` / `cefr_measured_confidence` | Progress snapshot; level-fit selection |
| Per-tag mastery + trend | `tag_mastery_json` (12-tag vocabulary) | "Working on" |
| Named strengths/issues | `persistent_issues_json`, `strengths_json` | Progress snapshot |
| **In-progress dictation** | `dictation_attempts.status='in_progress'`, `sentences_done` | **Continue** |
| Writing drafts | `writing_articles` / revisions | **Continue** (writing) |
| Recent attempts | `dictation_attempts`, `esl_reading_attempts` | Recent activity |
| Material metadata | `passages.band/topic/word_count/has_sentence_audio/source/user_id` | Level-fit selection |
| Per-passage difficulty | `passage_stats` | (recorded, not yet interpreted) |

**Library size: 20 prepared passages, 5 per CEFR band (A2/B1/B2/C1)**, plus ~14 user passages.
This drives §4.4.

---

## 2. The spine: action-first, not analytics-first

The proposal derived the loop as *where do I stand → what next → practise → see progress* and
put "where you stand" first. **That ordering was wrong.** The corrected loop:

> **Continue or start the right practice → immediate feedback → learner model updates →
> check progress when you want to.**

Users do not come to admire a learner model. The moat shows up as *the product knows where I
was, its next step makes sense, it can say why in one line, and the feedback understands me* —
**not as more charts.** Progress data's job is to make the recommendation credible, not to be
the front page.

This is why the surface is called **Home**, not Dashboard. The name decides what gets built:
"dashboard" pulls toward analytics, "home" toward action.

*Note on provenance:* the first proposal flagged that its author (who also built the learner
model) might be biased toward a surface that displays it. External review independently reached
the same diagnosis. A self-flagged bias, confirmed from outside, is treated here as settled.

**The premise, stated falsifiably:** if learners mostly arrive knowing what they want and rarely
want to be told, then a good tool menu beats a Coach Home. We have **no usage data** (§7.3).
The mitigation is that this design is cheap and reversible.

---

## 3. Settled decisions — do not relitigate

From prior iterations:

1. **Matching (learner → passage ranking) is deferred.** This design leaves a replaceable slot.
2. **Deterministic layer measures; the LLM only interprets.**
3. **Dictation is the placement instrument** — no separate placement test.
4. **One passage, two modes = a handoff, not a combined page.**
5. **Translate stays inside English Studio** as its free funnel.
6. **Do not force one shell onto every module** (Writing/Translate/Speech differ genuinely).
7. **No admin/back-office system** yet.

Decided by this review round:

8. **Action-first Home, not a dashboard** (§2).
9. **Route: `/english` redirects signed-in users to `/english/home`** (§4.1).
10. **No faceted material surface** (§6.1).
11. **One-tap level picker is in scope** (§4.3).
12. **Shared module registry** (§5) — a bug fix, not an abstraction.

---

## 4. The Coach Home

### 4.1 Route

**`/english/home`**, a distinct route. `/english` stays the public marketing landing and
**redirects signed-in users to `/english/home`**. `/english/progress` becomes a redirect to
`/english/home` so no link breaks.

Rejected: making `/english` dual-face. Concrete reason — `root.tsx:60-63` decides footer
visibility by pathname, with `/english` in the list; a dual-face route would need another
identity-based shell branch there, and would keep SEO/meta/footer/loading/error concerns
entangled with an app surface. A redirect costs nothing and keeps both routes single-purpose.

Remix file naming: use the escaped-layout form **`english_.home.tsx`**, so Home renders as its
own page rather than nesting inside the `english.tsx` landing layout (repo convention,
`AGENTS.md` → Routing Conventions).

### 4.2 Sections, in order

**1. Continue** — resumable work, highest priority because it needs no recommendation logic and
is unambiguously the right next action.

```
Continue "A Normal Day"
4 / 11 sentences completed
[ Continue ]
```

Sources: in-progress dictation attempts; recent writing drafts. **Writing belongs here** even
though it contributes no tag mastery — an unfinished draft is a real "continue," it just must
not be dressed up as a learner-model recommendation.

**2. Next practice** — **exactly one** recommendation, with a short honest reason.

```
A good next step at your current level
B1 · Everyday English · about 3 minutes
[ Start dictation ]        [ Browse all ]
```

One, not three: multiple equal-weight recommendations hand the decision back to the user, which
defeats the point of recommending.

**Language honesty:** until the matching service exists, we may say *"at your current level"*.
We may **not** say "personalised for your weaknesses" — nothing yet ranks by tag profile.

**3. Explore** — the modules, via the shared registry (§5). Deliberately subordinate: it is the
escape hatch, and with a thin library the escape hatch matters. **Implementation risk:** this
section must not become a second five-card menu that visually outweighs sections 1–2, or the
page degrades into the old landing with a banner. Visual weight is a design-time concern, but
the failure mode is named here because it would silently undo §2.

**4. Progress snapshot** — CEFR + basis, working-on, strengths. This is the content of today's
`/english/progress`, demoted from first place to supporting evidence.

**5. Recent activity** — a short bounded list, not an archive.

### 4.3 Cold start — a load-bearing part of the design

A new signed-in learner has no level, no history, no observations, and `resolveCefr` returns
`null`. A loop-shaped Home would be emptier than a tool menu — the proposal's weakest point.

Two things resolve it, and **both are in scope**:

1. **A single strong CTA.** Dictation is the placement instrument, needs no microphone, gives
   deterministic feedback in ~3 minutes, and doubles as measurement:

   ```
   Let's find your level.
   Try one dictation passage — 3 minutes, and it doubles as a level check.
   [ Start ]                              [ or pick your level yourself ]
   ```

2. **The one-tap level picker ships with this work.** It was previously roadmap-Later, but the
   cold start leans on it, and the data layer already exists and is unused: the `cefr_declared`
   column and the `setLearnerDeclaredLevel` helper are written with **no callers**. Only the UI
   is missing. Skippable; default B1 *as a starter policy input only*.

**Explicit rule:** a `null` level must never be rendered as "B1" to the learner. The starter
policy may treat `null` as B1 for material selection, but the Home must not claim a level the
system has not established. Show the CTA instead.

As attempts accumulate the Home fills in and the CTA recedes. **The Home's shape is a function
of learner state** — a property of the loop framing, not a complication.

### 4.4 Band exhaustion — not an edge case, a week-one certainty

With **5 passages per band**, a motivated learner exhausts their band in two sittings. The
Home's central promise ("here is your next practice") then fails **exactly when the learner is
most engaged**. This needs a product answer, not just a fallback branch.

**Answer: cross-mode reuse.** A passage already dictated is recommended as *reading aloud*.

Three reasons this is the right answer and nearly free:
1. It is already a settled decision (§3.4, the dictation↔reading handoff), needing no new call.
2. It is pedagogically sound — listen → transcribe → read aloud is shadowing preparation.
3. It makes 20 passages behave like 40, pushing the exhaustion point out by a factor of two.

Starter-policy fallback order, when no unpractised same-band material remains:
`same band, other mode` → `adjacent band, unpractised` → `revisit weakest-scoring passage`.

**Consequence for the roadmap:** the Home makes the library's thinness *visible* in a way the
current catalogue does not. The content push (20 → several hundred passages) should move up in
priority as a result of shipping this.

### 4.5 The replaceable recommendation boundary

Keep the seam small and obvious. **Do not** build a recommendation service, repository layer, or
generic feed framework now.

```
Home loader
  ├─ profile      one learner-profile row
  ├─ resumable    in-progress attempts / drafts        (bounded)
  ├─ activity     recent records                       (bounded)
  └─ materials    published library passages           (bounded)
        │
        ▼
  selectStarterPractice()     ← pure, deterministic, unit-tested
        │
        ▼
  Home view model

  later: selectStarterPractice()  →  matching service
```

`selectStarterPractice()` is a pure function over already-fetched data — consistent with the
repo's test policy (`AGENTS.md`: vitest covers pure deterministic logic; D1 loaders are verified
against the dev server). Every query is bounded; no unbounded scans.

**Degradation:** if a personalisation query fails, the Home falls back to the module launcher.
It must never render blank. The learner model's own write paths already fail soft; the read path
must too.

---

## 5. Shared module registry — a bug fix

Extract one pure-data module: `apps/web/app/utils/english-modules.ts`.

```ts
{
  id, label, route,
  trialRoute?,                                  // where signed-out users go, if any
  access:  "public" | "trial" | "auth",
  group:   "practice" | "utility",
  status:  "active" | "planned"
}
```

Both `english.tsx` (landing) and `ToolNavRail.tsx` (switcher) consume it, plus the Home's
Explore section. This is **not** abstraction for its own sake: it repairs the §1.2(c) drift where
the switcher's simplified copy silently bypasses trial routing for anonymous users.

- `access: "public"` → link straight in (Dictation, Translate).
- `access: "trial"` → signed-out users go to `trialRoute` (Reading, Writing).
- `access: "auth"` → signed-out users get the login popup (Speech).

`group` encodes the tiering: `practice` = the graded loop (Dictation, Reading, Writing);
`utility` = adjacent tools (Translate, Speech). The Home reports on `practice` only.

### 5.1 Switcher changes

1. **Add a home entry** ("English Studio" → `/english/home`) so the loop is one click from
   inside any tool. Today there is no way back to it.
2. **Group by tier** rather than five equals, driven by `group`.
3. **Give Translate a way back.** It keeps its two-pane, anonymous-first shape but gains at
   least a link to English Studio so it is not a dead end. Whether it hosts the full switcher is
   a visual-design call.
4. **Per-tool "Progress" actions** point at the Home's snapshot. `/reading/progress` and
   `/writing/progress` survive as **drill-downs**, consistent with the learner-model design's
   §9.2 decision.

---

## 6. Inside a tool

- **Reading loses its passage-listing rail.** The catalogue is the surface; a grid scales to
  hundreds of passages, a 260px chronological column does not. This also removes the duplicate
  query (§0.1). Practice sessions stay focused (no competing rail) — already true for dictation
  sessions.
- **Prepared graded material is the main axis**, grouped by band, each card carrying the
  learner's own state: `New` / `In progress` / `Best 82%`. **Completed material is card state,
  not a separate section.**
- **Own texts stay clearly visible but secondary** — a distinct lower section with `[Add text]`
  plus recent items, not the first thing on the page.

```
Reading
├─ Graded library            ← main axis; cards show New / In progress / Best score
└─ Your texts                ← secondary, visible, not hidden
     [ Add text ] + recent
```

Dictation's catalogue keeps its history rail for now; whether a catalogue keeps a navigation
shell is a **separate decision per tool**, not something Reading should copy blindly.

### 6.1 Why not a faceted material surface

The proposal floated one surface with facets (state: new/in-progress/done × source:
library/mine), arguing that provenance might be a meaningless technical distinction next to
"what can I practise right now."

**Rejected — provenance is a capability boundary, not a label:**

| | Library passage | User-pasted text |
|---|---|---|
| CEFR band + tags | ✅ | ❌ (untagged by decision) |
| Can be dictated | ✅ (has sentence audio) | ❌ |
| Contributes tag mastery | ✅ | ❌ |
| Can be recommended | ✅ | ❌ |

A learner may not care about "who wrote it," but they will certainly notice that one kind cannot
be dictated and does not move their profile. Meanwhile `completed` vs `new` genuinely *is* just
state — which is why it belongs on the card, not in a taxonomy.

Facets at a 20-passage library is the right abstraction at the wrong time.

### 6.2 Writing is not forced into this shape

Writing has no prepared library (the graded prompt bank remains roadmap-Later), so there is
nothing to foreground above the learner's own work — their writing *is* the content. For
writing, this iteration means only: drafts feed the Home's **Continue** and **Recent**, and
history moves to the Home. The composer and per-article rail stay. Writing contributes **no tag
mastery** and must not be presented as if it does.

---

## 7. Risks

1. **Explore becomes a second menu** (§4.2) — the most likely way this ships and quietly fails.
2. **The Home is thin for the first week** — cold-start CTA (§4.3) is the answer and must be
   executed well, or the Home is a worse front door than a tool menu.
3. **Every premise is untested** — no users, no analytics. The design is reasoning from the
   product's strategic position, not evidence. Mitigation: cheap, phased, reversible.
4. **Demoting custom text is a real behaviour change** — Reading's original product *was* "paste
   your own text." Low risk today (~14 user passages), but it should be deliberate.
5. **Band exhaustion** (§4.4) — mitigated by cross-mode reuse, not eliminated.

---

## 8. Implementation phases

Three independently shippable, independently revertible phases. **Do not do this as one change.**

### Phase 1 — Navigation truth
- Extract `english-modules.ts`; both landing and switcher consume it.
- Fix anonymous switcher trial/popup behaviour.
- Add the English Studio home entry + tier grouping to the switcher.
- Give Translate a link back to the studio.
- **No page redesign yet.**

### Phase 2 — Progressive Coach Home
- New `english_.home.tsx`; `/english` redirects signed-in users to it.
- Sections in order: Continue → Next → Explore → Progress → Recent.
- Extract `selectStarterPractice()` as a pure, tested function.
- One-tap level picker (wire up the existing unused `setLearnerDeclaredLevel`).
- `/english/progress` → redirect.
- Bounded queries; degrade to launcher on failure.

### Phase 3 — Reading simplification
- Remove the passage-listing rail; drop the duplicate query.
- Graded library as main axis; own texts secondary but visible.
- Completed/best score as card state.
- No facets. `/reading/progress`, `/writing/progress` remain drill-downs.

---

## 9. States and tests

The Home must be correct in every state, not just the happy one:

```
/english
├─ signed out → marketing landing → public / trial / popup routing all correct
└─ signed in  → /english/home
   ├─ cold       no profile, no history            → level CTA
   ├─ partial    an unfinished dictation exists    → Continue wins
   ├─ active     level + progress + recent activity
   ├─ exhausted  current band fully practised      → cross-mode / adjacent-band fallback
   ├─ stale      resumable passage now unpublished or deleted
   └─ degraded   a personalisation query fails     → module launcher, never blank
```

`pnpm test` (pure logic) must cover at least:

- `null` level (and that it is never rendered as "B1")
- declared vs measured level precedence
- resumable work outranks a fresh recommendation
- same-band unpractised selection
- exhausted-band fallback order (§4.4)
- multiple in-progress attempts — which one wins
- referenced passage deleted / unpublished
- anonymous module resolution for all three `access` values

Route loaders and real navigation are verified against the running dev server, per `AGENTS.md`.

---

## 10. Out of scope

- **The matching service.** This design leaves it a replaceable seam (§4.5) and must not
  implement ranking.
- **Visual design** — no colours, spacing, components, charts, streaks, or gamification.
- **The writing prompt bank** (roadmap Later).
- **Growing the material library** — a separate content task, whose priority this design raises
  (§4.4).
- **Translate's and Speech's internal shapes**, beyond Translate's link back.
- **Semantic colour separation and the free-entry-point work** — see §10.1.

### 10.1 Why the colour / free-entry work is a separate track

The owner raised a second initiative: **(a) separate functional colours** (red reserved for CTA,
errors given their own colour), then **(b) make free entry points explicit** (header + hero
chip). The sequencing instinct is right, and the problem is real and verifiable:

- `--accent: #b52a1c` and `--red: #b52a1c` are **the same colour in light mode**, and `--accent`
  has 87 usages spanning primary CTAs *and* `.form-error`. **A form error and a primary button
  are currently indistinguishable by colour.** There is no semantic colour layer at all — no
  `--error` / `--success` / `--warning` token exists.
- Related small defect worth folding into that work: `.dash-trend.is-up` references
  `var(--sage, #6a9c78)`, but **`--sage` is not defined** — it silently relies on the fallback.

**Decision: keep it out of IA v2, and keep the owner's ordering.** Reasons:

1. This doc is structure and routing only; mixing a design-system change in makes both harder
   to review, test, and revert. IA v2 is already three phases.
2. The dependency runs the way the owner sequenced it: **(b) adds new coloured UI** (a "free"
   chip, header entries), and you should not add coloured elements before deciding what colours
   mean. Colour separation first is correct.
3. **Half of (b) is already in IA v2 under another name.** The `access: public | trial | auth`
   field in the shared registry (§5) *is* the data model that makes free entry points correct
   and consistent — and it fixes the anonymous-switcher bug at the same time. So Phase 1 of this
   design **unblocks** the free-entry work; the header/hero presentation then follows the colour
   work.

Recommended overall order: **IA Phase 1 (registry) → colour separation → free-entry surfacing →
IA Phases 2–3**, or colour separation in parallel since it touches CSS rather than routing.
Both should be their own roadmap items with their own brief.

---

## 11. Documentation sync (at implementation time)

- `docs/english-studio-ia-design.md` — mark its deferred half resolved here.
- `docs/architecture.md` — `/english/home`; `/english` signed-in redirect; `/english/progress`
  redirect; switcher tiering; the shared module registry.
- `docs/roadmap.md` — scope this as an iteration (Now → Done per phase); raise the library
  content push (§4.4); add the colour-separation and free-entry items (§10.1); move the level
  picker out of Later into this scope.
- `docs/learner-model-design.md` §9 — the progress centre now lives inside the Home.
- `AGENTS.md` — no change expected; confirm at implementation time.
