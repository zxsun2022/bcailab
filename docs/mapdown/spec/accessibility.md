# Accessibility Specification

## 1. Scope

The editor must be operable by keyboard and should provide meaningful semantics to screen readers despite its spatial canvas presentation.

Accessibility is not limited to color contrast. It includes:

- focus management;
- logical tree semantics;
- text editing;
- command discoverability;
- alternatives to drag;
- reduced motion;
- zoom and reflow;
- touch target sizing;
- clear errors and status announcements.

## 2. Conformance target

The application SHOULD target WCAG 2.2 AA for applicable web content and controls.

Canvas-like spatial behavior may require custom patterns, but core actions must have accessible equivalents.

## 3. Keyboard access

Every core operation MUST be keyboard accessible:

- enter canvas;
- select root/node;
- navigate visible tree;
- edit text;
- create sibling/child;
- promote;
- delete;
- collapse/expand;
- reorder/reparent through commands;
- change first-level side;
- switch theme/layout;
- import/export;
- open Help;
- leave the canvas.

Drag-and-drop cannot be the only way to reorder or reparent.

## 4. Canvas focus model

### 4.1 One Tab stop

The canvas SHOULD be one logical Tab stop to avoid forcing users through hundreds of nodes with Tab.

Within the canvas:

- arrow keys navigate nodes;
- Home returns to root;
- Enter/Tab create structure according to editor rules;
- Escape clears editing/selection;
- after selection is cleared, Tab can move to the next toolbar/application control.

### 4.2 Implementation pattern

Possible patterns:

- focusable tree container with `aria-activedescendant`;
- roving tabindex on visible node elements;
- hybrid DOM overlay over SVG.

The chosen pattern must produce reliable browser/screen-reader behavior and preserve text input.

### 4.3 Focus visibility

Keyboard focus MUST have a strong visible indicator distinct from hover and not reliant only on color.

The focus indicator must not be clipped at node edges.

## 5. Tree semantics

The semantic structure SHOULD be exposed as a tree:

- root/tree container role;
- node/treeitem role;
- nesting level;
- expanded/collapsed state;
- set size and position where helpful;
- selected state;
- label text.

For a collapsed node:

- expose `aria-expanded="false"`;
- include direct-child count in accessible description.

For a leaf:

- do not expose an expandable state.

If visual DOM ordering differs from semantic order in two-sided layout, accessibility order SHOULD follow semantic document order, with side information announced.

Example announcement:

> “Branch A, level 1, left side, expanded, 3 children, selected.”

## 6. Text editing accessibility

When editing begins:

- focus moves into a standard text input/textarea/contenteditable pattern verified with assistive technology;
- node label is available to screen reader;
- select-all/caret behavior follows declared interaction;
- structural shortcut behavior is documented;
- IME input is supported.

When editing ends:

- focus returns to the selected tree item;
- changes are announced only when useful, avoiding excessive speech per keystroke.

## 7. Status announcements

Use a polite live region for significant asynchronous status:

- Saved on this device;
- Save failed;
- Branch deleted, undo available;
- Branch collapsed, 3 children hidden;
- Branch expanded;
- Imported with 2 warnings;
- Export prepared;
- Invalid move target.

Do not announce every mouse hover, pan, zoom tick, or character input.

## 8. Collapse control

The visual minus/count badge is an actual accessible button or has equivalent semantics.

Accessible names:

- “Collapse ‘Branch A’, 3 direct children”;
- “Expand ‘Branch A’, 3 direct children.”

Target size SHOULD meet or approach 24×24 CSS pixels minimum for desktop and larger for touch. If the visible badge is smaller, the hit target may be expanded invisibly without overlapping node text.

## 9. Alternatives to drag

The node context menu and Command Center MUST expose:

- Move before previous sibling;
- Move after next sibling;
- Promote one level;
- Move into another branch through an accessible dialog/chooser or deterministic adjacent command;
- Move first-level branch left/right.

A future “Move node” dialog may display a searchable tree of valid parents.

MVP minimum:

- sibling reordering via commands;
- promote via Shift+Tab;
- change side via menu;
- reparent through a command/menu workflow that does not require pointer dragging.

## 10. Color and contrast

### 10.1 Text

Node and UI text SHOULD meet WCAG AA contrast against backgrounds.

### 10.2 Focus and selection

Focus indicators need strong contrast against adjacent colors and should use outline/shape in addition to hue.

### 10.3 Branch colors

Branch color is decorative. Users can understand hierarchy through:

- indentation/spatial relation;
- connectors;
- tree semantics;
- node ordering.

No instruction should say only “click the green branch.”

### 10.4 Dark theme

Dark theme must separately validate:

- text contrast;
- connector contrast;
- focus ring;
- disabled states;
- modal and toolbar boundaries.

## 11. Motion and vestibular accessibility

Respect `prefers-reduced-motion`.

When enabled:

- layout transitions snap or use minimal fades;
- zoom/fit does not perform sweeping animated motion;
- drag remains direct;
- no pulsing or unnecessary movement;
- selection does not animate continuously.

Functionality and causality remain understandable without animation.

## 12. Zoom and browser scaling

The app must remain usable at browser zoom up to at least 200% for UI controls.

Canvas zoom and browser zoom are distinct:

- browser zoom enlarges UI and accessibility text;
- canvas zoom changes map scale.

Toolbar and Help must reflow rather than clip at increased browser zoom.

Do not disable browser pinch zoom globally unless necessary for the canvas and carefully scoped.

## 13. Touch and motor accessibility

- Toolbar targets SHOULD be at least 44×44 CSS pixels on touch layouts.
- Collapse controls receive enlarged hit areas.
- Drag thresholds prevent accidental moves.
- Context menu actions provide alternatives to precise drag.
- Zoom controls exist in addition to pinch gestures.
- Hover-only information must also appear on selection/focus.

## 14. Cognitive clarity

- Use consistent wording: sibling, child, parent, branch, root.
- Do not alternate confusingly between “indent,” “nest,” and “child” without explaining synonyms.
- Destructive actions are undoable.
- Help explains local save versus exported file.
- Error messages state what happened and what to do next.
- Avoid excessive simultaneous tips.

## 15. Screen-reader reading order

The semantic order is:

1. root;
2. each root child in stored semantic order;
3. each subtree in pre-order.

This remains true even when branches render on different sides.

Each first-level node announces left/right visual side so screen-reader users receive equivalent spatial context.

Collapsed descendants are excluded from active tree traversal but remain in document/export.

## 16. Menus and dialogs

Menus:

- use standard menu semantics where appropriate;
- support arrows, Enter, Escape;
- return focus to invoking node.

Dialogs:

- have accessible names/descriptions;
- trap focus;
- close with Escape unless destructive operation is in a critical commit phase;
- return focus correctly;
- expose validation errors in text.

## 17. Help accessibility

Shortcut symbols require readable alternatives.

Example visual:

```text
⌘ ⇧ Z
```

Accessible text:

> Command plus Shift plus Z

Search results announce count and selected command.

Categories can be navigated without pointer.

## 18. Error handling

Errors must not be color-only.

A save failure includes:

- visible icon/text;
- live-region announcement;
- export action;
- persistent status until resolved.

An invalid drag target has a keyboard-equivalent disabled command reason.

## 19. Testing matrix

At minimum test:

- keyboard-only in Chrome, Safari, Firefox, Edge where supported;
- VoiceOver on macOS/iOS;
- NVDA on Windows;
- high contrast/forced colors where feasible;
- 200% browser zoom;
- reduced motion;
- dark theme;
- Chinese IME;
- touch interactions on iPad/mobile viewport;
- hundreds of nodes in semantic tree navigation.

## 20. Accessibility acceptance criteria

1. User can create, edit, navigate, collapse, delete, undo, export, and open Help without a mouse.
2. User can leave the canvas using keyboard.
3. Screen reader announces node label, level, selected state, side, and expansion state.
4. Hidden descendants are not focusable.
5. Collapse badge has an action-oriented accessible name.
6. Every drag operation has a non-drag alternative.
7. Reduced motion removes substantial movement.
8. Help and export dialogs trap and restore focus correctly.
9. Local save failure is announced and offers export.
10. Theme does not make focus or text illegible.
