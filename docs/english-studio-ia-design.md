# English Studio — Information Architecture

Status: **the independent work in §2's left column shipped 2026-07-21.**
The deferred right column still waits on the learner model.
The first draft proposed a browse-first structure centred on a shared material library.
The owner pushed back — learners navigate by *function* ("I want listening practice"), not
by material — and that reframing holds up, for a sharper reason than first stated: see §2.
§8 lists what is left to decide.

## 1. What prompted this

Three findings, one root cause.

**a. Dictation history looked broken.** It is not a code bug — a signed-in completion
creates the attempt and the rail renders it, verified locally. But **production has zero
dictation attempts, ever**, and the reason is a design gap: an attempt is only saved when
the learner finishes *every* sentence (`dictation.$passageId.tsx`, the `complete` intent
fires only on `isLast`). There is no partial save, no resume, and no warning. A passage is
8–12 sentences, so a learner who practises for five minutes and stops has produced
nothing — no history, no `passage_stats`, no feedback. The left rail is empty because the
product quietly discarded their work.

**b. The shell no longer matches the content.** The tool shell — a 260px left rail listing
your items — was modelled on Claude's chat UI, whose premise is *the user creates the
content, so navigation means returning to something I made*. That premise held for Speech,
Writing, and the original Reading. After the material layer, Dictation and Reading are
mostly about **choosing from material we prepared**, which is a different act needing
different information (difficulty, topic, whether I've practised it, how I did) and a
different shape (a filterable grid, not a chronological column).

**c. There is no product-level navigation.** The logo in every tool rail links to `/`
(`ToolNavRail.tsx`), the site home — not to English Studio. There is no way to move from
Dictation to Reading without leaving the product and coming back. The five modules share a
login, a design language, and now a material layer, but the UI presents them as five
separate apps.

The root cause is that each tool was built as *a place you enter and stay in*. English
Studio is a product whose modules share material and, soon, a learner model.

## 2. Why most of this should wait

Once the shared learner model and matching service exist, the primary flow is neither
function-first nor material-first browsing. It is **"open the app, the system says what to
practise next."** Browsing becomes the escape hatch for when the learner disagrees with the
recommendation.

That makes detailed browse IA the wrong thing to design now: it risks building a secondary
path as though it were the main surface. The first draft of this doc made exactly that
mistake, treating "choose a passage" as the core act — true only in a world with no
recommender.

**The question "how do learners find material" has no stable answer until the learner model
is designed.** So this doc now splits into work that is independent of it and work that is
not:

| Independent — shipped 2026-07-21 | Depends on the learner model — defer |
|---|---|
| ✅ Discarded-practice fix (§6) | Whether a shared library surface exists at all |
| ✅ Cross-module navigation (§5) | Whether `/english` becomes a workspace home |
| ✅ Dictation's shell, and Reading's index becoming a catalogue | What the "what should I practise now" surface is |
| ✅ Cross-mode handoff between dictation and reading (§3.1) | Where matching output lives |

Everything in the left column is repairing something already broken and is needed whatever
the eventual IA turns out to be. Everything in the right column resolves itself once the
learner model has a shape.

## 3. Principles

1. **English Studio is the frame; modules live inside it.** Moving between modules should
   not require exiting to a landing page.
2. **Whatever browsing exists is a surface, not a rail.** Hundreds of graded passages need
   filters and a grid; a 260px chronological column cannot do that job and gets worse with
   every passage added. This says how browsing should look *if* it is a significant path —
   §2 argues it may not be, once recommendations exist.
3. **Practice is focused.** While a learner is listening or recording, nothing should
   compete for attention. The rail is a distraction there, not context.
4. **History is a destination, not a rail.** Progress pages already exist for Reading and
   Writing; attempts belong there.
5. **Do not force one shell onto every module.** Writing and Translate have genuinely
   different content models (a prompt; no material at all) and should keep their shapes.

### 3.1 One passage, two modes — as a handoff, not a combined page

The material layer means a passage can be dictated *and* read aloud. The tempting
expression is a single page hosting both. It should not be: the interaction models are too
different — sentence-stepper plus typing versus continuous recording — and combining them
needs a mode switcher that serves neither well.

The value is real, but it pays off **at the transition**, not in a browser:

```
dictation summary → "You know the words now. Read it aloud?"  → reading
reading summary   → "Check how much you caught by ear?"        → dictation
```

That is also a genuine pedagogical sequence — listen, transcribe, then read aloud is
shadowing preparation — and it is far more useful than hoping a learner notices in a
catalogue that a passage supports both. It costs one link on each summary screen and
requires no IA change at all.

Material-layer capability should surface where it helps the learner, which is at the moment
of transition.

## 4. Structure

Routes that **proceed now**:

```
/dictation                catalogue index — already is one; drop the ill-fitting rail
/dictation/:passageId     focused session — no competing rail
/reading                  catalogue index (currently the composer)
/reading/new              paste your own text — moves off the /reading index
/reading/:passageId       focused practice — no competing rail
```

The change to Reading's index matters: today `/reading` *is* the new-passage composer, so
"reading home" means "create". That was right when the learner's own text was the only
material; it is wrong now that a graded library exists. Creating moves to `/reading/new`
and the index becomes a catalogue.

Routes that **wait for the learner model** (§2):

```
/english                  possibly a workspace home rather than a landing page
/english/library          possibly a shared material surface across modes
/english/progress         cross-module progress (roadmap Next)
```

The shared-library sketch from the first draft is kept below only as a record of what was
considered — **it is not the plan**. If a browse surface turns out to be warranted after the
learner model exists, a passage card would need to express both modes, since the `passages`
row already knows which it supports (`has_sentence_audio` for dictation; anything can be
read aloud):

```
┌──────────────────────────────────┐
│ A Normal Day              A2     │
│ daily routines · 11 sentences    │
│ Dictation 82%   Reading —        │
│ [ Dictate ]  [ Read aloud ]      │
└──────────────────────────────────┘
```

Unchanged either way: `/writing`, `/translate`, `/speech`. Their content models genuinely
differ — a prompt, no material at all, and user-generated audio respectively — and the
history rail still fits what they do.

## 5. Cross-module navigation — proceed now

The concrete fix for §1c:

- The tool rail's logo links to `/english`, not `/`. Reaching the site home stays possible
  from there, one level up.
- A persistent studio-level switcher — modules plus progress — so Dictation → Reading is
  one click. Whether that is a slim top bar, the top of the existing rail, or a compact
  launcher is a visual-design question, not an IA one.
- Breadcrumb intent throughout: `bcailab → English Studio → Dictation → A Normal Day`.
  The `handle.breadcrumb` convention already exists per route; it is simply not being used
  to express product membership.

## 6. Fixing the discarded-practice problem — proceed now, first

Independent of the IA work and worth doing regardless, because it is why the product
looked broken:

- **Save partial progress.** Either persist per-sentence results as they are checked, or
  keep session state in `localStorage` so a reload resumes. The former also feeds
  `passage_stats` and the learner model from abandoned sessions, which is real signal.
- **Or make sessions short enough to finish.** 8–12 sentences may simply be too long for
  one sitting; the seed constraint could drop to 5–6, or a session could be a *segment* of
  a passage.
- Either way, **tell the learner what is saved and when.** Right now nothing indicates
  that stopping early discards everything.

Recommendation: persist per-sentence, and revisit passage length separately with real
completion-rate data once attempts exist.

## 7. What this does not cover

- The **matching service** (learner → passage). This IA gives its output a home — "your
  next passage" belongs on `/english` — but the service itself is a separate iteration.
- The **unified progress centre**. Listed in roadmap Next. `/english/progress` is drawn
  above as a placeholder so the IA has somewhere to put it, not as scope here.
- **Visual design.** This is structure and routing only: no colours, spacing, or component
  design.

## 8. Decisions needed

1. **Confirm the split in §2.** Proceed with the independent work now; revisit the shared
   library, `/english` as workspace home, and the primary "what next" surface as part of
   designing the learner model rather than ahead of it.
2. **Partial progress (§6): persist per-sentence, or shorten sessions?** Recommendation:
   persist per-sentence, and revisit passage length separately once real completion-rate
   data exists — which it cannot today, precisely because nothing is saved.
3. **Order of the independent work.** Recommendation: the discarded-practice fix first,
   alone, since it is the only item actively losing learner work. Navigation and the
   dictation shell can follow together.
4. **Cross-mode handoff (§3.1)** — confirm the summary-screen link is the right expression
   of "one passage, two modes", rather than a combined practice page.
