# Tool Shell Audit

Audit of current tool layouts against the shared shell model in `docs/tool-shell-pattern.md`.

Date: 2026-03-19

Reference implementation: **Writing**

## Purpose

This document answers one question:

Which existing tools should move toward the Writing-style shell and detail-page model, and how far should that convergence go?

The goal is not to force visual sameness across all tools. The goal is to reuse the parts of Writing that encode the product philosophy well:

- stable page skeletons
- explicit shell ownership
- clear scroll ownership
- consistent collapsed rail behaviour
- readable center content that does not greedily expand

## Audit Criteria

Each tool is evaluated on:

1. **Left rail convergence**: whether it already uses the shared nav-rail model
2. **Center canvas structure**: whether the main area has a clear canvas/stage/content-column hierarchy
3. **Right rail role**: whether there is a genuine need for a docked right rail shell
4. **Detail state stability**: whether major route modes share a stable skeleton
5. **Scroll ownership**: whether the scrollbar belongs to the right shell layer
6. **Migration value**: whether adopting the Writing model would materially improve UX and maintainability

## Summary

| Tool | Fit With Writing Shell | Recommendation | Priority |
|------|------------------------|----------------|----------|
| Reading | High | Adopt the shell/detail workspace model in stages | High |
| Speech | Partial | Reuse shell principles only; do not force full Writing detail workspace yet | Medium-Low |

## Reading

### Current Fit

Reading is the strongest candidate for convergence after Writing.

It already shares the same high-level information architecture:

- persistent left rail of user-owned items
- center workspace for the active item
- separate history rail on the right
- compose/history switching inside the same detail route

### What Already Aligns Well

- Left rail already uses the shared `ToolNavRail` abstraction
- The layout route already uses the Writing shell primitives (`writing-shell`, `writing-main`) instead of a separate bespoke shell
- The right side already has a strong “primary action + history” role through `New Attempt` and the attempt list
- Compose and history both live on `/reading/:id`, so the product model is already structurally close to Writing

### Main Gaps

#### 1. Detail workspace is still an older flex + sticky rail model

Desktop Reading currently uses:

- a center panel
- a separate history rail with sticky behaviour
- a classic `gap`-based two-column layout

This is weaker than Writing’s shell model because the right side is not treated as a true rail shell with explicit divider and collapse ownership.

#### 2. No explicit center-stage / content-column split

Reading has a center panel, but not the full Writing-style distinction between:

- available stage width
- readable inner content width

As a result, it is harder to reason about content measure and future right-rail behaviour.

#### 3. Scroll ownership is fragmented

Reading currently spreads scrolling across multiple layers:

- passage card
- detail card
- history list

This is workable, but it is not as legible as Writing’s “center stage owns page scrolling; rail owns rail scrolling” rule.

#### 4. Detail-state skeleton is only partially stable

Compose and attempt detail are related, but not yet as structurally stable as Writing:

- compose focuses on recording and passage review
- detail focuses on evaluation, audio players, and commentary

The skeleton is not totally inconsistent, but it is less disciplined than Writing’s `Latest / History / Compose` model.

#### 5. Right rail is not collapsible

This is the biggest shell-level feature gap relative to Writing.

Because Reading has a real right-side history function, it should probably gain:

- a shell-owned right divider
- a collapsed desktop width
- clearer right-rail ownership rules

### Recommendation

Reading should adopt the Writing shell model, but not by copying Writing literally.

What should be adopted:

- full `center stage + content column + right rail shell` structure
- shell-owned right divider
- right rail collapse support
- collapsed right width normalized to `52px`
- clearer scroll ownership
- more stable compose/history skeleton

What should **not** be copied literally:

- feedback living in the right rail
- Writing’s version-pill navigation style as-is

Reading’s evaluation content is still better suited to the center workspace. The right rail should stay a history/navigation rail, not become a feedback column.

### Suggested Migration Order

1. Replace the current desktop detail flex/sticky model with a true right rail shell
2. Normalize scroll ownership
3. Add right-rail collapse
4. Stabilize compose/detail skeletons around a more persistent passage context
5. Revisit the visual hierarchy of `New Attempt` and the attempt switcher

### Verdict

**Highest-priority adopter.**

Reading already has the right information architecture; it mainly needs shell discipline.

Detailed implementation plan: `docs/reading-shell-refactor-plan.md`

## Speech

### Current Fit

Speech is a weaker candidate for full Writing-style adoption.

It already shares some shell-level decisions with Writing:

- left rail uses `ToolNavRail`
- authenticated full-page tool experience
- user-owned history listed persistently in the rail

But its primary workflow is different:

- there is no separate detail route
- there is no real right-side context rail
- the main surface is a utility workspace, not a revision/history workspace

### What Already Aligns Well

- Left rail convergence is already strong
- The tool is already conceived as a full-page shell, not a loose card dropped into a generic page
- The selected record model (`?record=...`) provides a lightweight “detail state” without forcing route sprawl

### Main Gaps

#### 1. No canvas/stage vocabulary in the center area

Speech currently renders its main workspace more directly. It does not yet express the same structural layering as Writing:

- canvas
- center stage
- narrower content area

#### 2. No right rail role

This is not a bug. It is the main reason not to force the full Writing detail pattern onto Speech.

Speech history already lives in the left rail. A second rail would currently duplicate information architecture rather than clarify it.

#### 3. Mode switching is intentionally more asymmetric

Speech has two major center states:

- generate form
- selected record detail

These do not need the same level of stable “same skeleton, different mode” behaviour that Writing benefits from.

### Recommendation

Speech should adopt **shared shell principles**, not the full Writing detail workspace.

What should be reused:

- left rail conventions
- consistent collapsed rail behaviour
- explicit canvas/content-width thinking where useful
- explicit scroll ownership

What should **not** be forced:

- a Writing-style right rail shell
- a version/history rail on the right
- a fake `Latest / History / Compose` state model

Speech is better treated as a **viewport-filling single-workspace tool with left-rail history**, not as a three-surface detail tool.

### Suggested Migration Order

1. Keep the current left-rail convergence
2. Audit whether the center workspace should gain a clearer canvas/stage wrapper
3. Tighten scroll ownership in the main content stack if needed
4. Revisit only if Speech later gains richer per-record context, comparison, or metadata workflows

### Verdict

**Partial adopter only.**

Reuse the shell language, not the full Writing detail geometry.

## Practical Next Step

If the team wants the highest-value follow-up implementation work, it should be:

1. **Reading shell audit -> implementation**
2. **Speech shell cleanup only if clear UX friction is found**

In other words:

- **Reading should move toward Writing**
- **Speech should borrow from Writing selectively**
