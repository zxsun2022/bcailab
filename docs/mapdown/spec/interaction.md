# Interaction Specification and Node State Machines

## 1. Purpose

This document defines how pointer, keyboard, focus, text input, drag, and visibility states interact.

The implementation MUST treat selection, editing, hover, dragging, collapse, and hidden status as distinct concepts. Most interaction bugs occur when these concepts are collapsed into a single boolean such as `isActive`.

## 2. State dimensions

A node can participate in several orthogonal state dimensions.

### 2.1 Global interaction mode

Exactly one global mode is active:

```text
Idle
Node Selected
Node Editing
Canvas Panning
Node Dragging
Modal Open
```

### 2.2 Node selection state

```text
Unselected
Selected
```

MVP permits at most one selected node.

### 2.3 Pointer state

```text
Not Hovered
Hovered
Pressed
```

Hover is independent of selection.

Node hover MUST have a treatment distinct from selection and editing: an inset ring in the
theme's `hoverOutline` that reads differently from the outer selection ring and from the
editing textarea ring, does not alter the node box dimensions, and is suppressed while the
node is selected or being dragged (Canvas affordances, D-23).

### 2.4 Visibility state

```text
Visible Leaf
Visible Expanded
Visible Collapsed
Hidden by Ancestor
```

Visibility is derived from hierarchy and collapse state.

### 2.5 Text state

```text
Not Editing
Editing
IME Composing
```

IME composing is a substate of editing and MUST suppress structural interpretation of keys such as Enter until composition confirms.

## 3. Valid and invalid combinations

Valid examples:

- Selected + Expanded + Not Editing
- Selected + Collapsed + Not Editing
- Hovered + Unselected + Leaf
- Selected + Editing + Expanded
- Selected + Editing + IME Composing

Invalid examples:

- Hidden by Ancestor + Selected
- Hidden by Ancestor + Editing
- Root + Collapsed
- Leaf + Collapsed
- Node Dragging + Node Editing
- Canvas Panning + Text Editing
- Two nodes simultaneously selected in MVP

If a command makes the selected node hidden, selection MUST move to the nearest visible controlling node, normally the collapsed ancestor.

## 4. Global state machine

### 4.1 Idle

Definition:

- no selected node;
- no active gesture;
- no modal;
- canvas can receive blank clicks, panning, wheel, and shortcuts.

Transitions:

| Event | Next state | Effect |
|---|---|---|
| Click node | Node Selected | Select clicked node |
| Keyboard focus enters a node | Node Selected | Select focused node |
| Drag blank canvas beyond threshold | Canvas Panning | Begin pan |
| Open Help/export | Modal Open | Trap modal focus |

### 4.2 Node Selected

Definition:

- exactly one visible node is selected;
- text caret is absent;
- structural shortcuts are active.

Transitions:

| Event | Next state | Effect |
|---|---|---|
| Printable input | Node Editing | Replace text on first input |
| Click selected node text | Node Editing | Place caret |
| Double-click text | Node Editing | Select all text |
| F2 | Node Editing | Select all text |
| Click another node | Node Selected | Change selection |
| Click blank canvas | Idle | Clear selection |
| Start node drag | Node Dragging | Drag selected subtree |
| Start blank pan | Canvas Panning | Preserve selection during gesture |
| Open modal | Modal Open | Preserve selection for return |
| Node deleted | Node Selected/Idle | Select fallback node |

### 4.3 Node Editing

Definition:

- one node is selected;
- an editable text control or equivalent is focused;
- text-selection and caret semantics take priority.

Transitions:

| Event | Next state | Effect |
|---|---|---|
| Enter, not composing | Node Selected | Commit current node only |
| Tab, not composing | Node Editing on new node | Commit; create child |
| Shift+Tab, not composing | Node Selected | Commit; promote node; keep selection |
| Escape | Node Selected or previous selection | Cancel new empty node or exit editing |
| Click another node | Node Selected/Editing | Commit; select target; second click rules apply |
| Click blank | Idle | Commit or remove empty new node; clear selection |
| Open modal | Modal Open | Commit; preserve selected node |
| IME compositionstart | Node Editing / composing | Suppress structural key handling |
| IME compositionend | Node Editing | Commit composition text only |

### 4.4 Canvas Panning

Definition:

- pointer movement changes viewport offset;
- nodes do not receive click/drag completion.

Transitions:

| Event | Next state | Effect |
|---|---|---|
| Pointer release | Prior selected state or Idle | End pan |
| Pointer cancel | Prior state | Restore safe viewport state |

A pan gesture MUST not clear selection.

### 4.5 Node Dragging

Definition:

- the selected node/subtree is represented by a drag preview;
- the original structure is unchanged until drop commit;
- a drop target is continuously resolved.

Transitions:

| Event | Next state | Effect |
|---|---|---|
| Valid drop | Node Selected | Execute one move command |
| Invalid drop | Node Selected | Restore original structure |
| Escape | Node Selected | Cancel drag |
| Pointer cancel | Node Selected | Cancel drag |

### 4.6 Modal Open

Definition:

- Help, export, import warning, or another modal has focus;
- canvas shortcuts are suspended except global modal close.

Transitions:

| Event | Next state | Effect |
|---|---|---|
| Escape/Close | Previous state | Restore focus to invoking control or selected node |
| Confirm command | Previous or modified state | Apply command, restore logical focus |

## 5. Pointer interaction

### 5.1 Hit regions

A rendered node SHOULD expose distinct logical hit regions:

1. Node body/selection region;
2. Text-edit region;
3. Collapse/expand control;
4. Drag handle or draggable body region;
5. Optional context-menu region.

The visual appearance may combine these regions, but event routing MUST prevent overlap ambiguity.

### 5.2 First single click on an unselected node

Result:

- select the node;
- do not show a text caret;
- show structural focus/selection outline;
- make collapse control visible if applicable;
- bring the node minimally into view.

### 5.3 Single click on already selected text region

Result:

- enter editing;
- place caret at the clicked text position;
- do not select all unless platform-native click count indicates double click.

### 5.4 Double click

Double-clicking the text region:

- selects the node if necessary;
- enters editing;
- places the caret after the existing text.

`F2` is the explicit select-all replacement path. Triple-click behavior MAY use platform defaults.

### 5.5 Click collapse control

Result:

- toggle expanded/collapsed;
- preserve node selection if already selected;
- if another node is selected, the clicked node MAY become selected, but MUST NOT enter editing;
- stop propagation to text editing and drag initiation;
- return focus to the node or control in an accessible manner.

Recommended behavior: clicking the control also selects its node, then toggles it.

### 5.6 Click blank canvas

If no drag threshold is passed:

- commit active text edit;
- remove a cancellable new empty node;
- clear node selection;
- leave viewport unchanged.

### 5.7 Pointer-down ambiguity and movement threshold

A pointer-down on a node MUST not immediately begin drag.

Drag begins only after movement exceeds a device-appropriate threshold, for example 4–6 CSS pixels for mouse and a larger/timed threshold for touch.

Before threshold:

- release counts as click;
- selection behavior applies.

After threshold:

- click/edit behavior is cancelled;
- node drag begins.

### 5.8 Context menu

Right-click or platform context-menu gesture on a node:

- selects the node;
- does not enter editing;
- opens the node menu near the pointer;
- preserves the visible map;
- routes keyboard focus into the menu.

Right-click on blank canvas opens an optional canvas menu with actions such as paste, fit map, reset view, and Help.

## 6. Editing semantics

### 6.1 Replace-on-type

When a node is selected but not editing, a printable text input initiates editing with `replace-on-input` intent.

Behavior:

1. select all existing node text internally;
2. apply the produced text/input event;
3. maintain IME correctness;
4. group the resulting rename in one history transaction.

Modifier shortcuts such as `Cmd+C` MUST not be mistaken for printable input.

### 6.2 Click-to-caret

When a selected node is clicked in the text region:

- enter editing;
- preserve text;
- resolve caret from pointer location;
- scroll within the node only if absolutely necessary; node labels SHOULD expand vertically instead of horizontal scrolling.

### 6.3 F2 editing

`F2`:

- enters editing;
- selects all text;
- is suppressed if the browser or OS reserves the key and cannot be reliably intercepted; Help must show it only where supported.

### 6.4 Text normalization

During editing, the UI may contain temporary input characters. On commit:

- normalize CRLF/CR to LF;
- replace unsupported hard line breaks according to MVP policy, normally with spaces;
- remove forbidden control characters;
- trim leading/trailing whitespace unless the product later explicitly supports it;
- retain meaningful multiple internal spaces where browser input preserves them;
- normalize a string containing only whitespace to empty.

### 6.5 Paste into node text

If pasted content is a single line, insert normally.

If pasted content contains multiple lines while editing one node:

MVP behavior MUST be deterministic. Recommended default:

- replace line breaks with single spaces;
- show a transient message: “Multi-line text was combined into one node.”

A future “Paste as outline” command may parse multiple nodes, but ordinary paste MUST not unexpectedly restructure the map.

### 6.6 Enter while editing

When not in IME composition:

- commit current text;
- exit the textarea;
- keep the committed node selected;
- do not create a sibling.

Creating a sibling is the meaning of a separate Enter in Node Selected mode. A newly created
empty leaf is the one exception: editing Enter is a no-op and keeps that node in editing so
repeated keypresses cannot accumulate empty siblings.

> **Amendment (2026-08-04):** D-17 separates commit from create. The previous one-key
> commit-and-create loop made the same key perform two state transitions and hid the selected
> state between them.

Manual newline insertion is not supported in MVP, so `Shift+Enter` SHOULD either:

- perform the same as Enter; or
- do nothing with a discoverable explanation.

Recommended MVP decision: `Shift+Enter` performs no structural action and is reserved for future multiline support. It MUST be listed as “Reserved / no action” only in developer documentation, not prominently in user help.

### 6.7 Escape while editing existing node

For an existing node:

- end editing;
- preserve the current normalized text;
- keep the node selected.

Escape does not revert the text to its value at editing entry. Undo provides reversion. This avoids surprising loss of typed work.

### 6.8 Escape while editing a newly created empty node

If the node:

- was created in the current creation session;
- has empty normalized text;
- has no children;

then Escape:

- removes the node;
- restores selection to the creation anchor;
- returns to Node Selected state;
- avoids a lasting history entry.

If the new node contains text, Escape merely exits editing and keeps it.

### 6.9 Blur behavior

When the editing control loses focus:

- commit normalized text;
- if it is a cancellable new empty node, remove it;
- never leave a hidden orphan input overlay;
- maintain a coherent selection target.

Blur caused by opening a toolbar control MUST not create an extra sibling or duplicate history entry.

## 7. IME and composition

Chinese, Japanese, Korean, and other input-method editors are first-class requirements.

During `compositionstart` through `compositionend`:

- Enter MUST confirm/select within the IME and MUST NOT create a sibling;
- Escape behavior is left to IME/browser until composition ends;
- arrow keys remain text/IME keys;
- Tab SHOULD follow platform composition behavior and MUST not create a child if the browser reports active composition;
- text measurement MAY lag until composition update but should remain visually stable.

The command dispatcher MUST check composition state before handling structural keys.

Automated tests SHOULD include Pinyin composition where Enter confirms a candidate.

## 8. Empty-node rules

### 8.1 Rationale

Fast structural editing naturally creates temporary empty nodes. The editor must support this without allowing accidental empty-node accumulation.

### 8.2 Existing node emptied intentionally

If an existing node is edited to empty and editing exits:

Recommended MVP behavior:

- keep the empty node;
- render a placeholder such as “Untitled” only when selected/hovered;
- allow immediate re-entry;
- do not silently delete an existing subtree merely because its label became empty.

An empty existing node with children is valid because deletion would destroy structure.

### 8.3 Newly created empty leaf

A new empty leaf is temporary. It is removed when:

- Escape exits creation;
- focus moves away;
- keyboard navigation leaves it;
- another structural command cannot meaningfully use it.

### 8.4 Newly created empty node with children

Once a child has been created under an empty new node, the parent is structural and MUST not be auto-deleted. It becomes an empty existing node.

### 8.5 Repeated Enter

Repeated Enter on an empty newly created leaf MUST not create an unbounded run of empty siblings.

The app should keep focus on the same empty node and provide subtle no-op feedback.

## 9. Structural shortcut resolution during editing

The editor supports documented editing commands, including commit-only Enter and structural
Tab/Shift+Tab, while text editing. Therefore priority resolution is:

1. Modal/menu focus rules;
2. IME composition;
3. browser/assistive-technology reserved behavior;
4. supported structural editing keys (`Enter`, `Tab`, `Shift+Tab`, `Escape`);
5. ordinary text-editing behavior;
6. map-level shortcuts.

Examples:

- `ArrowLeft` while editing moves the caret.
- `Cmd+ArrowLeft` follows text-field platform semantics.
- `Delete` while editing deletes characters.
- `Enter` while editing commits only; a later Enter in node-selected mode creates a sibling.
- `Tab` while editing commits and creates a child, because node labels do not use tab characters.
- `Cmd+Z` while editing invokes application history, but should feel equivalent to undoing the editing session.

## 10. Collapse interaction

### 10.1 Hover

Hovering a collapsible node reveals the control on its outward edge without changing layout geometry.

The control MUST occupy reserved or overlay space so appearing/disappearing does not change node width and cause reflow.

### 10.2 Selected

The collapse control remains visible for the selected node.

### 10.3 Collapsed

The direct-child count badge remains visible even when not hovered or selected because it communicates hidden content.

### 10.4 Keyboard toggle

The user can toggle collapse through documented keys or commands. Keyboard collapse MUST retain node selection.

### 10.5 Selection inside collapsing subtree

If a user collapses ancestor `A` while a descendant `D` is selected through a global or menu command:

- selection moves to `A` before/at commit;
- editing on `D` is committed;
- focus is restored to `A`.

## 11. Drag-and-drop interaction

### 11.1 Drag preview

During drag:

- show a lightweight preview of the node label and subtree count;
- keep the original node visible but visually de-emphasized, or show a placeholder;
- do not continuously mutate document structure;
- update target indicators at interactive speed.

### 11.2 Drop targets

Three core target visuals:

1. **Before/after sibling**
   - a clear insertion line perpendicular to branch flow;
   - indicates exact semantic order.
2. **Make child**
   - target node body receives a distinct outline/background;
   - label such as “Move inside” MAY appear.
3. **Move side**
   - root-side region or explicit left/right target highlights;
   - available only for first-level branch moves in two-sided layout.

### 11.3 Invalid targets

Invalid targets include:

- source node itself;
- any descendant of source;
- moving another node above/root as parentless;
- side move for non-first-level nodes without reparenting;
- drop onto hidden/nonexistent target.

Invalid state MUST be visually distinct and dropping MUST be a no-op.

### 11.4 Autopan

Dragging near viewport edges SHOULD auto-pan at a bounded speed.

Autopan MUST stop immediately on drop/cancel.

### 11.5 Autoexpand on hover

MVP MAY autoexpand a collapsed target after a deliberate hover delay during drag. If implemented:

- delay SHOULD be at least several hundred milliseconds;
- temporary autoexpand should be reversible on cancel unless the user explicitly drops inside;
- it must not cause chaotic target movement.

This feature is optional for MVP and can be deferred.

### 11.6 Drop commit

A valid drop produces exactly one history entry and one semantic move command.

Selection remains on the moved node.

Viewport adjusts minimally to reveal its new position.

## 12. Canvas interaction

### 12.1 Pan initiation

Pan may begin through:

- primary-button drag on blank canvas;
- middle-button drag anywhere except active native controls;
- Space + primary drag, if implemented;
- touch drag on blank area.

### 12.2 Node versus canvas drag

Primary drag beginning on a node means node drag after threshold.

Space + drag SHOULD force canvas pan even when starting over a node, matching design-tool conventions. If implemented, Help must document it.

### 12.3 Wheel

Recommended behavior:

- ordinary wheel/trackpad scroll pans vertically/horizontally;
- `Ctrl/Cmd` + wheel zooms;
- pinch zoom uses browser pointer/gesture support;
- behavior should respect platform conventions.

### 12.4 Fit and center animation

Fit/center MAY animate briefly, but MUST respect reduced-motion preferences.

### 12.5 Zoom controls

Zoom is exposed through a floating capsule at the bottom-left of the canvas: Zoom out
(−), the current percentage, and Zoom in (+). Clicking the percentage restores 100% without
moving the viewport centre. The View menu keeps its Fit map, Centre selection and Reset zoom
to 100% entries, and `Primary+0` continues to reset zoom from the keyboard.

## 13. Focus management

### 13.1 Logical focus

The selected node is the logical keyboard focus target even if implementation uses one canvas-level focus element and `aria-activedescendant`.

### 13.2 After node creation

Focus moves to the new node’s editor immediately.

### 13.3 After deletion

Focus moves to the selected fallback node.

### 13.4 After modal close

Focus returns to:

1. the selected node, when modal was invoked by a map command; or
2. the invoking toolbar button, when no node context is required.

### 13.5 After import

Focus/select the imported root node and fit the map, unless user preference indicates otherwise.

## 14. Selection visuals

Selection MUST remain visible across themes.

Requirements:

- not rely solely on color;
- use outline, halo, border thickness, or combined treatment;
- not change node dimensions;
- distinguish keyboard focus from pointer hover;
- not appear in image export.

Editing MUST additionally show a caret or text selection.

## 15. Motion

Layout transitions SHOULD animate position changes to preserve causality.

Recommended durations:

- local node/subtree reflow: approximately 120–220 ms;
- full layout-mode switch: approximately 180–300 ms;
- collapse/expand: approximately 140–240 ms.

Rules:

- typing must not wait for animation;
- rapid edits should retarget or skip animations rather than queue them;
- reduced-motion mode uses immediate or near-immediate transitions;
- connector motion must remain synchronized with node motion.

## 16. Interaction invariants

At all times:

1. At most one node is selected.
2. An editing node is selected and visible.
3. A hidden node is neither selected nor editing.
4. Drag does not mutate the tree before drop commit.
5. Collapse controls never initiate text editing.
6. Pointer panning never creates a node.
7. Text deletion while editing never deletes a subtree.
8. IME confirmation Enter never creates a sibling.
9. Structural commands produce valid trees or no change.
10. Focus always has a recoverable destination after node removal or modal close.
