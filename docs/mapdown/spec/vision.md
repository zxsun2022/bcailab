# Product Vision and Principles

## 1. Product vision

Mapdown turns structured text into a spatial thinking interface without requiring the user to manage layout manually.

The product should feel closer to writing an outline than drawing a diagram. The user supplies structure and wording; the editor supplies geometry, spacing, color, connection lines, and viewport management.

The central design proposition is:

> The semantic document is a tree. The mind map is a live projection of that tree.

This distinction prevents the product from drifting into a general-purpose drawing tool.

## 2. Primary users

The primary user:

- thinks in hierarchical structures;
- wants fast keyboard entry;
- values portable text files;
- does not want to sign in before writing;
- wants attractive output without manual formatting;
- may use the map for study notes, article structure, product planning, meeting notes, technical decomposition, or Buddhist-study outlines;
- may later edit the exported Markdown in another editor.

The product also serves occasional users who prefer clicking, but keyboard fluency is the primary interaction benchmark.

## 3. Core jobs to be done

### 3.1 Capture structure quickly

When an idea branches into subtopics, the user needs to create siblings and children without leaving the keyboard.

### 3.2 Preserve semantic ownership

The user should be able to export the complete structure into a human-readable, tool-independent Markdown file.

### 3.3 Reduce formatting work

The user should not have to manually align nodes, route lines, balance branches, or repair overlaps.

### 3.4 Maintain spatial memory

When content changes, the map should move only as much as necessary. Existing branches should not unexpectedly switch sides or reorder themselves.

### 3.5 Produce shareable output

The user should be able to export a clear SVG or PNG that matches the visible map.

## 4. Product principles

### 4.1 Markdown-native, not Markdown-themed

Markdown is not merely an export option. It is the canonical semantic representation of the hierarchy.

The internal runtime model may be a normalized node tree, but that model MUST round-trip to the documented Markdown subset without semantic loss.

### 4.2 Local-first

The default workflow MUST work without authentication or network persistence.

Local-first means:

- edits are saved automatically on the current device;
- the user can export a durable file at any time;
- a backend may be added later, but local use remains viable;
- loss of network connectivity does not interrupt editing after the app has loaded.

### 4.3 Keyboard-first

Every core content operation MUST be possible with the keyboard:

- create sibling;
- create child;
- promote node;
- navigate visible nodes;
- edit text;
- delete subtree;
- undo and redo;
- collapse and expand;
- invoke help;
- fit or center the map;
- export through an accessible command or menu.

Keyboard-first does not mean pointer-hostile. Pointer behavior should remain discoverable and natural.

### 4.4 WYSIWYG

The user edits node text in place. There is no separate source pane in MVP.

The application MAY later provide an outline or Markdown-source view, but it MUST not make the direct map editor secondary.

### 4.5 Automatic layout

The user controls hierarchy, order, branch side, theme, and collapse state. The application controls exact coordinates.

Manual free-positioning is excluded because it creates persistent geometry that conflicts with Markdown portability and automatic reflow.

### 4.6 Stable layout over mathematically perfect balance

A map that preserves the user’s spatial memory is better than a map that continuously recomputes an optimal but surprising arrangement.

Therefore:

- branch side assignment is sticky;
- sibling order is semantic and stable;
- local edits SHOULD cause local movement;
- unchanged distant branches SHOULD remain visually stable where possible.

### 4.7 Content before decoration

Themes should make maps attractive immediately, but styling must not become a second editing system.

MVP excludes:

- arbitrary node colors;
- per-node fonts;
- stickers;
- icons;
- images;
- hand-drawn annotations;
- multiple connector styles within one document.

### 4.8 Reversible actions

Any destructive or structural action MUST be undoable.

A confirmation dialog should not replace a reliable history system. Frequent confirmation prompts interrupt flow and train users to dismiss warnings.

### 4.9 Discoverable power

Keyboard shortcuts should be fast for experienced users and visible to new users.

The Help and Command Center is a first-class product surface, not an afterthought.

### 4.10 Deterministic behavior

Given the same normalized document, theme metrics, layout mode, and viewport-independent layout settings, the map geometry SHOULD be deterministic.

Determinism enables:

- reliable tests;
- stable exports;
- reproducible bug reports;
- predictable undo/redo;
- easier collaboration in future versions.

## 5. Product boundaries

### 5.1 Included conceptual model

- one rooted ordered tree;
- plain-text node labels;
- two visual structures;
- document-level themes;
- temporary view state;
- local persistence;
- Markdown and image export.

### 5.2 Excluded conceptual models

- arbitrary graph edges;
- multiple parents;
- backlinks;
- tables inside nodes;
- attachments;
- comments;
- tasks with due dates;
- real-time collaboration;
- slide presentation mode;
- freehand drawing;
- nested mind maps with separate canvases;
- automatic AI generation in the core editor.

These may become separate layers later, but they must not distort the tree-first model.

## 6. Quality attributes

The product SHOULD optimize for:

1. **Responsiveness:** text entry must feel immediate.
2. **Predictability:** shortcuts have consistent meanings.
3. **Recoverability:** a reload or accidental deletion should not destroy work.
4. **Portability:** content remains readable outside the application.
5. **Legibility:** default maps require no styling work.
6. **Accessibility:** keyboard and assistive-technology users can perform core tasks.
7. **Scalability:** ordinary maps with hundreds of nodes remain usable.
8. **Maintainability:** behavior is centralized in commands and state machines rather than scattered UI event handlers.

## 7. Experience targets

A first-time user should be able to discover within one minute that:

- Enter creates the next topic;
- Tab creates a subtopic;
- nodes can be selected and edited directly;
- branches can be collapsed;
- a Help button exposes all shortcuts;
- the document can be exported as Markdown.

An experienced user should be able to create a 30-node outline without touching the mouse.

## 8. Product success criteria

The MVP is successful when users can describe it as:

- faster than manually drawing a mind map;
- simpler than a full desktop mind-map suite;
- safer than a proprietary-only document format;
- more visual than a plain Markdown outline;
- usable immediately without setup.

## 9. Design anti-patterns

The following are considered product regressions:

- a new child causes unrelated branches to swap sides;
- a shortcut behaves differently depending on an undocumented focus condition;
- image export omits visible content;
- Markdown export omits collapsed descendants;
- a browser refresh loses recent edits without warning;
- clicking a collapse badge unexpectedly enters text editing;
- drag-and-drop silently changes hierarchy without a clear indicator;
- theme changes alter document semantics;
- import accepts ambiguous structures but silently changes their meaning.
