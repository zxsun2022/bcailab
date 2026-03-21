# CSS Layout Conventions

Patterns and pitfalls discovered while building and fixing layout across bcailab tool pages. This document is intended for both humans and AI agents working on the codebase.

For the higher-level shared shell and detail-page interaction model, see `docs/tool-shell-pattern.md`. That document treats Writing as the current reference implementation for cross-tool layout behaviour.

## Container & Content Width

The site container is `1220px` (`--container-width`). Individual tool pages constrain their content to narrower widths for readability.

| Context | Target width | Rationale |
|---------|-------------|-----------|
| Article reading (`.markdown`) | `720px` | 60-75 chars/line for comfortable reading |
| Posts list (`.posts-list`) | `760px` | Slightly wider than article to accommodate action buttons |
| TTS grid (with sidebar) | Full container | Sidebar + main fill the viewport |

**Key rule**: any `max-width` constraint **must** be paired with `margin-left: auto; margin-right: auto` (or `margin: 0 auto`) to center the element within the wider container. Forgetting `margin: auto` causes the element to stick to the left edge.

## Canvas Centering (Tool Pages)

Tool pages use a `.canvas` wrapper inside the main content area to constrain width and center content. This ensures consistent centering regardless of nav rail state.

```css
.writing-canvas {
  width: 100%;
  max-width: 1020px;     /* accommodates center-panel + aside panel */
  margin: 0 auto;        /* centers within .writing-main */
  flex: 1;
  min-height: 0;
}
```

Sub-pages apply their own narrower max-widths inside the canvas:
- Editor/composer: `720px`
- Settings: `600px`
- Dashboard: `760px`

For detail pages with a docked right rail, do not stop at canvas centering. Use the shared `center stage + article column + right rail shell` pattern described in `docs/tool-shell-pattern.md`.

For pages with a side panel (e.g. article detail with revision rail), the canvas holds both the center-panel and the aside as flex children. The center-panel gets its own `max-width` (e.g. 720px) so it never stretches too wide even when the aside is absent.

**Key rule:** The canvas `max-width` should equal the sum of center-panel max-width + gap + aside panel width. Example: `720px + 28px + 260px ≈ 1020px`.

## Centering Checklist

When adding `max-width` to constrain content width:

1. Add `margin-left: auto; margin-right: auto` to center it.
2. If the element also has `margin-top` or `margin-bottom`, use longhand properties (`margin-left`, `margin-right`) instead of shorthand `margin: 0 auto` to avoid overwriting vertical margins.
3. Verify on both desktop (wide viewport) and mobile (narrow viewport where `max-width` has no effect).

## Viewport-Filling Tool Pages (e.g. Speech/TTS)

For tool pages that should fill the viewport height without page-level scrolling:

- Tool pages do not render the global footer. Use `height: calc(100dvh - Npx)` (not `min-height`) on the shell, where `N` accounts for the global header plus any in-shell padding.
- Set `overflow: hidden` on the shell to prevent page scroll.
- Propagate available space inward using `flex: 1; min-height: 0` on each nested container, all the way down to the content element that should scroll internally.
- The innermost scrollable element (textarea, transcript, etc.) gets `overflow-y: auto`.
- **Never use `min-height: calc(100dvh - …)` with `flex: 1` on children** — this creates forced stretching that makes the area taller than the viewport.

### Flex chain pattern

```
shell (height: calc)
  └─ main (flex: 1, min-height: 0, overflow: hidden)
       └─ content wrapper (flex: 1, min-height: 0, flex column)
            └─ card (flex: 1, flex column, min-height: 0)
                 └─ form (flex: 1, flex column, min-height: 0)
                      ├─ textarea (flex: 1, overflow-y: auto, min-height: 100px)
                      └─ controls (natural height)
```

Every intermediate container needs `min-height: 0` to allow flex shrinking below content size.

## Sidebar Heights

- On desktop grid layouts, use `align-items: stretch` on the grid parent and let sidebar height follow the grid row height.
- Remove explicit `height: calc(…)` and `position: sticky` from sidebar when the parent shell already has a fixed height — sticky has no effect when there's nothing to scroll.
- Sidebar list content should use `flex: 1; min-height: 0; overflow: auto` to scroll internally.

## Mobile Responsive Patterns

### Breakpoints used

| Breakpoint | Purpose |
|-----------|---------|
| `max-width: 1024px` | Home hero layout stacks |
| `max-width: 768px` | Primary mobile breakpoint — sidebars hide, grids collapse to single column, header stacks |
| `max-width: 480px` | Small phone tweaks — reduced padding, smaller logo |
| `min-width: 1024px` | Tool pages: nav rail becomes persistent sidebar, detail layouts switch to horizontal flex, revision rail appears (compact) |
| `min-width: 1280px` | Tool pages: revision rail expands to full width (220–260px via `clamp`) |

### Common mobile pitfalls

1. **`max-height: 42vh` panels** — On phones, `42vh` is only ~350px. For panels that replace main content (like mobile history), use `calc(100dvh - Npx)` to fill remaining space below the visible header/chrome.
2. **Grid columns that don't collapse** — Any `grid-template-columns` defined in base styles will apply to mobile. Always define multi-column grids inside `@media (min-width: 1024px)` and use `display: block` as the base.
3. **Desktop-only elements** — Use `display: none` in base styles and `display: block/flex` inside the desktop media query. Don't rely on `max-width: 768px` to hide things (leaves a gap between 768-1024px).

## Form Control Alignment

When placing buttons alongside select/input elements in a grid row:

- Buttons and inputs have different natural heights due to different font sizes and padding.
- **Don't use a fixed `height` on the button** — it will drift out of alignment with inputs as styles evolve.
- Instead, match the button's `padding` and `line-height` to approximate the input's computed height.
- The grid should use `align-items: end` so that controls with labels above them (select fields) align at the bottom with controls without labels (buttons).

## Article/Reading Layout with TOC

When a page has an optional table-of-contents sidebar:

- Use a conditional CSS class (e.g. `.has-toc`) to switch between centered single-column and grid layout.
- **Without TOC**: article at `max-width: 720px; margin: 0 auto` (centered).
- **With TOC (desktop ≥1024px)**: grid with `grid-template-columns: minmax(0, 720px) 200px`, the grid itself centered with `max-width: 960px; margin: 0 auto`.
- TOC uses `position: sticky; top: 24px` within its grid column.
- **Mobile (<1024px)**: TOC hidden (`display: none` base), article full-width.

### TOC heading IDs

- Use index-based IDs (`heading-0`, `heading-1`, …) rather than text-slugified IDs. Slugify functions that use `\w` or `[a-z0-9]` patterns will strip CJK characters entirely, producing empty or colliding IDs.
- Assign IDs via client-side `useEffect` after mount — this works with all existing content without modifying the markdown renderer.
- Use `scrollIntoView({ behavior: "smooth", block: "start" })` via `onClick` handler instead of relying on `<a href="#id">` browser hash navigation, which can be unreliable when IDs are set dynamically.

### Scroll-tracking highlights

- Use `IntersectionObserver` for efficiency, but add a `scroll` event listener as a fallback for bottom-of-page detection.
- When `window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - threshold`, force-highlight the last heading — otherwise it may never enter the observer's intersection zone.

## Debugging Checklist

When something looks misaligned:

1. **Element stuck to left?** — Check for `max-width` without `margin: auto`.
2. **Element too tall / too short?** — Check for conflicting `min-height` + `flex: 1` chains. Ensure every flex container has `min-height: 0`.
3. **Button/input height mismatch?** — Compare computed heights. Remove fixed `height`, use matching `padding` + `line-height` instead.
4. **Mobile panel too small?** — Replace `vh` units with `calc(100dvh - Npx)` where `N` accounts for visible header/chrome.
5. **Content overflows on mobile?** — Check for `grid-template-columns` or `min-width` values defined outside media queries.
6. **Heading anchors broken for CJK text?** — Never use regex-based slugify for heading IDs; use index-based IDs.
