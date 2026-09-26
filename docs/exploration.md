# Exploration

Ideas the owner is considering. **Nothing here is authorized work.**

An item on this page has no acceptance criteria, no priority, and no commitment attached. It
is recorded so it is not forgotten, not so it can be picked up. Moving something from here
into `docs/roadmap.md` is the owner's decision alone — an agent that finds an item here
attractive should propose it, not start it.

Split out of `docs/roadmap.md` on 2026-08-01; entries moved verbatim.

## Under consideration

Recorded 2026-07-21 so they are not forgotten — none are urgent.


- **English Studio UX follow-ups** — Writing material-led home/prompt bank, Translate long-input
  growth, Dictation session navigation and cues, shared return-link placement, Reading's
  personal-text affordance, and a Speech compose-height investigation. Recorded 2026-07-30 in
  `docs/ux-follow-ups-2026-07-30.md`; this is a discussion record, not a commitment or ordering.
- Homepage redesign. **Partly settled 2026-08-27**: the owner decided the product hierarchy —
  English Studio is the flagship and, until it has a domain of its own, `bcailab.com` is where a
  visitor meets it; Mapdown is a side project, Posts is internal, and VanMemo has its own site.
  The page was rebuilt around that (see `docs/changelog.md`). What remains open here is the
  visual redesign itself, not the hierarchy.
- Overall visual language pass across the studio.
- An admin/back-office system for **content** (material-library management currently happens
  through `scripts/material-seed/` and raw SQL). Deferred while there are no real users and no
  non-engineer operator — a back-office UI is pure liability until then. Note this is a
  *separate* need from model routing hot-config (see Later in `docs/roadmap.md`), which does **not** require
  an admin system and has an earlier trigger. Owner view 2026-07-21.

- **Mapdown — expand/collapse motion** (owner-raised 2026-08-26, *deliberately not committed*).
  Every structural change is currently a jump cut: the stylesheet carries three `transition`
  rules in total. Collapsing a branch should move the nodes that stayed, fade the ones that left
  toward their parent, and grow the ones that arrived out of it. The architecture favours this —
  `layout()` is pure and runs outside React, so a transition interpolates between two
  already-computed layouts rather than re-running layout per frame. Two things make it real work
  rather than a CSS one-liner: nodes render at absolute coordinates (`<rect x={box.x}>`) instead
  of inside a `translate()` group, so movement cannot be handed to a CSS transition without
  restructuring the node; and connector paths cannot be transitioned by CSS at all, so their
  control points have to be interpolated alongside or the lines snap while the nodes glide. The
  genuinely fiddly part is enter/exit bookkeeping — a removed node has to stay mounted until its
  exit finishes. Constraints any attempt must keep: `prefers-reduced-motion` disables it, and the
  500/2000-node benchmark is re-run afterwards, because this repo protects typing responsiveness
  at 500 nodes and animation adds per-frame work.

- **Mapdown — canvas feel at scale** (owner-raised 2026-08-26 as "not smooth enough", *not
  diagnosed*). Worth recording that the input mapping is already the standard one: `MapCanvas`
  treats ctrl/meta-wheel as zoom about the pointer and a plain wheel as pan, which is what a
  trackpad pinch and a two-finger drag produce. So the complaint is probably **not** input
  mapping. Three candidates, in the order they should be tested: the absence of motion entirely
  (see the entry above), node re-rendering during viewport-only changes, and discrete rather than
  continuous zoom steps. Deliberately left unmeasured — if motion turns out to be the cause, the
  other two are optimisations for a problem nobody has. Measure before committing to any of it.

- **Motion polish from the 2026-09-20 animation audit** (external agent, using the
  `emil-design-eng` / `improve-animations` skills; *not committed*). The audit's real defects —
  the mobile nav drawer that never animated, and Web's reduced-motion gaps on the Reading/Writing
  side panels and the looping state indicators — were fixed as bugs (see `docs/changelog.md`).
  What remains is taste and performance, with severities re-checked against the code:
  - Web layout animations (`grid-template-columns`, `width`, `padding` on the Reading/Writing
    side panels) re-lay out every frame; transform/opacity would not. Medium, performance only.
  - The looping pulses animate `box-shadow`, which repaints; a pseudo-element with
    `transform`/`opacity` would not. Low.
  - Every Web `.btn` lifts on hover but has no press feedback; the audit suggests dropping the lift
    and adding a short `scale(0.97)` press. Taste.
  - Mapdown's toolbar popovers play a 120 ms entry keyframe, including when opened by keyboard.
    The audit rated this HIGH; re-checked as **low** — input is not blocked, and reduced motion
    already removes it.
  - Mapdown's reduced-motion rule flattens every transition, colour included. It satisfies the
    accepted canvas-first criterion (d); keeping non-spatial feedback would be a refinement.
  - Mapdown buttons jump `translateY(1px)` on press with no easing. Taste.
  - Web and Mapdown each hand-roll durations and easings; shared duration/easing tokens would span
    both products and count as a broad refactor under `AGENTS.md`.
  - Opportunities rather than defects: a scale/fade origin for the avatar menu, and a fade plus
    `scale(0.97)` for the delete confirmation dialog.

- **Mapdown — document library, account save, and publish** (owner-raised 2026-08-18). Three
  independently shippable stages: a local, no-account document library (`spec/phases.md` §7);
  explicit per-document cloud save behind a Mapdown-owned backend on `map.bcailab.com`; and
  frozen-snapshot publishing to a separate host (§8). Design, draft acceptance criteria and the
  five decisions it would create are in
  [`docs/mapdown/save-publish-proposal.md`](mapdown/save-publish-proposal.md). This exploration
  was subsequently authorized in `docs/roadmap.md`; all three implementations are `in_review`.

- **Promote the session/planning layer — "Today"** (owner-raised 2026-08-26 after an external
  AI review of wondering.app; *proposal only, not authorized*). The outside argument was that
  English Studio reads as a collection of tools where the learner must choose the tool, and that
  the shared learner profile should become the main character: one **Today** queue that decides
  what to practise, fed by every mode and by spaced repetition. The direction is not new to this
  repo — Later's Dictation v2 entry already says the session / goal-first layer is the next
  tenant on the `selectStarterPractice()` seam, and ADR 0006 already forbids the two ways a
  naive scheduler goes wrong (rendering a null level as B1; locking material by band). So the
  advice is a **prioritisation argument**, not a new direction, and it should be judged on
  whether its three prerequisites hold. Today none of them do:
  1. **The profile is blind in two of four skills.** Writing contributes only counters because it
     has no tag vocabulary (Next), and Dictation passes `practiceSeconds: 0` because nothing
     times an attempt (Next, authorized 2026-08-12; in_review 2026-09-18). A queue built now would
     schedule on half the evidence while presenting itself as informed.
  2. **Material is too thin to schedule over.** Ten passages per band, against a design
     assumption of roughly 500. A Today queue over that repeats within days, and a visibly
     repetitive queue is worse than no queue: it teaches the learner that the personalisation
     is decorative.
  3. **There are no real users.** A learner model's value is longitudinal. Calibrating a
     recommendation policy before anyone has a history is speculation, whereas making the
     existing profile honest and legible on `/english/progress` is not.
  One internal contradiction in the outside advice is worth recording, because it points at the
  more interesting item: it argues that the tool surface is already large enough, while treating
  the **encounter → understand → remember → produce** loop (a word met in a podcast or article,
  explained without breaking flow, then resurfacing as tomorrow's practice) as the most
  defensible thing bcailab could build. That loop's input is the Dictionary/lookup surface,
  which does not exist. Such a surface would also be the only entry point that produces learning
  objects in volume **without** first requiring a 100× material expansion.
  Suggested order if this is ever promoted, each step independently useful: (a) an enrolment
  unit, which needs no measurement at all — see the entry below, added later and ordered
  *before* this list rather than inside it; (b) close the two measurement gaps already in Next,
  so the profile covers what the learner actually does; (c) decide whether a lookup/encounter
  entry point becomes the learning-object source; (d) only then a bounded Today over the
  existing seam. Today is the *result* of those, not a substitute for them. Nothing here has
  acceptance criteria; promotion is the owner's call.

- **An enrolment unit — a collection you can *start*, not only browse** (owner-raised
  2026-08-27 after reading wondering.app's explore and course surfaces; *proposal only, not
  authorized*). This is a **correction to the ordering in the entry above**: that entry folded
  everything into "Today" and made it wait on the two measurement gaps. An enrolment unit is a
  smaller, separate thing, and it waits on nothing — the learner model does not have to be
  accurate for it to work.

  What the observed product actually does, with the visuals stripped off: everything hangs from
  *"I chose this course."* The progress fraction (`0/5 lessons`), the status (`Not started`),
  what comes next, the review queue, and a structural map of the whole thing all have a home
  because that container exists. English Studio has no such container. `/writing` is a
  catalogue, `/reading` is a catalogue grouped by band, and the learner picks one item at a
  time forever — so progress can only be a global counter, "next" can only be computed fresh by
  the recommender, and repetition has nowhere to live. bcailab already has the raw grouping:
  Writing's General / Task 1 / Task 2 collections and Reading's four band groups. Today they can
  only be *browsed*. Letting one be *started* is the smallest version of this idea.

  **Sequential unlock is a separate question, and mostly a "no" here.** It does not conflict
  with ADR 0006 — that forbids gating *material discovery* by measured band, whereas the
  observed lock is an ordering constraint *inside a collection the learner already chose*, and
  says "in order", not "not good enough". The real blocker is material, not policy: that
  product **generates** its courses, so the lesson order is authored; bcailab's ten passages per
  band (roadmap figure; the local dev database still holds the pre-expansion five) have no
  dependency order at all. Ordering them would mean inventing a teaching sequence the material
  does not contain. So "a collection can be started" is available now; "a collection unlocks in
  order" needs a reason first.

  **One cheap adjacency worth remembering:** the observed course map is a root → sections →
  lessons mind map with a status panel beside it. Mapdown already renders exactly that shape,
  with themes, export and publishing. If a collection ever wants a structural view, that is the
  only capability in this repository that is already built and has never been used by English
  Studio. Not a reason to do it now — a reason it would be cheap later.

  **Three things deliberately not to borrow.**
  1. *The streak/XP/freeze/friend-streak layer.* Retention machinery presupposes an existing
     daily habit and a social graph. With no users it is stage scenery, and worse, it looks like
     product progress while being none.
  2. *A user-generated course library.* That product answers thin material by letting anyone
     generate — 99 courses in one category, whole courses credited to individual accounts. It is
     the direct opposite of this repository's material model, where 48 prompts went through
     deterministic validation, content review, owner approval and a recorded batch hash. Copying
     the browse surface quietly assumes a supply strategy that does not exist here; decide the
     supply question before the grid.
  3. *Lesson-length personalisation (3 / 5 / 10 minutes).* That is a generation-budget dial.
     bcailab's material is a fixed asset and has no such dial. The **learning goal** and
     **current background** fields in the same dialog are the part worth noting: they are the
     *declared* half of a learner profile, and this repository currently has only the *observed*
     half.

  Nothing here has acceptance criteria. Promotion is the owner's call.

- **An offline compute layer, not request-path agent-ification** (owner-agreed framing
  2026-08-27; *proposal only, not authorized*). Raised as "the AI use is still single-call, not
  agentic, and user-generated context is not being used". The second half of that sentence is
  the real finding; the first half names the wrong target, and the distinction is worth keeping
  because acting on the wrong half is expensive.

  **Single-call is not a deficiency here, and this entry is not a reason to revisit
  [ADR 0005](decisions/0005-reading-grader-stays-single-call.md).** That record measured the
  Reading grader's variance and *declined* the deterministic multi-step rebuild — evidence-based
  restraint, and still correct. An agent loop buys two things: tool calls against real external
  state, and iteration against a checkable criterion. Grading a hundred-word essay has neither —
  there is nothing to look up, and the rubric is not machine-verifiable. Adding a loop on the
  request path buys latency, variance and untestability, not capability.

  **What is actually missing is a place for work to happen outside a request.** Every model call
  in this repository is request-scoped: a learner clicks, one call runs, the result lands in D1,
  and nothing further ever reads it as evidence. The only background job that exists is
  `workers/session-cleanup`, a single daily cron. There is no queue, no workflow, no scheduled
  job that thinks about a learner between visits.

  **The wasted asset is the per-learner corpus.** Reading attempts carry ASR output and
  structured evaluations; Dictation carries per-sentence scores; Writing carries multi-round
  feedback JSON; Translate carries source/result pairs. Today that entire corpus feeds counters
  plus some `learner_tag_observations` rows that `SOURCE_WEIGHT` deliberately discounts. The
  highest-leverage AI work in this product is not a cleverer evaluator — it is turning that
  corpus into *the next item*: three misuses of a modal in last week's writing becoming
  tomorrow's listening discrimination, cloze, and spoken rewrite. That is the same
  **encounter → understand → remember → produce** loop the wondering.app entry above identifies,
  seen from the supply side.

  **This needs a job runner, not a harness.** The primitives are already in this stack's world
  and one of them is already proven here (D1 plus a Cron Trigger); Queues and Workflows are the
  same mental model. No bespoke education agent framework is required — the hard parts of
  education are "what does this evidence mean" and "what should the next item be", which are
  measurement and content problems, not runtime ones. Anything built here stays off the request
  path, so a failed or slow job degrades tomorrow's practice, never today's page.

  **Ordering, deliberately not first.** This ranks *after* an enrolment unit (which waits on
  nothing) and *after* the two measurement gaps in Next, for a blunt reason: a per-learner corpus
  over roughly zero learners is roughly zero corpus, and a job that generates items from evidence
  needs the evidence to cover more than half the modes. Building the runner before either would
  be infrastructure with nothing true to compute.

  Nothing here has acceptance criteria. Promotion is the owner's call.

- **Cross-mode learner context for graders** (owner-raised 2026-09-14; **authorized
  2026-09-15**, see the end of this entry). Raised as "learning records are under-used, there is
  no context engineering, and each exercise's grader data stays isolated". Verified in code, and
  more specific than it sounds: every grader remembers one passage, one Writing session, or
  nothing; Writing's feedback never reaches the shared learner layer; and the only cross-mode
  input any grader receives is at most eight short profile phrases on the Reading evaluator.

  The proposal's central move is to separate **grader context** — derived per call, allowed to
  carry earlier coach feedback labelled as such, needing no vocabulary — from **measurement**,
  which it leaves untouched. That lets Writing's feedback inform other graders without waiting
  on the vocabulary Writing's entry into the profile still needs. Rollout follows contamination
  risk: Dictation feedback, then Writing, then Reading behind an anchoring spike, because Reading
  is the one grader whose output becomes observations. Two design/code drifts and one prompt
  mislabel found on the way are recorded there too.

  It waits on neither the two measurement gaps nor a job runner, and it is the read side of the
  corpus the offline compute layer above would generate from. Design:
  [`docs/learner-context-proposal.md`](learner-context-proposal.md).

  **Authorized 2026-09-15.** The owner confirmed all five decisions as recommended. Stage 1 is
  *Now — Learner context for graders* and Stage 2 is a Next item in `docs/roadmap.md`; the split
  itself is [ADR 0010](decisions/0010-grader-context-is-separate-from-measurement.md). This entry
  remains as the record of how the idea arrived, not as the plan.

- **Close the practice loop — from "understood the correction" to "can use it days later"**
  (owner discussion 2026-09-24, merging an in-repo review with an external AI review; *proposal
  only, not authorized*).
  **Update 2026-09-25:** item 1 is authorized as the first Next item in `docs/roadmap.md`,
  item 2 is queued behind it there, and item 3 still waits on Stage 2. Items 3 and 4 remain
  proposals.
  中文摘要：English Studio 的专项练习基础不错，但缺"理解 → 自己表达 → 隔几天还能用出来"这条链。
  建议顺序：① Writing 反馈后的当场针对练习；② 听/读后复述 + 一次追问（先打字，后录音）；
  ③ 隔几天换题复查（依赖 Stage 2 分类）；④ Translate 里"练会这个表达"。验收看延迟后在新内容上的表现，
  不看 AI 分数、轮数或打卡。

  **Diagnosis.** Mapped against Nation's four strands (meaning-focused input, meaning-focused
  output, language-focused learning, fluency development), the studio invests mostly in formal
  accuracy: Dictation scores word-level perception, Reading scores read-aloud pronunciation, and
  Writing corrects form across revisions. Three things are thin or missing:
  1. **Comprehension.** "Reading" evaluates reading aloud; nothing checks whether a passage was
     understood. Dictation checks that words were heard, not that a paragraph was followed.
  2. **Spontaneous production.** Every spoken task is scripted (read aloud or recite). Nothing
     asks the learner to organise their own sentences, clarify, or respond.
  3. **Delayed retrieval.** Errors are recorded and — under the learner-context work — shown to
     graders, but none returns to the learner as something to produce again. Reading-aloud
     fluency is not spontaneous speech, and dictation accuracy is not comprehension.

  **Candidates, in suggested order.** Each is independently useful.

  1. **Targeted practice after Writing feedback — same-sitting part only.** After a feedback
     round, the learner may pick one annotated issue and (a) fix the original sentence, then
     (b) express the same point in one model-generated new context (e.g. *since three years* →
     "she has worked at this company for six months"). The model generates the variant and judges
     whether the answer is acceptable; many correct answers must pass. Every item stays bound to
     its source sentence, is skippable, and offers "this correction was wrong". It waits on
     nothing: it needs no category vocabulary, no scheduler and no measurement change. Writing
     goes first because it has the richest error evidence and the most complete loop today;
     dictation misses (deterministic, already in `sentence_results`) are a natural second source.
  2. **Retell after listening or reading, plus one follow-up question.** Reuse existing passages
     and audio: hear or read → text hidden → retell in one's own words (30–60 s) → the model asks
     one follow-up grounded in the answer → retell again. Scored on *meaning*, not wording: were
     the key points and relations understood, would a listener follow it, and the single most
     useful fix. It needs its own meaning-based rubric; the read-aloud rubric does not transfer.
     Two risks to design around:
     - **ASR contaminates the judgement.** A non-native recording is transcribed before it is
       judged, so a recognition error can read as a comprehension error. Ship a **typed retell
       first**: it validates the meaning rubric without ASR, and also serves learners who cannot
       use a microphone. Add recording once the typed rubric is shown to be stable.
     - **Feedback, not measurement.** Under
       [ADR 0010](decisions/0010-grader-context-is-separate-from-measurement.md) the retell grader
       writes no `learner_tag_observations` until variance evidence exists, the same bar Reading
       had to clear.
  3. **Delayed re-check on new content.** Days later, test the same point with different content.
     This is the step that carries the learning value, and it has a hidden dependency: to know
     two errors are "the same point", feedback needs a closed category list. That is exactly
     roadmap Next's *Learner context Stage 2 — structured feedback categories*. Matching on the
     model's free-text issue names would be unreliable, so this step waits for Stage 2. A simple
     rule-based interval is enough at first; spaced practice has solid L2 evidence (Kim & Webb
     2022 meta-analysis, 48 experiments), but that does not make any fixed interval optimal. One
     AI judgement must never be promoted to "the learner cannot do X".
  4. **Translate → "practise this expression".** After a translation, the learner may choose to
     practise a phrase or pattern from it (e.g. *I'd like to confirm…*): see its use, produce it
     with the result hidden, then reuse it in a new situation. Focus on transferable chunks and
     patterns, not auto-extracted word lists. Only what the learner explicitly selects enters any
     record, consistent with roadmap decision D2 that saved translations stay out of grader
     context.

  **Deliberately later.** Goal-oriented scenario dialogue (e.g. rescheduling a clinic
  appointment, where the model plays the receptionist and adds one realistic constraint) fits
  ESL needs well, and CEFR describes interaction as its own activity. But turn count, latency and
  evaluation quality make it the most expensive item, and push-to-talk rounds of 4–6 turns would
  be the only sensible first version. Tap-to-look-up in context is useful input support but
  secondary to phrase practice. Streaks and XP remain excluded for the reasons in the enrolment
  entry above.

  **How to judge any of these.** The metric is **delayed performance on new content** — whether
  the learner uses the point correctly days later, in a sentence they have not seen — not AI score
  gains, turn counts, or streaks. The benefits above are hypotheses for product experiments: the
  research supports the learning mechanisms, not the effectiveness of any particular AI feature.

  Relationship to other entries: this is the learner-facing half of the
  **encounter → understand → remember → produce** loop the "Today" and offline-compute entries
  describe. Items 1, 2 and 4 need neither the job runner nor a Today queue; item 3 is the first
  real tenant either would have.

  Nothing here has acceptance criteria. Promotion is the owner's call.
