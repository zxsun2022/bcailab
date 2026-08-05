# Keyboard Specification

## 1. Goals

The keyboard system must enable complete core authoring without a mouse while remaining compatible with text editing, IME input, browser conventions, and assistive technologies.

Shortcut behavior is defined by context. The application MUST not dispatch a map command solely from key identity without checking focus and interaction state.

## 2. Display conventions

The Help interface MUST display platform-appropriate labels:

| Concept | macOS/iPad hardware keyboard | Windows/Linux |
|---|---|---|
| Primary modifier | `⌘` | `Ctrl` |
| Alternate modifier | `⌥` | `Alt` |
| Shift | `⇧` | `Shift` |
| Backspace | `⌫` | `Backspace` |
| Delete forward | `⌦` where available | `Delete` |

The specification uses `Primary` to mean `⌘` on macOS and `Ctrl` on Windows/Linux.

## 3. Shortcut contexts

Keyboard dispatch checks contexts in this order:

1. Native browser/OS-reserved combination that cannot or should not be overridden;
2. Active modal/dialog/menu;
3. IME composition;
4. Node text editing;
5. Node selected;
6. Canvas focused with no selection;
7. Global application shortcut.

A shortcut listed for a lower-priority context does not run when a higher-priority context consumes it.

## 4. Core creation and structure shortcuts

| Key | Node selected | Node editing | Root behavior | Notes |
|---|---|---|---|---|
| `Enter` | Create sibling | Commit only; keep node selected | Create first-level child when selected | Suppressed during IME composition |
| `Tab` | Create child | Commit and create child | Create first-level child | Prevent browser focus traversal only when node context is active |
| `Shift+Tab` | Promote one level | Commit and promote | No action | First-level node cannot promote |
| `Delete` | Delete subtree | Delete text forward | Root protected | Structural only outside editing |
| `Backspace` | Delete subtree | Delete text backward | Root protected | Structural only outside editing |
| `F2` | Edit and select all | Native/no-op | Edit root | Show only when supported |
| Printable input | Replace and edit | Insert text | Replace and edit | Includes IME-produced text |
| `Escape` | Clear selection | Exit editing/cancel empty new node | Same | Also closes menus/modals first |

> **Amendment (2026-08-04):** D-17 makes Enter mode-dependent: editing Enter commits and exits,
> while selected-node Enter creates the sibling/root child. A newly created empty leaf remains
> in editing as a no-op so repeated Enter cannot accumulate empty nodes.

## 5. Navigation model

### 5.1 Design principle

Navigation follows the visual tree, not raw DOM order.

Because a two-sided mind map has branches extending in opposite directions, left/right keys have side-aware meanings.

### 5.2 Parent/child direction

For a selected node:

- On a right-side branch, inward is Left and outward is Right.
- On a left-side branch, inward is Right and outward is Left.
- On the root, Left targets the nearest/last remembered left first-level branch; Right targets the nearest/last remembered right first-level branch in two-sided mode.
- In right-only mode, root Right targets the first first-level child; root Left has no structural target.

### 5.3 Vertical navigation

`ArrowUp` and `ArrowDown` move to the closest visible node above or below according to layout geometry, with deterministic tie-breaking.

Recommended geometric resolver:

1. consider visible nodes whose vertical center is above/below the current center;
2. prioritize smallest positive vertical distance;
3. weight horizontal distance to avoid jumping across the whole map;
4. prefer nodes on the same branch side;
5. tie-break using document order and node ID.

This is more predictable than pure depth-first order in a spatial map.

### 5.4 Horizontal navigation

| Key concept | Behavior |
|---|---|
| Inward arrow | Select parent |
| Outward arrow, expanded node | Select first visible child |
| Outward arrow, collapsed node | Expand node; selection remains |
| Outward arrow, leaf | No action |
| Inward arrow on root | No action or choose side-specific branch as described |

### 5.5 Root navigation

In two-sided mode:

- `ArrowLeft` from root selects the visually nearest first-level node on the left, preferably the last selected left branch remembered for the document.
- `ArrowRight` from root selects the visually nearest first-level node on the right, preferably the last selected right branch.
- `ArrowUp/Down` from root selects the nearest visible first-level node above/below the root center, regardless of side, with deterministic tie-breaking.

In right-only mode:

- `ArrowRight` selects the first first-level node;
- `ArrowLeft` does nothing;
- `ArrowUp/Down` choose the nearest first-level node geometrically.

### 5.6 Navigation while editing

While text editing:

- arrow keys move the text caret or selection;
- `Home`, `End`, word-jump, and modifier-arrow use platform text behavior;
- no node navigation occurs;
- `Escape` exits editing, after which arrows navigate nodes.

## 6. Navigation shortcut table

| Key | Node selected | Node editing | No selection |
|---|---|---|---|
| `ArrowUp` | Select visual node above | Move caret | No action |
| `ArrowDown` | Select visual node below | Move caret | No action |
| Inward arrow | Select parent | Move caret | No action |
| Outward arrow | Expand or select first child | Move caret | No action |
| `Home` | Select root | Text-line start | Select root when canvas focused |
| `End` | Optional last visible node | Text-line end | No action |
| `PageUp/PageDown` | Optional viewport pan | Native text behavior | Pan viewport |

Normative MVP shortcuts are arrows and `Home`. `End` and page keys are optional and should be omitted from Help if not implemented.

## 7. Collapse and expansion shortcuts

Recommended cross-platform commands:

| Shortcut | Action |
|---|---|
| `Space` | Toggle collapse on selected node with children |
| `Primary+.` | Toggle selected branch collapse, alternative command |
| `Primary+Shift+.` | Expand selected branch fully |
| `Primary+Alt+.` | Collapse selected branch |
| `Primary+Shift+Alt+.` | Expand all |

To avoid obscure combinations, MVP MUST support at least `Space` for toggle and expose global expand/collapse through the Command Center even if direct shortcuts are deferred.

`Space` while text editing inserts a space and never collapses.

`Space` held with pointer drag MAY initiate canvas pan; a movement threshold differentiates click-to-toggle from drag-to-pan when a node is selected. Implementations may instead restrict Space-pan to canvas/no selection to avoid conflict.

Recommended simplification:

- Space key-up toggles collapse only when selected and no pointer gesture occurred.
- Space + pointer drag pans and suppresses toggle.

## 8. History shortcuts

| Shortcut | Action |
|---|---|
| `Primary+Z` | Undo |
| `Primary+Shift+Z` | Redo |
| `Ctrl+Y` | Redo on Windows/Linux |

History shortcuts are application-level and work during node editing. The command layer coalesces the edit session appropriately.

Undo/redo MUST restore selection logically.

## 9. Clipboard shortcuts

### 9.1 MVP requirement

At minimum, ordinary text clipboard behavior MUST work while editing.

Structural subtree clipboard support is strongly recommended but may be phased after the essential MVP if clearly documented.

### 9.2 Structural clipboard behavior

When a node is selected but not editing:

| Shortcut | Action |
|---|---|
| `Primary+C` | Copy selected subtree in internal + plain-text/Markdown form |
| `Primary+X` | Cut selected subtree, root protected |
| `Primary+V` | Paste as sibling after selected node |
| `Primary+Shift+V` | Paste as child of selected node, optional |

Clipboard payload SHOULD include:

- custom MIME JSON for lossless same-app paste where supported;
- plain Markdown outline for interoperability;
- plain text fallback.

When editing text, clipboard shortcuts operate on text only.

### 9.3 Paste hierarchy rules

Pasting a subtree after a selected node:

- generates new node IDs;
- preserves internal hierarchy and order;
- assigns first-level side according to target context;
- creates one history entry;
- selects the pasted root node.

Pasting plain multiline text outside editing MAY offer “Paste as outline” only if the parser can show a predictable result. It must not silently infer complex hierarchy from ambiguous text in MVP.

## 10. View shortcuts

Recommended MVP shortcuts:

| Shortcut | Action |
|---|---|
| `Primary++` or `Primary+=` | Zoom in |
| `Primary+-` | Zoom out |
| `Primary+0` | Reset zoom to 100% |
| `Primary+1` | Fit visible map |
| `Primary+2` | Center selected node or root |

Mapdown intercepts `Primary+0` inside the editor shell to reset canvas zoom to 100%. It does
not intercept `Primary++` or `Primary+-`, which remain browser page-zoom commands.

> **Amendment (2026-08-04):** D-19 makes `Primary+0` the implemented canvas actual-size
> shortcut. It preserves the viewport centre and does not enter semantic history.

Preferred conflict-minimizing alternatives:

| Shortcut | Action |
|---|---|
| `=` / `+` when canvas focused | Zoom in |
| `-` when canvas focused | Zoom out |
| `0` when canvas focused | Reset zoom |
| `F` when canvas focused | Fit map |
| `C` when canvas focused and no text editing | Center selection |

However bare letter shortcuts can interfere with replace-on-type when a node is selected. Therefore final normative rules are:

- Toolbar and Command Center MUST always provide view commands.
- `F` fits only when canvas has focus and no node is selected.
- `0`, `+`, and `-` may control zoom when not editing.
- `Primary+1` may fit map if browser behavior permits.
- Help displays only implemented, tested combinations.

## 11. Selection and application shortcuts

| Shortcut | Action |
|---|---|
| `Escape` | Exit current mode in priority order |
| `Home` | Select root |
| `Primary+A` while editing | Select all node text |
| `Primary+A` while node selected | Reserved for future multi-select; MVP may select all text only after entering editing or do nothing |
| `Primary+K` | Open Command Center, recommended |
| `Primary+/` | Open Help/shortcut list, recommended |
| `?` | Open Help when canvas focused and no node selected, optional |
| `Primary+S` | Export/save Markdown or show Save command, optional |
| `Primary+O` | Open Markdown file, optional if browser interception is safe |
| `Primary+N` | New document, optional if browser interception is safe |

### 11.1 Escape priority

Escape resolves in this order:

1. cancel IME/browser composition if owned by platform;
2. close active submenu/menu;
3. close modal/dialog;
4. cancel node drag;
5. cancel canvas gesture;
6. exit text editing or remove new empty node;
7. clear node selection;
8. no action.

One press performs one level of escape behavior.

## 12. Help and command shortcuts

The application MUST provide one reliable route to Help through a visible button.

Recommended keyboard routes:

- `Primary+/` opens Help directly to shortcuts;
- `Primary+K` opens searchable Command Center;
- `?` opens Help when not editing.

While Help is open:

| Key | Action |
|---|---|
| `Escape` | Close Help |
| `/` or focus search shortcut | Focus search field |
| `ArrowUp/Down` | Move through results |
| `Enter` | Execute selected executable command or open help detail |
| `Tab` | Move through interactive controls |

## 13. Menu mnemonic and focus behavior

Toolbar controls must be reachable by normal Tab navigation.

The editor canvas itself should be one logical Tab stop rather than requiring users to Tab through every node. Internal node navigation uses arrow keys.

When focus enters the canvas:

- restore selected node if available;
- otherwise focus root or retain no selection according to last state;
- announce the current node and navigation instructions to screen readers.

## 14. Keyboard reordering shortcuts

Drag-and-drop is not sufficient for keyboard accessibility.

MVP SHOULD provide command-menu operations for:

- Move node before previous sibling;
- Move node after next sibling;
- Move node to parent level;
- Move node as child of previous/next suitable node;
- Move first-level branch left/right.

Direct shortcuts may be:

| Shortcut | Action |
|---|---|
| `Alt+ArrowUp` | Move before previous sibling |
| `Alt+ArrowDown` | Move after next sibling |
| `Alt+InwardArrow` | Promote |
| `Alt+OutwardArrow` | Reparent under adjacent node, optional |

Because `Alt+Arrow` may be browser history navigation on some platforms, these shortcuts MUST be tested before inclusion. Command Center availability is mandatory; direct keys are optional.

## 15. Shortcut conflicts and prevention rules

### 15.1 Browser shortcuts

The app SHOULD avoid overriding critical browser commands such as:

- close tab/window;
- new browser tab;
- browser back/forward;
- address bar focus;
- developer tools;
- page reload.

If a shortcut is inconsistent across browsers, the Help system must show it only where enabled.

### 15.2 Text input

Bare letter shortcuts MUST NOT run while a node is selected if typing should replace node text.

Therefore commands using bare letters should require canvas/no-selection context or a modifier.

### 15.3 IME

No structural shortcut runs while `isComposing` is true, except commands explicitly verified as safe.

### 15.4 Screen readers

Do not intercept Tab globally outside the canvas node context. A user must be able to leave the editor and reach toolbar/help controls.

Within node editing or node-selected canvas context, Tab creates a child. To allow keyboard users to leave the canvas, support:

- `Escape` to clear selection, then Tab to next application control; and/or
- a documented `Ctrl+Tab` or browser-standard escape route where appropriate.

Recommended accessibility rule:

> When a node is selected, `Escape` clears selection. Once no node is selected, Tab resumes normal focus traversal out of the canvas.

## 16. Canonical user-facing shortcut list

The Help interface should show this concise MVP set by default.

### Create and edit

| Action | Shortcut |
|---|---|
| Edit selected node | Start typing, click text again, or `F2` |
| Create next sibling | `Enter` |
| Create child | `Tab` |
| Promote one level | `Shift+Tab` |
| Finish editing | `Escape` |
| Delete branch | `Delete` or `Backspace` |

### Navigate

| Action | Shortcut |
|---|---|
| Node above/below | `↑` / `↓` |
| Parent | Arrow toward root |
| Child/expand | Arrow away from root |
| Root node | `Home` |

### Branch

| Action | Shortcut |
|---|---|
| Collapse/expand selected branch | `Space` |

### History

| Action | Shortcut |
|---|---|
| Undo | `⌘Z` / `Ctrl+Z` |
| Redo | `⌘⇧Z` / `Ctrl+Shift+Z` |

### Help and view

| Action | Shortcut |
|---|---|
| Open Help | `⌘/` / `Ctrl+/` |
| Open Command Center | `⌘K` / `Ctrl+K` |
| Fit map | through toolbar/Command Center; direct key shown if implemented |

The Help system may reveal advanced shortcuts in a secondary section.

## 17. Required keyboard acceptance scenarios

1. Starting at root, user creates a 3-level, 10-node tree without mouse.
2. Chinese Pinyin composition uses Enter to confirm candidates without accidental sibling creation.
3. User navigates into and out of left and right branches with side-aware arrows.
4. Delete outside editing removes subtree; Delete inside editing removes characters only.
5. Escape removes a newly created empty node and restores anchor selection.
6. Tab creates a child while a node is selected, but normal Tab navigation resumes after selection is cleared.
7. Help opens by button and keyboard, and focus returns correctly.
8. Undo after node creation plus typing removes the node in one action.
9. Space toggles collapse outside editing and inserts a space inside editing.
10. Every core command is accessible through keyboard even if no direct shortcut exists, via Command Center or menu.
