# Reading Shell Refactor Plan

Implementation plan for moving Reading toward the shared shell model defined in `docs/tool-shell-pattern.md`, using Writing as the reference implementation where it improves structural clarity.

Date: 2026-03-19

## Goal

Bring Reading onto the same structural foundation as Writing without flattening the differences between the two products.

The target is:

- shared left-rail behaviour
- a true desktop detail workspace with `center stage + content column + right rail shell`
- explicit scroll ownership
- stable detail-page skeleton across compose and attempt-history states
- collapsible desktop right rail with the same `52px` collapsed width used by Writing

The target is **not**:

- moving evaluation content into the right rail
- making Reading visually identical to Writing
- forcing a fake “writing-like” workflow onto a recording tool

## Product Position

Reading is closer to Writing than Speech is, because it already has:

- an item rail on the left
- a detail route
- a right-side history function
- compose/history switching inside the same route

But Reading differs in one important way:

- the **main center content should remain the primary evaluation surface**

So the Writing shell model should be adopted at the frame level, not copied literally at the content-distribution level.

## Current Problems

### 1. Desktop detail layout is still an older two-column flex layout

Current structure in [`reading.$id.tsx`](/Users/star/Coding/bcailab/apps/web/app/routes/reading.$id.tsx#L368):

- `.esl-practice-layout`
- `.esl-center-panel`
- `EslReadingHistoryRail`

Current desktop CSS in [`global.css`](/Users/star/Coding/bcailab/apps/web/app/styles/global.css#L3027):

- row flex layout
- sticky-ish history rail
- no shell-owned divider
- no collapsed right rail state

This makes Reading feel like a page with an attached side list, not a deliberate shell.

### 2. Scroll ownership is fragmented

Current scroll ownership is split between:

- passage card
- detail card
- history list

That makes it harder to reason about the page and produces weaker shell boundaries than Writing.

### 3. Compose and detail do not share a stable enough skeleton

Compose state currently emphasizes recording with the passage shown above or inside a read-only card.

Attempt detail emphasizes:

- passage card
- evaluation card
- audio players
- retry state

These are related, but the page still changes shape more than necessary.

### 4. Right rail is not collapsible

Reading has a real right-side history/navigation function, so unlike Speech it should gain a proper right rail shell with desktop collapse support.

## Target State Model

Reading should adopt the same high-level detail state model used by Writing:

1. **Latest**
2. **History**
3. **Compose**

### Latest

- shows the latest attempt detail in the center content column
- right rail highlights the latest attempt

### History

- shows a selected historical attempt in the center content column
- right rail highlights that attempt
- header/banner indicates historical context and offers a way back to latest

### Compose

- reuses the same center-page skeleton
- shows persistent passage context
- shows recording composer in the main body area
- right rail remains the navigation rail and highlights `New Attempt`

## Target Desktop Structure

```text
reading detail workspace
├── center stage
│   └── reading content column
└── right rail shell
    └── attempt history rail
```

### Center Stage

Responsibilities:

- owns desktop detail-page scrolling
- receives all width that is not used by the right rail shell
- recenters the inner Reading content column

### Reading Content Column

Responsibilities:

- defines readable width
- contains the stable detail-page skeleton
- does not own the page scrollbar

### Right Rail Shell

Responsibilities:

- docked to the far right edge of the main area
- owns the vertical divider
- owns expanded/collapsed width
- contains the history rail content

## Content Distribution Rules

What stays in the center:

- passage context
- recording composer
- attempt detail
- audio players
- evaluation summary
- commentary, highlights, actions, retry states

What stays in the right rail:

- `New Attempt`
- latest-to-oldest attempt navigation
- attempt metadata needed for switching

What does **not** move into the right rail:

- the full evaluation payload
- major coaching content

That is the main difference from Writing.

## Stable Skeleton Proposal

Desktop detail pages should share this skeleton:

```text
reading-center-column
├── header
├── persistent passage context block
└── main state body
    ├── compose -> recorder workflow
    ├── latest -> latest attempt detail
    └── history -> selected attempt detail
```

### Persistent Passage Context Block

This is the Reading equivalent of Writing’s `Writing guide` / `Essay prompt` section.

It should appear in all three states:

- latest
- history
- compose

Recommended shape:

- passage label
- read-only passage text or a collapsible/condensed passage block
- recitation mode can still hide the passage body when appropriate, but the shell position should remain stable

The goal is not to show exactly the same passage body in every state. The goal is to keep the page mentally anchored in the same place.

## Right Rail Proposal

Reading’s right rail should move closer to Writing’s interaction model:

- `New Attempt` first
- latest attempt next
- older attempts after that
- newest to oldest ordering
- active item reflects compose/latest/history state

Desktop right rail behaviour:

- expanded width: Reading-specific, likely narrower than Writing’s feedback rail
- collapsed width: `52px`
- shell-owned divider
- independent scroll for long attempt lists

Unlike Writing, Reading does **not** need a feedback body below the rail navigation. The rail can remain mostly navigational.

## Scroll Ownership Proposal

### Desktop

- page scroll for detail route belongs to the **center stage**
- right rail list may scroll independently if long
- passage context block and attempt detail live inside the inner content column

### Why

This gives Reading the same shell clarity as Writing:

- scrollbar sits at the content/rail boundary
- center content stops pretending to be the page shell
- inner cards are free to be content, not layout containers

## Migration Phases

### Phase 1 — Shell Conversion

Scope:

- introduce Reading equivalents of:
  - detail workspace
  - center stage
  - content column
  - right rail shell
- move divider ownership to the rail shell
- keep current center content mostly intact

Files likely touched:

- [`reading.tsx`](/Users/star/Coding/bcailab/apps/web/app/routes/reading.tsx)
- [`reading.$id.tsx`](/Users/star/Coding/bcailab/apps/web/app/routes/reading.$id.tsx)
- [`global.css`](/Users/star/Coding/bcailab/apps/web/app/styles/global.css)
- [`EslReadingHistoryRail.tsx`](/Users/star/Coding/bcailab/apps/web/app/components/EslReadingHistoryRail.tsx)

Outcome:

- Reading detail page uses the same shell vocabulary as Writing
- no major information architecture change yet

### Phase 2 — Right Rail Normalization

Scope:

- add collapsible desktop right rail
- normalize collapsed width to `52px`
- reorder rail actions/navigation
- remove sticky rail assumptions

Outcome:

- Reading gains a shell-owned history rail instead of an attached side list

### Phase 3 — State Skeleton Stabilization

Scope:

- define stable header + passage context block
- make compose/latest/history reuse the same top structure
- reduce layout jumps between composer and attempt detail

Outcome:

- Reading behaves more like a coherent workspace and less like separate subpages stitched together

### Phase 4 — Scroll Ownership Cleanup

Scope:

- move route-level vertical scrolling to center stage
- simplify inner card overflow rules
- ensure right rail scroll is independent

Outcome:

- Reading gets the same shell-level scroll clarity as Writing

## Proposed File Strategy

### Keep

- [`ReadingNavRail.tsx`](/Users/star/Coding/bcailab/apps/web/app/components/ReadingNavRail.tsx)
- [`ToolNavRail.tsx`](/Users/star/Coding/bcailab/apps/web/app/components/ToolNavRail.tsx)
- [`EslAttemptComposer.tsx`](/Users/star/Coding/bcailab/apps/web/app/components/EslAttemptComposer.tsx) as the recording workflow primitive

### Refactor

- [`EslReadingHistoryRail.tsx`](/Users/star/Coding/bcailab/apps/web/app/components/EslReadingHistoryRail.tsx)
  - from old history side list
  - into a shell-aware right rail component with collapse support

- [`reading.$id.tsx`](/Users/star/Coding/bcailab/apps/web/app/routes/reading.$id.tsx)
  - from page-specific flex composition
  - into explicit shell layers

### Reuse from Writing Conceptually

- route-owned right-rail collapsed state
- shell-owned divider
- docked right rail
- center-stage scroll ownership

### Do Not Reuse Literally

- feedback-in-rail pattern
- Writing-specific wording or version labels

## Risk Notes

### Low Risk

- shell conversion without changing core content
- right rail collapse
- divider ownership

### Medium Risk

- moving scroll ownership up a layer
- stabilizing compose/detail skeleton without breaking recording ergonomics

### Main UX Risk

If the persistent passage context block is designed poorly, compose mode may feel heavier than it does today.

Mitigation:

- keep the passage block compact by default
- allow the passage text to be visually condensed or collapsed
- do not make the center column feel like a long reading page before the user gets to the recorder

## Recommended Next Implementation Step

Start with **Phase 1 + Phase 2 together**:

- convert Reading detail to a true right-rail shell
- add rail collapse
- normalize right collapsed width to `52px`

Do **not** start with Phase 3 or Phase 4 first. The shell must be correct before inner-state cleanup.
