# English Studio Home v3 — one protagonist per state

**Document role:** proposal.

Status: **direction agreed and decisions O1–O3 settled by the owner 2026-09-23; not yet
authorized for implementation.** The owner reviewed three outside Home mockups, agreed with the
assessment in §2, asked for this design, and accepted all three recommendations in §8.
Implementation starts only when a roadmap entry with acceptance criteria is confirmed. §9 is the
draft for that entry.

Intended reader: the agent implementing Home v3, and anyone reopening its choices. It changes the
**presentation** of `/english/home` (`apps/web/app/routes/english_.home.tsx`). It does not change
`selectStarterPractice()` except where §6 says so. The IA it builds on is
[`english-studio-ia-v2-design.md`](english-studio-ia-v2-design.md) §3.3, and ADRs
[0006](decisions/0006-learner-surface-invariants.md) and
[0007](decisions/0007-no-cross-tool-practice-session-entity.md) still bind.

Mock: the private design canvas *English Studio 首页方案*
(`https://claude.ai/artifact/TxiuvJfiuTdC5KoiCMabCp`, owner's account). It has four artboards:
states S1, S2 and S3 at 1440 px, and S1 at 390 px. Where the mock and this document disagree,
this document wins.

## 1. Current Home, verified in code (2026-09-23)

- **Page title and greeting.** The title is "Today" (今天), followed by a greeting.
- **Action zone.**
  - Continue and the recommendation sit side by side as two equal-width cards. Continue's button
    is primary, and the recommendation's Start drops to ghost while Continue exists.
  - The meta line on each card is plain body text. The Continue card shows no progress bar.
- **Basis line and recent list.**
  - A one-line basis sentence (level + provenance + attempt count) with "Full progress →".
  - Recent: three rows, each with a title and a text line (mode · score / attempts · best /
    in progress n/total). The rows show no visual measure.
- **Where Continue comes from** (`pickContinue` in `utils/starter-practice.ts`):
  - It picks the newest in-progress dictation on a still-published passage, **or** the
    learner's most recently updated Writing article, whichever is newer.
  - That Writing article is not necessarily unfinished. `writing_articles.status` has only one
    value, `active`, so "draft" means "the latest Writing session", however old.
- **Resume.** Resuming a dictation keeps the checked sentences and starts at the next one
  (`dictation.$passageId.tsx`, "Resume drops the learner back where they stopped").
- **Durations.** Nothing on Home can estimate a duration. Dictation practice time is recorded per
  attempt (`0022_dictation_practice_seconds.sql`), but there is no per-passage estimate.

## 2. What was taken from the three outside mockups, and what was not

| Mock | Taken | Not taken, and why |
| --- | --- | --- |
| A — single practice focus | One protagonist with a large title. A structured meta line (mode / level · topic / sentences). Directional alternatives as quiet secondary actions. | *Day-streak* and 7-day squares: exploration §"Three things deliberately not to borrow" rules out streak machinery. *Tool cards*: IA v2 decision 11 says the rail is the explore surface. *"Vocabulary you haven't heard yet"*: a personalisation claim the recommender cannot make (§3.3 honesty rule). *Duration*: no data. |
| B — three-step Today plan | Recent rows with a score bar. Specific Writing state wording. | *The plan itself*: this is the unauthorized "Today" layer in `exploration.md`, whose three prerequisites are unmet. *Per-step minutes*: no data. *Accuracy chart and level scale on Home*: they belong on `/english/progress` (IA v2 §3.4 note). The level scale also omitted C2. |
| C — stats strip + two cards | Continue with concrete progress (sentence *n* of *m* plus a bar). | *Stats strip*: analytics-first, against decision 8. *"Practise now" beside Resume and Start*: three primaries on one screen. *Average across modes*: it mixes dictation accuracy with reading scores. *Streak* and *tool grid*: as for A. |

## 3. Principles

1. **One protagonist per state, and exactly one filled (primary) button.** Everything else on the
   page is quieter: a ghost button, a text link, or a row.
2. **Continue outranks the recommendation** (IA v2 §3.3). This is unchanged, and it is now
   visible in size, not only in button weight.
3. **Every number on the page is a stored fact.** No durations, streaks or cross-mode averages.
4. **Recommendation copy stays within what the seam knows**: level fit and practice history
   (`practice.reason.*`), never matching.
5. **Home is where the loop restarts, not a dashboard.** Depth stays on `/english/progress`.

## 4. States

The loader already computes everything a state needs except §6.2.

### S1 — Continue exists (with or without a recommendation)

Top to bottom:

1. **Header.** "Today", then a greeting that names the protagonist:
   - dictation: "{name}，欢迎回来。上次的听写还差 {left} 句。" / "Welcome back, {name}. {left} sentences left in your last dictation."
   - writing: "{name}，欢迎回来。上次的写作还在等你。" / "Welcome back, {name}. Your last piece of writing is waiting."
2. **Continue hero** (full content width, top rule):
   - kicker "继续上次的练习" / "Pick up where you stopped", in action colour, mono;
   - the title at display size, marked `lang="en"` for a passage;
   - the meta line (§5.2);
   - **dictation only:** a progress bar and `done / total`;
   - the primary button:
     - dictation: "从第 {next} 句继续" / "Continue from sentence {next}", where `next = done + 1`;
     - writing: "继续写作" / "Continue writing";
   - beside the button, one muted line:
     - dictation: "已完成的 {done} 句会保留" / "Your {done} checked sentences are kept";
     - writing: the §6.2 round-state line, followed by "编辑于 {date}" / "Edited {date}".
3. **Recommendation strip** (only if a recommendation exists), ruled above and below:
   - left: kicker "接下来 · 教练推荐" / "Next · Coach pick", then the title (26 px) with the meta
     line inline, then the reason;
   - right: a ghost **Start**, and below it the directional alternatives as text links.
4. **Basis line**, unchanged.
5. **Recent** (§5.4).

### S2 — No Continue, recommendation exists

The recommendation becomes the hero, laid out like the S1 hero:

- kicker "教练推荐";
- display title and meta line;
- the reason at body size, plus one line on what the mode asks. For dictation: "一句一句听，把听到的写下来，写完每句马上对照原文。"
- the primary button: "开始听写" / "Start dictation", or "开始朗读" / "Start reading aloud";
- the alternatives as text links on the same row.

Below the hero come the basis line and Recent. The greeting is "{name}，欢迎回来。今天推荐这一篇。"

### S3 — Cold (no level)

This state is unchanged in content (IA v2 §3.5): the "做一篇听写" hero and the level picker. It
moves to the same hero typography and rules as S1 and S2, and still shows no basis line and no
Recent.

### S4 — Neither Continue nor a recommendation

Keep today's "选择要练习的内容" block, restyled as a hero, with Dictation primary and Reading ghost.

### Degraded

Unchanged. The notice sits above the hero, and the recovery rules are those of IA v2's "Home data
bounds and failure behavior".

### Mobile (< 640 px)

- A single column.
- The hero's primary button is full width at 48 px.
- The recommendation strip stacks, with its Start and the alternatives on one wrapping row.
- Recent rows keep the bar at 80 px.

## 5. Components

### 5.1 Hero

A top rule, then 36 px padding.

| Element | Style |
| --- | --- |
| Kicker | Mono, 11 px, action colour |
| Title | `--font-display`, 52 px desktop, 36 px mobile |
| Meta | Mono, 12 px, muted |
| Body | 17 px |
| Primary button | The existing `.btn .btn-primary`, 48 px tall |

### 5.2 Meta line

Mode, then level · topic, then sentence count, separated by ` / `. Example:
`听写 / A2 · FAMILY / 11 句`.

- Topic is the passage's own `topic`. Leave the segment out when the topic is null.
- Level is the passage's band, not the learner's level.
- Writing shows `写作 / {prompt level if the article has an assignment}`, and no sentence count.

### 5.3 Progress bar (dictation Continue only)

- 6 px, action colour on the `--bg-alt`-toned track.
- Width `done / total`, labelled `done / total` in mono.
- It has `role="img"` with an accessible label, "已完成 {done} / {total} 句".

### 5.4 Recent row

A three-column grid: title (with its mode line under it) · bar · value.

| Latest state | Bar | Value |
| --- | --- | --- |
| Score | Neutral tone, width = score | Dictation shows `%`, Reading a bare number |
| In progress | Action colour, `done / total` | `n/total` |
| Evaluating | None | "评估中…" |

- The mode line keeps today's text: "练过 {count} 次 · 最佳 {best}" when attempts > 1.
- **The Continue item is not repeated in Recent** (§6.3).
- The bar's neutral tone is a new token, `--score-bar`. It must pass 3:1 against the track, and
  it needs a dark-mode value.

## 6. Behaviour changes (small, each testable)

### 6.1 Stale Writing sessions stop being Continue (decision O1: 14 days)

Today the latest Writing session becomes Continue at any age. Proposed rule:

- A Writing session **last updated more than 14 days ago** is not offered as Continue.
- It remains reachable from `/writing`.
- A dictation in progress is not affected, because its resume state is exact and cheap.

This is implemented in `pickContinue`, with tests for 13 and 15 days, and for both kinds present.

### 6.2 Writing state line (decision O2: yes)

The writing hero could say more than "Edited {date}":

- "第 {n} 轮反馈已返回" / "Round {n} feedback is back" when the latest round's
  `feedback_status = 'completed'`;
- "反馈生成中" / "Feedback in progress" when it is `pending`.

This needs the latest round of **one** article, in one bounded query (the Writing history limit
stays 1).

Nothing records whether the learner has **read** the feedback, so the copy must not say "unread"
or "waiting for you".

### 6.3 De-duplicate Continue and Recent

When Continue is a dictation, drop that passage from Recent and fill the list with the next row,
keeping three rows. This is a pure change in the loader's `recent` assembly.

## 7. Copy

- New keys go under `homePage.*` in both catalogues:
  - greeting variants
  - hero kicker
  - continue-from label
  - kept-sentences line
  - mode-ask line
  - writing state lines
  - progress bar label
- Existing `practice.reason.*` and `practice.alt.*` keys are reused unchanged.
- Chinese copy follows the interface language (ADR 0011). Passage titles and topics stay English
  and carry `lang="en"`.

## 8. Decisions (owner, 2026-09-23)

All three were taken as recommended:

- **O1 — Stale Writing cutoff (§6.1): 14 days.** The alternatives were never (today's behaviour)
  or 7 days.
- **O2 — Writing state line (§6.2): yes**, as specified, with no "unread" claim. It costs one
  bounded query.
- **O3 — Topic in the meta line: shown**, taken from the passage's stored topic, upper-cased in
  the mono line, and left out when absent.

## 9. Draft roadmap entry — "Now/Next — Home v3"

Acceptance criteria:

- (a) **S1–S4 and the degraded state** render as §4 in both interface languages. Each state has
  exactly one `.btn-primary` (a test asserts this).
- (b) **The S1 dictation hero** shows the progress bar and `done / total` from `sentences_done`
  and the passage's sentence count. Its button text names `done + 1`.
- (c) **The recommendation** renders as a strip in S1 and as the hero in S2. The alternatives are
  text links, and only directions that exist are shown (unchanged seam behaviour).
- (d) **No duration, streak, cross-mode average, tool grid or chart** appears on Home.
- (e) **Recent** shows the §5.4 bars, and never repeats the Continue passage.
- (f) **O1:** a Writing session older than the cutoff is not Continue. Unit tests
  cover the boundary.
- (g) **O2:** the Writing hero shows the latest round state from one bounded query.
  No copy claims the feedback is unread.
- (h) **Layout checks.** At 390 px there is no horizontal scroll and the primary is 48 px. Dark
  mode passes contrast for bars and text.
- (i) **Existing tests still pass**: ADR 0006 invariants and the Home data-bounds tests.
  `docs/english-studio-ia-v2-design.md` §3.3 gets a pointer to this document.

Verification:

- unit tests for (a), (b), (e) and (f), rendered with fixture data;
- the browser fixture (`pnpm test:browser:fixture`), covering users `a`, `cold` and
  `recommend`, at 1440 and 390 px, in both locales and both themes.

## 10. Not in scope

- A Today plan, streaks, and any change to what `selectStarterPractice()` recommends.
- Duration estimates. They can be revisited once per-passage practice time has enough history.
- Home panels that duplicate `/english/progress`.
