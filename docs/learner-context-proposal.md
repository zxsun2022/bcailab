# Learner Context for Graders — Proposal

Status: **proposal, not authorized.** Owner-raised 2026-09-14. Nothing here is on
`docs/roadmap.md`; the acceptance criteria in §8 are drafts for the owner to accept, change, or
reject. Indexed from `docs/exploration.md`.

Intended reader: the owner deciding whether to promote this, and the agent who would implement
it. Read `docs/learner-model-design.md` first — this proposal leaves that design's measurement
rules intact and adds a layer beside them.

## 0. The observation, and what verification added

The owner's observation: learning records are under-used, there is no deliberate context
engineering, and the grader data each exercise accumulates stays inside that exercise.

Checked against the code on 2026-09-14, it is correct, and more specific than "isolated":

1. **Each grader remembers an object, not a learner.** Reading remembers one passage, Writing
   remembers one session, and Dictation feedback remembers nothing.
2. **The shared learner layer only admits what fits a measurement vocabulary.** Writing — the
   mode with the richest feedback — contributes nothing to it, and no mode's qualitative
   feedback is read again outside its own page.
3. **The only cross-mode synthesis reads numbers only**, and its whole output reaches exactly
   one grader, as at most eight short phrases.

## 1. Current state — facts verified in code

### 1.1 What each grader is given

| Grader (`LlmTask`) | Prompt built in | Context in the prompt | Memory scope |
|---|---|---|---|
| Reading evaluation (`reading_eval`) | `esl-reading-eval.server.ts` `buildPrompt`, fed by `esl-reading-attempt.server.ts` | Passage, audio, duration; the last three evaluations **of this passage** in full and older attempts on it as scores; profile `persistent_issues` and `strengths` | One passage, plus ≤ 8 profile phrases |
| Writing feedback (`writing_feedback`) | `writing-eval.server.ts` `buildWritingEvaluationPrompt`, fed by `writing-article.server.ts` | Rubric; assignment snapshot; the previous round's feedback JSON and earlier rounds' band estimates **of this session** | One session. No profile, no other session |
| Dictation feedback (`dictation_feedback`) | `dictation-feedback.server.ts` | This attempt's non-match diff ops and the passage band | One attempt |
| Profile naming (`learner_profile_naming`) | `learner-model.server.ts` `runNamingPass` | Up to four weak and four strong tags from `tag_mastery_json`, as descriptions and percentages | The 12-tag vocabulary |

Trials pass no history and no profile. That is correct: they persist nothing.

### 1.2 What each grader produces, and who reads it back

| Mode | Stored grader output | Enters the shared learner layer | Read again by |
|---|---|---|---|
| Dictation | `sentence_results` diff ops; `feedback_json.patterns` (pattern, evidence, tip) | Ops → deterministic `learner_tag_observations`; attempt counter | Ops: aggregation. **Patterns: only that attempt's summary panel** |
| Reading | `output_json`: five scores, `cefr_guess`/`cefr_confidence`, highlights, top actions, commentary, `progress_vs_last` | Highlights → `llm` observations on six prosodic/phonetic tags; attempt and seconds counters | The next evaluations of the same passage; `/reading/progress`. **`cefr_guess` is displayed only** |
| Writing | `feedback_json`: up to 15 annotations (severity, rubric dimension, quote, diagnosis, guiding question), round summary with `band_estimate`, delta | **Nothing** — no observations, no counters, no CEFR signal | The next round of the same session; `/writing/progress` |
| Translate | Nothing, unless the learner explicitly saves a result | Nothing | `/translate/saved` |

On the consuming side, `/english/progress` reads the profile row and dictation accuracy, and
`selectStarterPractice()` reads the resolved level and practice records but not
`tag_mastery_json`.

### 1.3 Drift and defects found on the way

Recorded here because they are the same isolation seen from other angles. This proposal fixes
none of them without the owner's say.

- **Writing's contribution is overstated in the design.** `learner-model-design.md` §1 says
  Writing "contributes its CEFR signal and practice-time counters only". The code writes
  neither: no Writing path calls `incrementEslLearnerProfileCounters`, and `band_estimate` never
  leaves Writing.
- **Reading's CEFR guess is not folded in.** §7 of the same design says Reading contributes
  `cefr_guess` "as a weaker secondary signal". `runRecompute` estimates CEFR from
  `getDictationBandResults` alone.
- **Dictation feedback presents the passage band as the learner's level.** The prompt opens "A
  learner at CEFR level ${band}", where `band` is the passage's band. The learner's own level is
  never given. (The `?? "B1"` fallback only fires for an unbanded passage, which Dictation does
  not serve today, so the practical defect is the mislabel.)
- **An unmeasured anchoring loop already exists.** `persistent_issues` are named from
  `tag_mastery_json`, which includes Reading's own `llm` observations. Those phrases are then
  given back to the Reading grader, whose highlights produce the next observations. Nobody has
  measured whether naming a weakness to the grader makes it find that weakness (§5).

## 2. Why it is shaped like this

This is not an oversight in the measurement design; that design is doing its job.

The learner model was built as a **measurement** system under one rule — *the deterministic
layer measures, the LLM interprets* — and that rule correctly requires a vocabulary before
evidence may enter: an observation must name a `passage_tags` tag and carry exposure and hits.
Grader context, by contrast, was never designed as a layer. Each prompt was assembled when its
grader was built, from whatever that tool's own tables held. So the admission rule for
measurement became, by default, the admission rule for context as well, and everything without
a vocabulary — all of Writing, and every mode's qualitative feedback — had no path to any other
grader.

## 3. The distinction this proposal rests on

Measurement and context are different jobs with different rules:

| | Measurement (exists) | Grader context (missing) |
|---|---|---|
| Question it answers | How good is this learner at X? | What should this coach know before judging this piece? |
| Consumers | Progress, CEFR estimate, a future matcher | One grader call |
| Admissible inputs | Deterministic tallies; LLM-derived rows down-weighted | Deterministic aggregates **and** earlier coach feedback, labelled as such |
| Needs a vocabulary | Yes | No |
| Persistence | Append-only rows, denormalised profile | None: derived per call |
| Characteristic failure | Wrong numbers | Anchoring — the grader finds what it was told to expect |

Separating them is what lets Writing's feedback reach other graders **now**, without waiting on
the vocabulary that Writing's entry into measurement still needs. The principle is not relaxed:
context may carry an earlier model's judgement *as a judgement*, and nothing in context is ever
written back as a measurement.

## 4. Design: the learner brief

### 4.1 Shape

One pure, bounded, cross-mode summary, assembled per grader call and never stored:

```ts
type LearnerBrief = {
  asOf: string; // every source row is bounded by created_at < asOf
  level: { value: CefrLevel | null; basis: "measured" | "declared" | "default"; confidence: number };
  measured: { weak: TagLine[]; strong: TagLine[] }; // from tag_mastery_json
  coachNotes: {
    // Earlier LLM feedback. Never measurements.
    writing: { dimension: string; sessions: number; examples: Note[] }[];
    dictation: { pattern: string; attempts: number; evidence: string; at: string }[];
    reading: { kind: string; count: number; examples: Note[] }[];
  };
};
type TagLine = { tag: string; label: string; mastery: number; exposure: number; trend: number };
type Note = { quote: string; diagnosis: string; at: string };
```

Every source is append-mostly and carries `created_at`, so a brief is **re-derivable as of any
past evaluation** without being stored — the same re-runnability the observation layer has.
Deleted work breaks exact reproduction, deliberately (§4.5).

### 4.2 Sources and bounds

At most four D1 reads, one per source, each filtered by an existing per-user index; no
migration. The two latest-row reads use the correlated-subquery pattern
`listLatestEslReadingEvaluationsByPassage` already uses.

| Source | Read | Bound |
|---|---|---|
| Profile | `esl_learner_profiles` by user | One row |
| Writing notes | Non-deleted sessions other than the current one, most recently updated first, each with its latest round that has completed feedback | Six sessions, one round each; critical and improvement annotations only |
| Dictation notes | Completed attempts with feedback (`dictation_attempts_user_idx`) | Six attempts, other than the current one |
| Reading notes | Recent attempts (`esl_attempts_user_created_idx`) with their latest evaluation (`esl_evaluations_attempt_idx`) | Six evaluations on passages other than the current one |

Assembly is deterministic. Weak and strong tags reuse the naming pass's thresholds (exposure ≥ 6,
mastery < 0.7 or ≥ 0.9) rather than adding another definition. Writing notes group on the rubric
`dimension`, a closed set per coach in `writing-agents.ts`. Dictation patterns group on the
case-folded pattern name. Quotes are cut to 80 characters and diagnoses to 140, the rendered
brief has a hard ceiling of about 1,800 characters with a fixed truncation order (examples
first, then the oldest groups), and a brief with no evidence renders nothing at all — no empty
headings.

Free-text grouping of dictation patterns is crude: "Dropped articles" and "Missing articles"
do not merge. Stage 1 accepts that, since the grader reads recurrence for itself; Stage 2
replaces it.

### 4.3 Projection per grader

Each grader receives the part of the brief that bears on what it judges. Relevance filters use
only closed sets (tag names, rubric dimensions), never free text. The table is tunable and
tested, not a schema:

| Grader | Receives | Withheld, and why |
|---|---|---|
| Dictation feedback | The learner's level, labelled separately from the passage band; weak and strong tags; dictation notes from earlier attempts; writing notes on grammar dimensions | Reading notes: prosody does not explain a transcription error |
| Writing feedback | Level; writing notes from other sessions; weak `article`, `final_s`, `past_ed`, labelled as **listening** evidence | Phonetic and prosodic tags; reading and dictation notes |
| Reading evaluation | Level; tags in Reading's own six-tag set; reading notes from other passages | Writing notes. Dictation notes until Stage 2 makes them filterable by category |
| Profile naming | Unchanged in every stage of this proposal | It feeds `/english/progress`, a measurement surface |

For Reading, the brief **replaces** today's `persistent_issues`/`strengths` injection rather
than adding to it: mastery with exposure says more than a phrase, and giving the grader the same
signal twice would double the anchoring pressure §5 is about.

### 4.4 Prompt contract

One renderer, one section, placed after the rubric and before the work being judged. Each
existing prompt already ends with the current text, and that stays last:

```text
## Learner context (other practice, as of 2026-09-14)
Use this only to prioritise and connect what you observe in the current work.
- Judge the current work on its own evidence. Never add an issue, highlight, or score
  because of this section.
- When the current work shows a pattern listed here, say that it recurs.
- Lines marked "coach note" are earlier AI feedback, not verified measurements.
- If the current work shows none of this, do not mention it.

Level: not established
Measured: word-final -s endings — 58% over 41 occurrences, falling
Coach note (writing, 3 of the last 6 sessions) — Grammatical Range & Accuracy:
  "a important factor" — article before a vowel sound (2026-09-10)
```

A null level renders "not established" and never B1, which is ADR 0006 applied to prompts. Stage
1 changes no output schema, so stored feedback, parsers and the UI are untouched; the effect
lands in the prose fields each grader already produces.

### 4.5 Where it runs, and what it inherits

- **Off the request path.** All three graders already run as background tasks under `waitUntil`
  in their normal path, so the extra reads join work that already waits seconds on a model call,
  never a page request. Assembly failure falls back to no brief, like every other learner-model
  path.
- **Signed-in only.** Trials persist nothing and receive nothing.
- **Deleted work is forgotten.** Soft-deleted attempts are excluded, and so are rounds of a
  deleted Writing session. Those rounds are retained for recovery, so a query on
  `writing_revisions` alone would quietly bring deleted work back into coaching.
- **Saved translations are excluded** (decision 2). Save is an explicit bookmark, not consent to
  become evidence.
- **No new recipient.** Quotes are the learner's own text, sent to the same provider that
  already graded them. Brief content is never logged — counts only, per English Studio's
  observability rule.
- **No new entity**: no session or sitting (ADR 0007). **No agent loop**: each grader stays one
  call (ADR 0005). **No job runner**: the offline compute layer in `docs/exploration.md` remains
  a separate question.

## 5. The hazard that decides the rollout order: anchoring

A grader told "weak at the *th* sound" is plausibly more likely to highlight *th* words. The
graders differ sharply in what that would damage:

- **Dictation feedback cannot contaminate measurement.** Its measurement is the deterministic
  diff, computed before and independently of the call. A biased tip is a worse tip, nothing more.
- **Writing feedback writes no measurement** today, so the same holds.
- **Reading closes the loop.** Its highlights *are* its observations: a primed highlight becomes
  an `llm` miss, lowers mastery, strengthens the next brief, and primes the next evaluation.

Hence the order: Dictation, then Writing, then Reading behind a gate. The gate reuses the tool
that settled ADR 0005. Add a `--brief <file>` option to `scripts/grader-variance.ts`; then, for
one fixed recording, run five calls with no brief, five with a brief asserting a weakness the
recording does not show, and five with one it does show. Reading passes if the false brief keeps
the primed tag's highlight count inside the range of the no-brief runs and the overall-score
spread stays under ADR 0005's 4-point threshold. More recordings sharpen the result, as ADR 0005
already notes. The same run pointed at today's `persistent_issues` injection measures the loop
that exists now.

If Reading fails the gate, it takes a brief without measured tag claims, or its
context-conditioned observations take a new `source` value with its own weight — the mechanism
IA v2 §6.2 already names for new signal sources.

## 6. What this proposal does not do

- No Writing observations and no Writing vocabulary; that is Stage 3 and the roadmap's Next item.
- No change to `SOURCE_WEIGHT`, aggregation, the naming pass, or CEFR resolution.
- No recommender change; matching remains Dictation v2.
- No Today queue, enrolment unit, or offline job.
- No new learner-facing surface.

## 7. Stages

**Stage 1 — the brief, read side only.** §4 and §5 as written. Useful on its own: no grader
judges with learner amnesia any more.

**Stage 2 — structured categories on grader output.** Writing annotations and dictation patterns
gain an optional `category` from one small closed list (for example article, verb form,
agreement, word choice, collocation, cohesion, sentence boundary, spelling, punctuation,
register, task). Old stored feedback lacks the field and still loads — the compatibility pattern
`next_drills` established. The brief groups on `category` instead of free text, and dictation
notes become filterable for Reading. This is still context only, and it is the cheapest way to
collect the distribution a vocabulary decision should be made from, rather than choosing one in
advance.

**Stage 3 — Writing enters measurement** (roadmap Next: "Fold writing into the ability
profile"). Three problems belong to that decision rather than to this proposal, and are recorded
so they are not rediscovered:

- *Exposure without ground truth.* Dictation and Reading count a tag's occurrences in reference
  text. An essay has no reference text, so "how many articles should there have been" is not
  deterministic.
- *Recall inflates mastery.* A grader flags some errors, not all — Writing caps annotations at
  15 — so `hits = exposure − flagged` overstates mastery by construction.
- *Perception and production must not average.* Writing's `article` is production; Dictation's
  is perception. Aggregation groups by tag alone today, which already blends Dictation's and
  Reading's `linking`. Keying mastery by tag and mode is a `tag_mastery_json` shape change, not a
  migration — observations already carry `mode`.

**Later — offline synthesis.** The exploration entry *An offline compute layer* turns the same
corpus into next items. Its jobs would read exactly this brief, so building Stage 1 first gives
them a tested contract.

## 8. Draft acceptance criteria for Stage 1

- (a) A pure `buildLearnerBrief` and per-grader projection, vitest-covered: output stays bounded
  under hostile volume; a null level renders "not established" and never B1; no empty section
  when evidence is absent; ordering and truncation are deterministic; deleted inputs contribute
  nothing.
- (b) Dictation, Writing and Reading prompts include their projection for signed-in learners, in
  that rollout order. Reading is enabled only after the §5 gate passes, with the spike recorded
  in `docs/spikes/`. Trial prompts are unchanged.
- (c) The Dictation prompt no longer presents the passage band as the learner's level.
- (d) At most four additional bounded D1 reads per evaluation, all inside the existing background
  tasks; no added latency on any page request.
- (e) No migration, and no change to stored output schemas, `learner_tag_observations`,
  `SOURCE_WEIGHT`, the naming pass, or CEFR resolution.
- (f) No brief content in logs.
- (g) Docs in the same change: the grader-context sections of `docs/tools/esl.md`,
  `docs/tools/writing.md` and `docs/tools/dictation.md`; a pointer from
  `docs/learner-model-design.md`; the learner-model paragraph in `docs/architecture.md`.

## 9. Decisions for the owner

1. **Split measurement from context** (§3): graders may receive earlier coach feedback, labelled
   as such, while measurement stays exactly as it is. *Recommendation: yes — this is the
   proposal.*
2. **Exclude saved translations from context.** *Recommendation: exclude; revisit only with an
   explicit per-item control.*
3. **Roll out Dictation → Writing → Reading, with Reading behind the anchoring gate** (§5), and
   run the gate against today's `persistent_issues` injection either way. *Recommendation: yes.*
4. **Stage 2 categories, as context-only data, after Stage 1.** *Recommendation: yes; a
   vocabulary chosen from observed categories rests on evidence, one chosen in advance does
   not.*
5. **The two design/code drifts in §1.3**: implement, or amend the design text.
   *Recommendation: amend `learner-model-design.md` §1 and §7 to describe the code as it is, and
   treat folding in Reading's `cefr_guess` as a measurement change needing its own evidence,
   since it moves the level the learner sees.*

## 10. Relationship to existing records

- `docs/learner-model-design.md` — §2's principle is kept intact; §1 and §7 have drifted from the
  code (§1.3).
- `docs/english-studio-ia-v2-design.md` — §0 names "an accumulated learner context" in the north
  star; §6.2 supplies the new-source mechanism the §5 fallback uses; §6.3 is Stage 3.
- ADR 0005 (single call), ADR 0006 (null level, applied here to prompts) and ADR 0007 (no session
  entity) all stand unchanged.
- `docs/exploration.md` — *An offline compute layer* is the generate side of the same corpus; this
  is its read side, and a contract it can reuse.
