# Product Specification

## 1. Scope

This document defines the observable behavior of Mapdown version 1.0.

The editor is delivered as a static web application. It may use browser storage and client-side file APIs, but does not require a server for its core workflow.

## 2. Application shell

### 2.1 Main regions

The application MUST contain:

1. **Top toolbar**
   - document name;
   - new/open controls;
   - undo/redo;
   - layout selector;
   - theme selector;
   - export menu;
   - Help button.
2. **Canvas viewport**
   - rendered mind map;
   - pan and zoom surface;
   - selection and editing overlays.
3. **Status area**
   - local-save status;
   - current zoom percentage or accessible equivalent;
   - optional transient operation feedback.
4. **Modal or popover surfaces**
   - Help and Command Center;
   - export settings;
   - recoverable-error messages;
   - import warnings.

The shell SHOULD remain visually quiet so the map is the primary surface.

### 2.2 Responsive behavior

Desktop and tablet are primary for version 1.0.

The app MUST remain viewable on a narrow mobile screen, but full keyboard-centric authoring on mobile is not an MVP acceptance requirement.

On narrow screens:

- toolbar items MAY collapse into an overflow menu;
- Help, export, and layout controls MUST remain reachable;
- the viewport MUST support touch pan and pinch zoom;
- accidental browser-page scrolling SHOULD be prevented while interacting with the canvas.

## 3. Document lifecycle

### 3.1 First launch

On first launch, the app MUST create a starter document with:

- one root node;
- root text selected or ready for immediate replacement;
- a short, nonintrusive hint such as “Type a topic, press Enter for a sibling, Tab for a child.”

The starter hint MUST disappear after the user performs relevant actions and MUST not become document content.

### 3.2 New document

Creating a new document MUST:

1. preserve the current document in local history/storage before replacement;
2. create a fresh document ID;
3. create one root node;
4. apply the current default theme and layout preference;
5. focus/select the root node;
6. create one undo history boundary only within the new document, not across documents.

If the current document has unsaved-to-disk changes, the app SHOULD explain that it remains saved locally and offer export, but SHOULD not block creation with a destructive warning.

### 3.3 Open/import

The app MUST support opening a local `.md` or `.markdown` file through a file picker.

Opening a file MUST:

- parse the supported Markdown subset;
- show blocking errors for content that cannot produce a valid root tree;
- show nonblocking warnings for normalized or ignored syntax;
- create a new internal document ID unless the platform provides a durable file handle and the user explicitly grants access;
- preserve the source filename as the initial document name.

Drag-and-drop of a Markdown file onto the application MAY be supported.

### 3.4 Autosave

Every semantic edit MUST schedule a local autosave.

The status area SHOULD show one of:

- “Saving…”;
- “Saved locally”;
- “Save failed”; or
- “Storage unavailable”.

Autosave MUST not interrupt typing or move focus.

### 3.5 Recovery

On launch, the app MUST restore the most recently active local document unless the user explicitly requested a blank/new document.

If the last save was incomplete or corrupted, the app SHOULD offer the last valid snapshot rather than silently creating a blank document.

## 4. Node model and hierarchy

### 4.1 Root node

A document MUST have exactly one root node.

The root node:

- cannot be deleted;
- cannot be moved;
- cannot be promoted or demoted;
- may have zero or more first-level children;
- may be renamed;
- may not be collapsed in MVP;
- is visually centered at the conceptual origin of the map.

### 4.2 Ordinary node

An ordinary node:

- has exactly one parent;
- has an ordered list of zero or more children;
- contains plain text;
- can be selected, edited, moved, deleted, collapsed, or expanded;
- belongs to the left or right side only if it is first-level in a two-sided layout;
- inherits its side from its first-level ancestor for rendering.

### 4.3 Node text

Node text MUST:

- be plain Unicode text;
- trim unsupported control characters;
- preserve ordinary internal spaces;
- avoid leading and trailing line breaks;
- use visual wrapping based on theme and maximum node width;
- contain no manually authored hard line break in MVP.

Empty text is allowed temporarily during creation or editing, but a node MUST not remain as an unintended empty committed node after focus leaves it.

The empty-node cleanup rules are defined in `interaction.md`.

### 4.4 Sibling order

Sibling order is semantic.

Layout MUST render siblings according to their stored order, subject only to left-side visual orientation rules documented in `layout-engine.md`.

Automatic balancing MUST never reorder siblings.

## 5. Selection and editing

### 5.1 Single selection

MVP supports exactly one selected node at a time.

Clicking a node selects it. Clicking blank canvas clears selection unless the user is panning.

The selected node MUST have a visible focus/selection treatment distinct from hover.

### 5.2 Editing entry

A selected node enters text editing when any of the following occurs:

- the user begins printable text input;
- the user clicks the text area of the already selected node;
- the user double-clicks the node text;
- the user presses `F2`;
- a node-creation command creates a new node.

Typing while selected SHOULD replace the existing text only when the typed input is a normal text-producing action and no modifier shortcut is active.

### 5.3 Editing exit

Editing exits when:

- `Enter` commits and creates a sibling;
- `Escape` exits according to the editing rules;
- the user clicks another node;
- the user clicks blank canvas;
- a command requiring node mode is executed;
- the editor loses focus due to an application modal.

Text edits SHOULD commit continuously to the runtime model while the input is active, with history coalescing.

### 5.4 Text replacement behavior

When the user starts typing while a node is selected but not editing:

- the node enters editing;
- existing text is selected/replaced by the first input;
- IME composition MUST be supported without premature command execution.

When the user clicks into text, the caret MUST be placed at the closest character position.

Double-clicking SHOULD select all node text rather than a single word, because node labels are generally short and the operation is primarily for rapid replacement.

## 6. Node creation

### 6.1 Create sibling

`Enter` in node mode or text-edit mode MUST:

1. commit the current text;
2. create a new node immediately after the current node in sibling order;
3. assign the same parent;
4. assign a stable first-level side if applicable;
5. select and enter editing on the new node.

When the current node is the root, `Enter` creates a new first-level child after the last first-level child.

### 6.2 Create child

`Tab` on a selected or editing node MUST:

1. commit current text if editing;
2. create a new last child of the current node;
3. ensure the current node is expanded;
4. select and enter editing on the new child.

On the root, `Tab` is behaviorally equivalent to creating a first-level child.

### 6.3 Empty-node continuation

If a newly created node is empty and the user presses `Enter` again:

- the app SHOULD keep one empty node and move it according to the ordinary sibling-creation rule only if doing so remains understandable;
- it MUST avoid accumulating multiple unintended empty siblings.

The normative simplification for MVP is:

> If the current node was newly created, remains empty, and has no children, pressing `Enter` keeps that node in place and does not create another empty sibling.

A brief visual or audible no-op feedback MAY be provided.

### 6.4 Cancel new empty node

If a newly created node remains empty and the user presses `Escape`, clicks elsewhere, or invokes navigation:

- the new empty node MUST be removed;
- selection MUST return to its creation anchor when available;
- the creation and cancellation SHOULD collapse into no net history entry.

## 7. Hierarchy modification

### 7.1 Promote node

`Shift+Tab` promotes the selected node by one level.

Promotion MUST:

- be unavailable for the root;
- be unavailable for first-level nodes;
- move the node and its full subtree;
- insert it immediately after its former parent in the new sibling list;
- preserve selection;
- preserve or derive side according to first-level rules;
- be undoable as one command.

### 7.2 Reparent by drag

Dragging a node onto another node’s child drop zone makes it the last child of that node unless a more precise insertion indicator is shown.

A node MUST NOT be moved into itself or any descendant.

Dragging a node moves its full subtree.

### 7.3 Reorder siblings

Dragging between sibling positions MUST reorder the node within the same parent.

The target indicator MUST distinguish “before,” “after,” and “inside as child.”

### 7.4 Change first-level side

In two-sided layout, a first-level node may be moved between left and right sides by:

- dragging into a side target region; or
- using a context/menu command such as “Move branch to left/right.”

Changing side MUST not alter sibling semantic order in the Markdown document.

The side-specific visual ordering algorithm is defined separately.

## 8. Deletion

### 8.1 Delete subtree

When a nonediting node is selected, `Delete` or `Backspace` MUST delete the selected node and all descendants.

After deletion, selection SHOULD move in this priority order:

1. next visible sibling;
2. previous visible sibling;
3. parent;
4. root.

Deletion MUST be a single undoable command.

### 8.2 Root protection

Attempting to delete the root MUST not delete the document.

The app MAY:

- clear root text only through ordinary editing; or
- show a small nonblocking message: “The root node cannot be deleted.”

### 8.3 Editing-mode delete

While editing text, `Backspace` and `Delete` are text-editing keys and MUST NOT delete the node.

An empty node is removed only by the explicit empty-node cancellation rules, not by interpreting every Backspace at caret position zero as structural deletion.

## 9. Collapse and expansion

### 9.1 Eligibility

Only nodes with one or more direct children have a collapse control.

The root remains expanded in MVP.

### 9.2 Control placement

The control MUST appear on the node’s outward edge:

- right edge for right-side branches;
- left edge for left-side branches.

In right-only layout, controls appear on the right edge.

### 9.3 Visibility

The collapse control MUST be visible when:

- the node is hovered;
- the node is selected;
- the node is keyboard focused;
- the node is collapsed.

For expanded, unselected, unhovered nodes, the control MAY be hidden to reduce clutter.

### 9.4 Visual state

- Expanded node: control displays a minus symbol or equivalent collapse affordance.
- Collapsed node: control displays the count of direct children.

The accessible label MUST state the full action and count, for example:

- “Collapse branch with 3 direct children”;
- “Expand branch with 3 direct children.”

### 9.5 Behavior

Collapsing a node:

- hides all descendants from layout and navigation;
- preserves all content;
- preserves nested descendants’ own collapse states;
- keeps the collapsed node selected if it was selected;
- triggers a local layout update;
- is undoable according to the history policy.

Expanding reverses hidden-by-ancestor status but respects descendant nodes that were independently collapsed.

### 9.6 Global commands

The app SHOULD provide:

- Expand selected branch one level;
- Expand selected branch fully;
- Collapse selected branch;
- Expand all;
- Collapse all below root.

“Collapse all” MUST leave first-level nodes visible.

## 10. Navigation

Visible-node navigation MUST exclude descendants hidden by collapsed ancestors.

The canonical navigation rules are defined in `keyboard.md`, but the product requirements are:

- move to visual neighbors predictably;
- move between parent and child based on branch direction;
- reveal selection with minimal viewport panning;
- never silently expand a collapsed branch unless the invoked command explicitly means expand.

## 11. Layout modes

### 11.1 Right-only

All first-level branches render to the right of the root.

Hierarchy, sibling order, collapse state, and stored two-sided side assignment remain preserved.

### 11.2 Two-sided

First-level branches render left or right.

Each first-level node has a stable side assignment.

The initial side for a newly created first-level node is selected by the layout engine using current side heights and deterministic tie-breaking.

### 11.3 Mode switching

Switching layout mode MUST:

- preserve content and sibling order;
- preserve stored side assignments;
- animate only when motion is enabled;
- keep the selected node selected;
- keep the selected node visible where practical;
- create one undoable document-view command if layout mode is included in history.

## 12. Viewport

### 12.1 Pan

Users MUST be able to pan with:

- pointer drag on blank canvas;
- middle mouse drag, if available;
- trackpad gestures;
- touch drag.

Starting a pan MUST not clear selection until the gesture is interpreted as a blank click rather than a drag.

### 12.2 Zoom

Users MUST be able to zoom using:

- trackpad pinch;
- `Ctrl/Cmd` plus wheel where conventional;
- toolbar controls;
- documented shortcuts.

Zoom MUST be centered near the pointer or viewport center according to input method.

The app SHOULD support a practical range such as 25% to 400%.

### 12.3 Fit map

“Fit map” MUST calculate a scale and pan position that shows all currently visible nodes with comfortable margins.

### 12.4 Center selection/root

The app MUST provide a command to center the selected node or root without changing document layout.

### 12.5 Selection visibility

After keyboard navigation or node creation, the viewport SHOULD pan only enough to reveal the selected node plus a small context margin.

It SHOULD not recenter the entire map after each edit.

## 13. Themes

The app MUST ship with at least four document-level themes:

1. Minimal Light;
2. Soft Branch Colors;
3. Business;
4. Dark.

Theme changes MUST update the live map and exports without modifying node content.

Per-node manual styling is excluded from MVP.

## 14. Import and export

### 14.1 Markdown import

The app MUST import the supported format described in `markdown-format.md`.

Unsupported inline Markdown syntax SHOULD be converted to plain text where safe and accompanied by a warning summary.

### 14.2 Markdown export

Export MUST include:

- root;
- all descendants;
- semantic sibling order;
- supported document metadata;
- no omission caused by collapse state.

### 14.3 SVG export

SVG export MUST:

- include all currently visible nodes and connectors;
- use embedded or system-safe text styling;
- preserve vector clarity;
- include the selected theme background unless transparent background is chosen;
- exclude editing carets, selection outlines, hover states, and UI controls.

### 14.4 PNG export

PNG export MUST support at least:

- 1× and 2× resolution;
- theme background;
- optional transparent background when technically valid.

### 14.5 Filename

Default export filenames SHOULD derive from the document name and use a filesystem-safe form.

## 15. Help and command discovery

A persistent Help button MUST be visible in the application shell.

Activating it opens a searchable Help and Command Center containing:

- keyboard shortcuts grouped by category;
- pointer interaction guidance;
- command descriptions;
- platform-specific key labels;
- Markdown format summary;
- export and local-storage explanation.

The Help interface MUST be fully keyboard accessible.

## 16. Undo and redo

The history system MUST cover:

- node creation;
- text edits;
- deletion;
- reorder;
- reparent;
- promotion;
- side changes;
- collapse/expand if configured as historical;
- theme changes;
- layout mode changes;
- Markdown import as a single transaction.

Viewport-only pan and zoom SHOULD NOT enter semantic undo history.

Typing SHOULD be coalesced into meaningful history units rather than one entry per keystroke.

## 17. Context menu

A node context menu SHOULD provide discoverable alternatives to shortcuts:

- Edit;
- Add sibling;
- Add child;
- Promote;
- Delete branch;
- Collapse/expand;
- Move branch left/right when applicable;
- Center node.

Unavailable commands MUST be disabled or omitted with consistent reasoning.

## 18. Error handling

Errors MUST be actionable and must not destroy the current in-memory document.

Examples:

- malformed Markdown: identify line/range where possible;
- export failure: keep editor state and offer retry;
- local-storage quota failure: warn and encourage immediate file export;
- invalid drag target: reject visually and preserve original structure;
- font-measurement failure: fall back to safe metrics and reflow later.

## 19. Performance expectations

On a contemporary desktop browser, the editor SHOULD:

- keep ordinary typing responsive in maps of at least 500 nodes;
- complete common local layout updates within a perceptually immediate interval;
- avoid full-document rerender on every caret movement;
- avoid blocking the main thread for long image exports without feedback;
- virtualize or optimize only when necessary without changing behavior.

Formal benchmark thresholds may be refined after the first implementation prototype.

## 20. Privacy

The static app MUST not transmit document content by default.

Any future cloud, analytics, or AI feature that sends content externally MUST be opt-in and clearly disclosed.
