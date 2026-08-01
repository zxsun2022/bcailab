# Testing and Acceptance Specification

## 1. Purpose

This document converts the product specification into release gates.

A feature is not complete merely because the happy path works. The editor combines tree mutations, text input, layout, browser persistence, and keyboard focus; regressions often occur at the boundaries between these systems.

## 2. Test layers

The project SHOULD maintain:

1. **Pure unit tests**
   - tree commands;
   - normalization;
   - Markdown parser/serializer;
   - side assignment;
   - geometry helpers;
   - shortcut dispatch.
2. **State-machine tests**
   - selection/editing/drag/modal transitions;
   - empty-node cleanup;
   - IME guards;
   - focus restoration.
3. **Layout tests**
   - overlap invariants;
   - deterministic coordinates;
   - branch order;
   - collapse projection;
   - bounds.
4. **Component/integration tests**
   - pointer hit routing;
   - in-place editing;
   - collapse controls;
   - toolbar and dialogs.
5. **End-to-end tests**
   - complete keyboard workflows;
   - import/export;
   - reload/recovery;
   - browser-specific behavior.
6. **Visual regression tests**
   - themes;
   - layouts;
   - long labels;
   - left/right controls;
   - SVG/PNG output.
7. **Accessibility tests**
   - automated checks;
   - manual keyboard and screen-reader scenarios.
8. **Performance tests**
   - large trees;
   - rapid typing;
   - repeated collapse/expand;
   - export size limits.

## 3. Tree-command unit tests

### 3.1 Creation

- Create sibling after an ordinary node.
- Create first-level child when Enter is used on root.
- Create child as last child.
- Creating child expands collapsed parent.
- New first-level node receives deterministic side.
- IDs are unique.
- Selection result is the new node.

### 3.2 Promotion

- Promote depth-2 node to first level.
- Promoted node is inserted after former parent.
- Promoted subtree remains intact.
- Side inherits former first-level branch when becoming first-level.
- First-level node promotion is a no-op.
- Root promotion is a no-op.

### 3.3 Deletion

- Delete leaf.
- Delete branch with descendants.
- Root deletion rejected.
- Selection fallback priority is correct.
- Undo restores exact parent/index/subtree/side.
- Redo removes it again.

### 3.4 Reorder/reparent

- Move before/after sibling.
- Move to a new parent.
- Reject moving into own descendant.
- Reject self-drop.
- Preserve subtree order.
- Normalize side when entering/leaving first level.
- One move equals one history entry.

### 3.5 Collapse

- Leaf cannot remain collapsed.
- Root cannot collapse.
- Descendants become hidden in visible projection.
- Nested collapse state survives ancestor collapse/expand.
- Selection inside a collapsing subtree moves to ancestor.

## 4. State-machine tests

### 4.1 Selection and editing

- First click selects without caret.
- Second text click enters editing at caret.
- Double-click enters editing and selects all.
- F2 enters editing/selects all.
- Typing on selected node replaces text.
- Arrow keys navigate nodes outside editing and caret inside editing.

### 4.2 Enter/Tab behavior

- Enter outside editing creates sibling.
- Enter inside editing commits and creates sibling.
- Enter on root creates first-level node.
- Tab creates child from selected node.
- Tab inside editing commits and creates child.
- Shift+Tab commits and promotes.
- Tab resumes browser focus traversal after selection is cleared.

### 4.3 Empty nodes

- New empty node + Escape removes it and restores anchor.
- New empty node + blank click removes it.
- New empty node + repeated Enter does not accumulate empties.
- Existing node emptied remains as empty node.
- Empty node with children is not auto-deleted.
- Cancelled creation leaves no net history entry.

### 4.4 IME

- `compositionstart` marks composing.
- Enter during Pinyin composition does not create sibling.
- Tab during composition does not create child.
- `compositionend` commits text.
- Enter after composition end creates sibling exactly once.
- Undo treats the edit coherently.

### 4.5 Modal/focus

- Help opening commits active edit safely.
- Help closing restores selected node or invoking button.
- Escape closes one layer at a time.
- Canvas shortcuts do not fire inside modal search input.

## 5. Keyboard end-to-end scenarios

### Scenario K1: build a hierarchy

Starting with empty root:

1. Type `Product`.
2. Enter, type `Problem`.
3. Tab, type `User pain`.
4. Enter, type `Alternatives`.
5. Shift+Tab.
6. Enter, type `Solution`.

Expected semantic tree:

```text
Product
├─ Problem
│  ├─ User pain
│  └─ Alternatives
└─ Solution
```

No mouse interaction is used.

### Scenario K2: navigate two-sided map

- From root, left arrow selects a left first-level branch.
- Arrow away from root expands/selects child.
- Arrow toward root returns to parent.
- Up/down choose predictable visual neighbors.
- Home returns to root.

### Scenario K3: delete and undo

- Select branch with 10 descendants.
- Delete removes entire branch.
- Selection moves predictably.
- Undo restores exact branch and side.
- Redo removes it.

### Scenario K4: collapse

- Select expanded branch.
- Space collapses and announces hidden child count.
- Hidden nodes are skipped by arrows.
- Space expands.
- Descendant-specific collapsed state is preserved.

### Scenario K5: leave canvas

- While editing, Escape exits edit.
- Escape clears selection.
- Tab moves to next toolbar/application control.

## 6. Pointer end-to-end scenarios

### Scenario P1: select versus edit

- First click selects node.
- Second click in text places caret.
- Double-click selects all text.
- Click collapse badge never places caret.

### Scenario P2: drag reorder

- Drag node between siblings.
- Exact insertion line appears.
- Drop changes order once.
- Undo restores.

### Scenario P3: drag reparent

- Drag node onto valid target.
- Child target highlight appears.
- Drop moves full subtree.
- Drag onto descendant shows invalid state and does nothing.

### Scenario P4: move side

- Drag first-level branch across root to opposite side.
- Side target highlights.
- Branch retains semantic order and color.
- Reload preserves side locally.

### Scenario P5: pan versus drag

- Blank drag pans.
- Node drag moves node only after threshold.
- Small node click movement remains click.
- Space + drag pans if supported.

## 7. Layout tests

### 7.1 Invariants

For every generated fixture:

- no visible rectangles overlap;
- all connectors join correct visible parent/child;
- hidden descendants have no geometry;
- map bounds contain all visible geometry;
- sibling order matches semantic order;
- controls are on outward edge;
- output is deterministic.

### 7.2 Fixtures

- root only;
- root with one child;
- 20 root children;
- balanced two-sided tree;
- all first-level branches on one side;
- one very tall branch and many short branches;
- long Chinese labels;
- long English unbroken token;
- mixed font fallback;
- depth 100 chain;
- collapsed nested subtrees;
- empty labels;
- theme switch with different metrics.

### 7.3 Stability regression

Record node coordinates before/after:

- editing one leaf;
- adding child;
- collapsing one branch;
- changing theme;
- switching layout mode.

Assertions:

- branch sides never change without explicit side command;
- unrelated sibling order never changes;
- selected node remains visible;
- distant geometry movement stays within accepted policy or is reviewed.

## 8. Markdown tests

### 8.1 Canonical export

- correct front matter;
- one root heading;
- two-space indentation;
- `-` markers;
- final newline;
- complete collapsed content.

### 8.2 Round trip

For supported fixtures:

```text
document -> Markdown -> import -> normalized semantic equivalence
```

Test:

- Chinese;
- emoji;
- punctuation requiring escapes;
- empty labels;
- deep nesting;
- theme/layout metadata;
- sibling order.

### 8.3 Import normalization

- `*` and `+` markers accepted;
- four spaces accepted;
- ordered list warning;
- bold/link stripped to text;
- continuation lines merged;
- unknown front matter warning;
- multiple roots rejected;
- malformed file does not replace active document.

## 9. Persistence tests

- Autosave after text edit.
- Autosave after structure edit.
- Reload restores tree, IDs, collapse, side, theme, layout.
- Viewport restores only if policy enables it.
- Latest corrupt snapshot falls back to prior valid one.
- Quota failure preserves memory and displays export action.
- Visibility-change save runs without duplicate state.
- New document does not destroy prior local snapshot.
- Schema migration succeeds and preserves content.

## 10. Export tests

### 10.1 SVG

- all visible nodes/connectors included;
- hidden descendants excluded;
- no selection/caret/hover UI;
- collapsed count badge included;
- Chinese text valid;
- no script/external unsafe references;
- transparent and theme backgrounds;
- shadows not clipped;
- SVG opens independently.

### 10.2 PNG

- 1× and 2× dimensions correct;
- no clipping;
- transparent/background modes;
- long labels clear;
- browser-size limit produces fallback, not blank image.

### 10.3 Semantic distinction

With collapsed branch:

- Markdown contains descendants;
- SVG and PNG match current collapsed visual state;
- export dialog explains difference.

## 11. Help and command tests

- Visible Help button opens modal.
- `Primary+/` opens shortcut section.
- `Primary+K` opens search if implemented.
- Search “child” finds Create child.
- Search “Shift Tab” finds Promote.
- Localized synonyms work.
- Displayed shortcut equals registered binding.
- Disabled commands show reason.
- Executing command restores focus.
- Help is responsive on narrow viewport.

## 12. Accessibility tests

### 12.1 Automated

Run automated accessibility checks for:

- toolbar;
- canvas/tree shell;
- Help modal;
- export dialog;
- context menu;
- status/error UI.

### 12.2 Manual keyboard

Complete core workflow without mouse.

### 12.3 Screen reader

Verify announcement of:

- label;
- level;
- selected state;
- left/right side;
- expanded/collapsed;
- child count;
- save/export status.

### 12.4 Visual

- 200% browser zoom;
- high contrast/forced colors;
- reduced motion;
- all themes;
- visible focus.

## 13. Performance tests

Suggested benchmark documents:

- 100 nodes typical depth;
- 500 nodes typical depth;
- 2,000 nodes mixed collapsed;
- 10,000-node import safety limit fixture.

Measure:

- initial layout;
- typing latency;
- child creation to visible result;
- collapse/expand;
- theme switch;
- Markdown export;
- SVG/PNG export;
- autosave serialization.

Release gate principle:

> On the 500-node ordinary fixture, text input and local structural commands must remain perceptually responsive on a contemporary mainstream laptop.

Exact millisecond budgets should be recorded after a prototype establishes realistic baselines.

## 14. Cross-browser matrix

Primary support target SHOULD include current stable versions of:

- Chrome/Chromium;
- Safari;
- Firefox;
- Edge.

Test special attention:

- composition/IME events;
- contenteditable/input selection;
- SVG text measurement;
- IndexedDB behavior;
- file download;
- File System Access progressive enhancement;
- keyboard shortcut conflicts;
- trackpad gestures.

## 15. Release severity

### Blocker

- content loss;
- invalid/cyclic tree;
- undo corrupts document;
- Markdown export omits content;
- reload loses confirmed local save;
- core keyboard editing unusable;
- export executes unsafe content.

### Critical

- branch swaps side unexpectedly;
- IME Enter creates accidental nodes;
- delete outside/inside editing confused;
- layout overlap makes content unreadable;
- Help lists incorrect shortcut;
- focus trapped in canvas/modal.

### Major

- visual jitter;
- poor drop indicator;
- theme-specific contrast failure;
- large-map slowdown;
- recoverable export clipping.

### Minor

- cosmetic spacing;
- tooltip wording;
- nonessential animation inconsistency.

No blocker or critical issue may ship.

## 16. Definition of done by feature

A feature is done only when:

1. behavior is specified;
2. command/state implementation is centralized;
3. unit tests cover invariants;
4. keyboard and pointer paths exist where relevant;
5. undo/redo works;
6. local persistence works;
7. Help/Command Center describes it;
8. accessibility semantics exist;
9. export behavior is decided;
10. regression tests pass.

## 17. MVP release checklist

- [ ] Static site loads and edits without account.
- [ ] One-root ordered tree invariant enforced.
- [ ] Select/edit distinction implemented.
- [ ] Enter/Tab/Shift+Tab behavior implemented.
- [ ] IME-safe input implemented.
- [ ] Delete/undo/redo implemented.
- [ ] Keyboard navigation implemented on both sides.
- [ ] Collapse badge/control implemented outwardly.
- [ ] Drag reorder/reparent and non-drag alternatives implemented.
- [ ] Right-only and stable two-sided layout implemented.
- [ ] Four themes implemented.
- [ ] IndexedDB autosave/recovery implemented.
- [ ] Markdown import/export round trip passes.
- [ ] SVG and PNG exports pass fixtures.
- [ ] Visible Help button and searchable shortcut list implemented.
- [ ] Accessibility acceptance scenarios pass.
- [ ] No blocker/critical defects remain.
