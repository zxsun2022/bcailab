# English Studio — Information Architecture

Status: **draft for owner review, not approved, nothing implemented.**
§7 lists the decisions needed before any of this is built.

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

## 2. Principles

1. **English Studio is the frame; modules live inside it.** Moving between modules should
   not require exiting to a landing page.
2. **Browsing material is a surface, not a rail.** Hundreds of graded passages need
   filters and a grid. A 260px chronological column cannot do that job, and will get worse
   with every passage we add.
3. **Practice is focused.** While a learner is listening or recording, nothing should
   compete for attention. The rail is a distraction there, not context.
4. **History is a destination, not a rail.** Progress pages already exist for Reading and
   Writing; attempts belong there.
5. **Do not force one shell onto every module.** Writing and Translate have genuinely
   different content models (a prompt; no material at all) and should keep their shapes.

## 3. Proposed structure

```
/                         site home — studio, product cards            (unchanged)
/english                  English Studio home — continue, modules, progress
/english/library          shared material browse: filters, grid, progress per item
/dictation/:passageId     focused dictation session
/reading/:passageId       focused reading practice
/reading/new              paste your own text                (moves off the /reading index)
/english/progress         cross-module progress              (later; see §6)
/writing, /translate, /speech      unchanged shells
```

**`/english` becomes a workspace home rather than a marketing page** for signed-in users:
what to continue, the modules, a link to progress. Anonymous visitors keep the current
landing content.

**`/english/library` is the material surface** shared by Dictation and Reading, which is
what the unified `passages` table already is underneath. A passage row knows which modes it
supports (`has_sentence_audio` for dictation; every passage can be read aloud), so the
library shows both affordances on one card and the learner picks:

```
┌──────────────────────────────────┐
│ A Normal Day              A2     │
│ daily routines · 11 sentences    │
│ Dictation 82%   Reading —        │
│ [ Dictate ]  [ Read aloud ]      │
└──────────────────────────────────┘
```

Filters: band, topic, mode, and practised/unpractised. A **mode filter** matters — a
learner who thinks "I want listening practice" should not have to browse a mixed library
and remember to pick the right button.

**Your own texts** become a section or filter of the library rather than the primary axis,
since they are now the secondary case.

**Practice views lose the rail.** A back link to the library, the passage, the controls.
Nothing else.

## 4. Cross-module navigation

The concrete fix for §1c:

- The tool rail's logo links to `/english`, not `/`. Reaching the site home stays possible
  from there, one level up.
- A persistent studio-level switcher — modules plus progress — so Dictation → Reading is
  one click. Whether that is a slim top bar, the top of the existing rail, or a compact
  launcher is a visual-design question, not an IA one.
- Breadcrumb intent throughout: `bcailab → English Studio → Dictation → A Normal Day`.
  The `handle.breadcrumb` convention already exists per route; it is simply not being used
  to express product membership.

## 5. Fixing the discarded-practice problem

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

## 6. What this does not cover

- The **matching service** (learner → passage). This IA gives its output a home — "your
  next passage" belongs on `/english` — but the service itself is a separate iteration.
- The **unified progress centre**. Listed in roadmap Next. `/english/progress` is drawn
  above as a placeholder so the IA has somewhere to put it, not as scope here.
- **Visual design.** This is structure and routing only: no colours, spacing, or component
  design.

## 7. Decisions needed

1. **Scope: unified library, or per-tool catalogues?** This doc proposes one
   `/english/library` shared by Dictation and Reading, because that is what the data model
   already is and it removes the "same material behind two doors" split. The cheaper
   alternative is to leave each tool its own catalogue and only fix the rail and
   navigation. Unified is more work now and more coherent later — and it is where the
   matching service will want to live.
2. **Does `/english` change for signed-in users?** Turning a landing page into a workspace
   home is the piece most likely to affect acquisition; it can also be deferred, leaving
   `/english` as-is and putting "continue" on the library.
3. **Partial progress (§5): persist per-sentence, or shorten sessions?** Or both. This is
   independent of the IA change and could ship first.
4. **Staging.** Recommended: build `/english/library` alongside the existing tool
   indexes, prove it, then redirect the tool indexes into it — so nothing breaks while the
   new structure is validated. Confirm that is acceptable versus a single cutover.
