# Help and Command Center Specification

## 1. Purpose

The Help and Command Center makes the editor’s interaction model discoverable without requiring external documentation.

It combines:

- keyboard shortcut reference;
- searchable commands;
- pointer interaction guide;
- Markdown/import/export explanation;
- local-storage explanation;
- brief onboarding.

The feature must remain useful both to first-time users and experienced keyboard users.

## 2. Entry points

### 2.1 Visible Help button

A Help button MUST be visible in the application shell.

Recommended presentation:

- question-mark icon plus accessible name “Help and shortcuts”;
- located in top-right toolbar or stable global area;
- not hidden only in an overflow menu on desktop;
- available on mobile through a clearly labeled menu item if space is constrained.

### 2.2 Keyboard entry

Recommended:

- `Primary+/` opens Help focused on shortcuts;
- `Primary+K` opens Command Center search;
- `?` may open Help when the canvas has focus and no text editing is active.

The Help button remains the normative path even if shortcuts conflict on a platform.

### 2.3 Contextual entry

A small first-run hint MAY include “Press ⌘/ or Ctrl+/ for shortcuts.”

Empty-state or onboarding tips may link to relevant Help sections.

## 3. Surface model

MVP may implement Help and Command Center as one modal with two modes:

1. **Browse Help**
2. **Search Commands**

Recommended desktop layout:

```text
┌──────────────────────────────────────────────────┐
│ Help & Commands                             Close │
│ [ Search actions and shortcuts...                ]│
├───────────────┬──────────────────────────────────┤
│ Getting Started│ Selected section/results         │
│ Create & Edit  │                                  │
│ Navigate       │                                  │
│ Branches       │                                  │
│ View           │                                  │
│ Files & Export │                                  │
│ Markdown       │                                  │
│ Local Storage  │                                  │
│ Accessibility  │                                  │
└───────────────┴──────────────────────────────────┘
```

On narrow screens, categories become tabs, accordions, or a back-navigation list.

## 4. Content categories

### 4.1 Getting started

Concise workflow:

1. Click/select the root and type.
2. Enter creates a sibling/first-level topic.
3. Tab creates a child.
4. Shift+Tab promotes a node.
5. Arrow keys navigate after leaving text editing.
6. Space collapses/expands a branch.
7. Work saves locally; export Markdown for a durable copy.

This section should be no more than one screen of concise content.

### 4.2 Create and edit

Includes:

- select vs edit distinction;
- start typing to replace selected text;
- click selected text to place caret;
- Enter/Tab/Shift+Tab;
- Delete outside editing versus inside editing;
- Escape behavior;
- undo/redo;
- empty-node cancellation.

### 4.3 Navigate

Includes:

- up/down visual navigation;
- arrow toward root = parent;
- arrow away from root = child/expand;
- side-aware behavior;
- Home = root;
- leaving editing before structural navigation.

### 4.4 Branches

Includes:

- collapse control outward-edge behavior;
- minus means collapse;
- number means direct children hidden;
- Space toggle;
- drag/reorder/reparent;
- move first-level branch left/right.

### 4.5 View

Includes:

- pan;
- zoom;
- fit map;
- center selection/root;
- layout modes;
- themes.

### 4.6 Files and export

Includes:

- local autosave;
- open Markdown;
- export Markdown/SVG/PNG;
- complete Markdown versus visible-state images;
- browser-storage limitations.

### 4.7 Markdown format

Shows a short example:

```markdown
# Root

- Branch
  - Child
```

Explains:

- root is a level-1 heading;
- list indentation is hierarchy;
- standard Markdown does not preserve collapse/view state.

### 4.8 Accessibility

Includes:

- canvas as one Tab stop;
- Escape clears selection so Tab can leave;
- screen-reader navigation summary;
- reduced-motion support;
- how to access every command without drag.

### 4.9 About/privacy

Briefly states:

- static/local-first model;
- content is not uploaded by default;
- current app/spec version;
- link to external documentation/source repository if available.

## 5. Shortcut list design

### 5.1 Grouping

Shortcuts MUST be grouped by action category, not presented as one long undifferentiated table.

Default groups:

- Create and edit;
- Navigate;
- Branches;
- History;
- View;
- Files;
- Help.

### 5.2 Platform labels

The UI detects platform conventions and displays:

- `⌘` on macOS;
- `Ctrl` on Windows/Linux;
- clear text labels for accessibility.

A platform selector MAY allow users to view another platform’s keys.

### 5.3 Keycap component

Visual keycaps should:

- be readable at normal zoom;
- not rely solely on symbols unfamiliar to screen readers;
- include accessible text such as “Command plus Z”;
- support sequences and alternatives.

### 5.4 Context labels

Where behavior depends on context, show it.

Example:

| Shortcut | Action | Context |
|---|---|---|
| Delete | Delete selected branch | Node selected, not editing |
| Delete | Delete character | Text editing |

Avoid hiding important context in tooltips only.

## 6. Search

### 6.1 Searchable fields

Search indexes:

- command name;
- synonyms;
- description;
- category;
- shortcut key names;
- related concepts;
- localized terms.

Examples:

- `child` finds “Create child — Tab”;
- `subtopic` finds the same command;
- `delete` finds node deletion and text-deletion explanation;
- `zoom` finds zoom in/out/reset/fit;
- `markdown` finds import/export and format help;
- `collapse` finds toggle and global collapse commands.

For a Chinese UI, searches such as “子节点”“缩进”“收起”“导出” should return the corresponding commands, while English aliases may also work.

### 6.2 Search ranking

Recommended ranking:

1. exact command-name match;
2. prefix match;
3. synonym match;
4. shortcut-key match;
5. description/category match.

Frequently used or context-relevant commands MAY receive a small boost, but deterministic results are preferable initially.

### 6.3 No results

Show:

- clear “No matching command” state;
- suggested categories;
- no fabricated help content.

## 7. Executable commands

The Command Center may execute safe commands directly.

Examples:

- Create child;
- Fit map;
- Toggle layout;
- Change theme;
- Export Markdown;
- Expand all;
- Center root.

### 7.1 Availability

Commands have states:

- available;
- disabled with reason;
- hidden if irrelevant.

Example:

> Promote node — unavailable because a first-level node cannot be promoted.

### 7.2 Execution

When executing a command:

- close the Command Center unless the command opens another dialog;
- restore focus logically;
- preserve selected node context;
- create normal undo/history entries where applicable;
- announce result accessibly.

## 8. Context-aware recommendations

When opened with a selected node, the Command Center SHOULD prioritize node-relevant actions:

- Edit node;
- Add sibling;
- Add child;
- Collapse/expand;
- Delete branch;
- Move left/right where applicable.

When no node is selected, prioritize:

- New/open;
- Fit map;
- center root;
- layout/theme;
- export;
- Help topics.

Context changes ranking, not command meaning.

## 9. First-run onboarding

### 9.1 Principle

Onboarding should teach through the real canvas rather than block it with a long tutorial.

### 9.2 Recommended sequence

A compact, dismissible hint near the root:

> Type your topic. Press Enter for the next topic and Tab for a subtopic.

After first node creation, optional second hint:

> Press Escape to leave editing, then use arrow keys to navigate.

After first collapsible branch, optional hint near control:

> Hover or select a branch to collapse it.

Stop after a few successful actions. Do not create a mandatory tour.

### 9.3 Persistence

Store dismissed/completed onboarding flags as preferences, not document content.

Help always remains available.

## 10. Tooltips

Toolbar icons MUST have text tooltips and accessible names.

Shortcut tooltips may display:

```text
Undo  ⌘Z
```

Tooltips are supplementary; no required knowledge may exist only in a hover tooltip.

Collapse badge tooltip may state:

> Expand branch — 3 direct children, 17 total descendants

The badge itself shows only direct-child count.

## 11. Focus and modal behavior

### 11.1 Opening

When Help opens:

- move focus to search field or modal heading depending on entry route;
- store the invoking focus target;
- trap keyboard focus within the modal;
- prevent map shortcuts from firing.

### 11.2 Closing

On Escape or close:

- restore focus to invoking Help button or selected node;
- retain map selection and viewport;
- retain search query only during the current session, optional.

### 11.3 Screen readers

The modal requires:

- accessible name;
- category navigation semantics;
- result count announcements;
- command availability states;
- key combinations expressed in readable text.

## 12. Localization readiness

Command definitions SHOULD separate:

- stable command ID;
- localized name;
- localized description;
- localized synonyms;
- platform-specific shortcut rendering.

Do not hardcode searchable English strings into event handlers.

The initial product may ship in one language, but architecture should support Chinese and English.

## 13. Command registry

All user-executable actions SHOULD be registered centrally:

```ts
interface CommandDefinition {
  id: string;
  title: string;
  description: string;
  category: string;
  keywords: string[];
  shortcuts: ShortcutBinding[];
  isAvailable(context): boolean;
  unavailableReason?(context): string;
  execute(context): void | Promise<void>;
}
```

Benefits:

- Help list cannot drift from actual shortcuts;
- menus and Command Center share labels;
- availability rules remain consistent;
- tests can verify every command is discoverable;
- localization is centralized.

The user-facing shortcut list MUST be generated from or validated against the actual command registry.

## 14. Minimum Help content for MVP

MVP is incomplete unless Help includes:

1. select versus edit explanation;
2. complete canonical shortcut list;
3. side-aware arrow navigation;
4. collapse badge meaning;
5. drag-and-drop hierarchy behavior;
6. local autosave caveat;
7. Markdown complete-content export rule;
8. image visible-state export rule;
9. keyboard route out of canvas;
10. platform-specific shortcut labels.

## 15. Acceptance criteria

- Help is reachable by visible button without knowing a shortcut.
- Help is reachable and closable by keyboard.
- Searching “child” or localized equivalent returns Create child with Tab.
- Searching a shortcut key such as “Shift Tab” returns Promote node.
- Disabled commands explain why.
- Displayed shortcuts match actual behavior.
- Opening/closing Help does not lose current text edits or selection.
- Screen-reader focus stays inside modal and returns correctly.
- Narrow-screen Help remains usable.
- No required command exists only in documentation outside the app.
