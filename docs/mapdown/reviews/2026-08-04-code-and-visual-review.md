# Mapdown code and visual review — 2026-08-04

This is the durable version of the review that began in a temporary Claude scratchpad. It
separates reproduced defects from code-level risks and records what changed after owner
authorization. Delivery state remains governed by `docs/roadmap.md` and `docs/changelog.md`.

## Outcome

| Finding | Evidence | State |
|---|---|---|
| Visible text could disappear on refresh while the UI said it was saved | Reproduced with an active textarea draft absent from `history.doc` | Fixed in PR #31; owner review pending |
| The toolbar had fifteen equal-weight controls and an unstyled native theme selector | Desktop and mobile browser screenshots; command inventory | Reworked to seven top-level controls on the visual-polish branch |
| Root labels were measured at 14px/400 but rendered at 16px/600 | `layout.ts` default versus theme role typography | Fixed by feeding theme role metrics into layout and fallback export |
| Selection reused the node’s own border channel | Selected stroke replaced the node border in `MapCanvas` | Fixed with a separate, non-layout-changing outer ring |
| Connectors and 14px collapse badges were too faint at ordinary zoom | Four preset token review plus 72-node fixture | Connector contrast/weight raised; badges increased to 16px |

## P0 — active-draft persistence

The failure was deterministic:

1. select a node;
2. type into the overlaid textarea;
3. do not press Enter, Escape or click elsewhere;
4. refresh;
5. the prior node label returned even though the status had said “Saved on this device.”

The draft lived only in `EditingState`; autosave observed only `history.doc`. The fix derives a
snapshot-only document with the active draft applied. It does not mutate editor history, change
the live document revision, or invoke layout per keystroke. Continuous debounce remains the
primary save path, with `visibilitychange` and `pagehide` flushing the latest draft.

Evidence: 437/437 tests at the P0 checkpoint, clean production build, and browser recovery both
after the debounce settled and on a refresh roughly 100ms after typing.

## Visual-polish checkpoint

The new chrome uses one information hierarchy:

- Undo and Redo remain directly visible;
- Arrange contains layout and selected-node movement;
- View contains fit, centre and zoom;
- Style contains four previewed document themes and branch-colour mode;
- File contains Open plus Markdown, SVG and PNG export;
- Help remains direct.

This produces seven visible controls without deleting a command. Menus are native-keyboard
reachable, close on outside pointer or Escape, return focus to their trigger, and become a
viewport-bounded panel at 375px. Chrome visuals remain Layer A and do not enter SVG/PNG exports.
Node, connector and collapse-badge changes remain literal Layer B tokens shared by canvas and
export.

Browser QA used both the simple document and the authorized 72-node, seven-level Chinese
fixture. It covered 1280×720 and 375×812 layouts, theme and File menus, mobile clipping,
focus restoration, full-map fit, connector/collapse rendering and console errors.

## Remaining code-level observations

These are review findings, not roadmap authorization:

1. Theme, branch-colour and layout-mode changes still update `EditorHistory.doc` directly
   instead of going through invertible presentation commands. The theme specification says the
   selection should create one undoable presentation command. This predates the visual rewrite
   and deserves a focused behavior change rather than being hidden inside styling work.
2. `dropLastEntry()` removes the last history entry without verifying its editing-session
   `groupId`. No clean browser reproduction was established, so this remains a targeted
   mutation-test candidate rather than a claimed production bug.
3. Geometry-dependent textarea positioning remains inline by design. The toolbar, notice,
   status bar, menus and stable editor chrome moved to named CSS classes; unrelated Phase 0
   report pages still contain their original inline presentation.

Only the first two should become roadmap work if the owner explicitly authorizes their
acceptance criteria.
