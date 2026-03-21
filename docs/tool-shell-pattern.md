# Tool Shell Pattern

Shared layout and interaction pattern for authenticated bcailab tools with a navigation rail, a main workspace, and an optional right-side detail rail.

This pattern is based on the current **Writing** implementation, which is the most mature version so far. It reflects the product direction validated through repeated UI iteration and should be treated as the reference model when similar tool pages are built or refactored.

## Status

- **Reference implementation**: Writing (`/writing`, `/writing/:id`)
- **Primary source for shared behaviour**: this document
- **Writing-specific product details**: `docs/tools/writing.md`
- **Low-level CSS pitfalls and centering rules**: `docs/css-layout-conventions.md`
- **Current cross-tool adoption audit**: `docs/tool-shell-audit.md`

## Philosophy

The shell should feel structural, not improvised.

- **Stable skeleton over mode switching.** Changing between latest/history/compose should not rebuild the whole page mentally for the user.
- **Rails belong to the shell, not to content cards.** Dividers, collapse widths, and docking behaviour are properties of the page frame.
- **Readable content should not greedily fill leftover space.** The center stage may grow or shrink, but the actual article/content column keeps its own reading width logic.
- **Primary actions should sit inside the navigation logic, not outside it.** If the right rail governs version/attempt navigation, the primary “new round” action belongs there as the first item.
- **Scroll ownership must be explicit.** The user should feel where the page scrolls from. Scrollbars should sit on shell boundaries, not appear to belong to arbitrary inner cards.

## Shared Vocabulary

- **Tool shell**: the full-page authenticated workspace for a tool.
- **Left rail**: persistent tool navigation and item list.
- **Main area**: everything to the right of the left rail.
- **Canvas**: the centered workspace wrapper used by the tool inside the main area.
- **Detail workspace**: the desktop two-track structure used by detail pages.
- **Center stage**: the left track of the detail workspace; owns content-area scrolling.
- **Article column**: the narrower readable column inside the center stage.
- **Right rail shell**: the right track of the detail workspace; owns the divider and docking.

## Canonical Structure

### Shell

```text
tool-shell
├── left rail
└── main area
    └── canvas
        └── route content
```

### Detail Workspace

```text
detail workspace
├── center stage
│   └── article/content column
└── right rail shell
    └── right rail content
```

Desktop detail pages should use a full-width two-track shell inside the tool main area:

- the **right rail shell stays docked to the far right**
- the **center stage consumes the remaining width**
- the **article/content column recenters inside the center stage**

Do not center the entire two-track workspace as one block when the right rail is present. That makes the right rail feel detached from the shell and causes collapse widths to look inconsistent.

## Ownership Rules

### Divider Ownership

- The vertical divider between center and right belongs to the **right rail shell**
- The divider should not belong to a feedback card, inner body wrapper, or sticky toolbar
- The divider should visually span the desktop workspace height

### Scroll Ownership

Desktop detail pages should scroll at the **center stage** level.

This means:

- the article/content column itself is not the primary scroll container
- the scrollbar appears at the boundary between content area and right rail
- the right rail can keep its own internal scroll for long rail content

If the scrollbar appears on the inner article card boundary, the scroll owner is too deep.

### Width Ownership

- The center stage owns available space
- The article/content column owns readable width
- The right rail shell owns rail width

Readable width is never “whatever space is left”.

## Desktop Width Rules

These values are the current reference defaults from Writing:

- **Left rail expanded**: `260px`
- **Left rail collapsed**: `52px`
- **Right rail collapsed**: `52px`
- **Right rail expanded**: tool-specific, but should generally live in the `320px–380px` range

Rules:

- Left and right collapsed rail widths should match on desktop unless there is a strong tool-specific reason not to
- Right rail expanded width may vary by tool density
- Article/content max width may vary by tool type, but should remain independently constrained inside the center stage

## Detail State Model

For tools with versioned work or historical attempts, the preferred state model is:

1. **Latest**
2. **History**
3. **Compose**

These states should share the same page skeleton.

What may change:

- editable vs read-only body
- selected round/attempt
- current right-rail content
- status banner

What should stay structurally stable:

- title/header
- persistent context blocks above the body
- right-rail navigation area
- general left/center/right page proportions

Writing is the current example:

- `Writing guide` and `Essay prompt` stay visible in latest/history/compose
- right rail always remains the round-navigation + feedback context surface

## Right Rail Interaction Rules

When the right rail represents history plus a primary progression action:

- Put the primary action first
- Put the newest completed/latest item next
- Order history from newest to oldest
- Wrap onto additional rows if horizontal space is insufficient

The active state should reflect the user’s current page mode:

- compose active → primary action highlighted
- viewing a past item → that item highlighted
- latest view → latest item highlighted

If the next action depends on completion of the latest evaluation or processing step:

- disable the primary action while the latest item is pending
- explain the disabled state inline in the rail

## Mobile Rules

The reference mobile behaviour is:

- left rail becomes a drawer
- detail page becomes a single column
- right rail content becomes inline below the main body or is otherwise merged into the main content flow

Do not preserve the desktop three-column geometry on mobile.

## Adoption Rules

Use this pattern when a tool has most of the following:

- a persistent left-side item or workspace rail
- a center detail/editor/reader surface
- a right-side history, feedback, metadata, or context rail
- multiple modes on the same detail route

Do not force this pattern onto tools that are fundamentally single-column utilities.

## Migration Checklist

When bringing another tool onto this pattern:

1. Define shell vocabulary first: left rail, canvas, center stage, article/content column, right rail shell
2. Decide scroll ownership explicitly
3. Make rail divider ownership explicit
4. Normalize desktop collapsed widths
5. Stabilize the detail state model before styling
6. Only then extract shared CSS or shared components

## Extraction Guidance

Do **not** start by building a giant shared component.

Preferred order:

1. Align tools to the same shell contract
2. Align CSS tokens and structural class responsibilities
3. Extract small shared primitives
4. Only then consider a reusable `ToolShell` or `DetailWorkspace` component

This reduces the risk of abstracting the wrong thing too early.

## Current Adoption Candidates

- **Reading**: strongest candidate; already has left rail + center detail + right history rail, but should be audited against Writing’s state stability and shell ownership rules
- **Speech**: possible candidate for partial adoption; likely shares shell/rail principles more than detail-state principles
- **Other tools**: evaluate case by case; prefer pattern reuse only where the information architecture genuinely matches
