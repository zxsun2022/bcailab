# Product Roadmap and Scope Control

## 1. Roadmap principle

The project should earn complexity in stages.

The core editor is valuable only if tree editing, layout stability, portability, and recovery are excellent. Feature breadth must not precede interaction reliability.

## 2. Phase 0 — Specification and technical spikes

Goals:

- finalize this specification;
- prototype node text measurement;
- prototype variable-size tidy-tree layout;
- verify left/right arrow navigation;
- verify IME behavior in target browsers;
- verify SVG export with Chinese text;
- test IndexedDB snapshot/recovery.

Deliverables:

- no production feature promises beyond validated behavior;
- small disposable prototypes allowed;
- decisions recorded back into specification.

Exit criteria:

- no unresolved architectural blocker for WYSIWYG text editing, automatic layout, or Markdown round trip.

## 3. Phase 1 — Core semantic editor

Scope:

- document/root/node model;
- command layer;
- selection and editing state machine;
- Enter/Tab/Shift+Tab;
- delete;
- undo/redo;
- right-only automatic layout;
- keyboard navigation;
- minimal theme;
- local autosave;
- canonical Markdown export.

Excluded:

- two-sided layout;
- drag-and-drop;
- image export;
- multiple themes;
- full Help center.

Internal milestone only. Not a public MVP unless polished enough.

## 4. Phase 2 — Production MVP

This is the public version 1.0 described by the specification.

### 4.1 Required content features

- plain-text nodes;
- unlimited practical hierarchy;
- create sibling/child;
- promote;
- delete subtree;
- reorder/reparent;
- collapse/expand;
- complete undo/redo.

### 4.2 Required layout/view

- right-only layout;
- two-sided stable layout;
- branch side movement;
- pan/zoom;
- fit map;
- center selection/root;
- four themes;
- reduced motion.

### 4.3 Required data/file

- IndexedDB local autosave;
- recovery snapshots;
- Markdown import;
- Markdown export;
- SVG export;
- PNG export;
- clear local-save warning/status.

### 4.4 Required discovery/accessibility

- visible Help button;
- searchable shortcuts/commands;
- pointer guide;
- keyboard-only core workflow;
- non-drag structural commands;
- tree semantics and focus management.

## 5. Phase 3 — Outline view and interoperability

Potential features:

- synchronized outline view;
- switch between map and outline without content conversion;
- drag/reorder in outline;
- paste as outline with preview;
- copy selected branch as Markdown;
- export selected branch;
- optional split map/outline view;
- standard Markdown source preview, read-only at first.

Decision gate:

- outline view must use the same node model;
- it must not become a separate competing document state;
- shortcuts may differ where conventions demand, but differences must be explicit.

## 6. Phase 4 — Lossless portable format

Potential features:

- `.mind.md` profile;
- persistent node IDs;
- branch side preservation;
- optional collapse state;
- migration/versioning;
- import/export profile selector.

Decision gate:

- portable Markdown must remain readable outside the app;
- metadata must not dominate content;
- standard clean Markdown export remains available.

## 7. Phase 5 — Document management and installation

Potential features:

- recent local documents;
- rename/duplicate/delete;
- PWA installation;
- offline asset cache;
- direct file save through File System Access API;
- recovery history UI;
- export/import local archive.

Explicit boundary:

- no cloud account is required;
- document library remains lightweight and local-first.

## 8. Phase 6 — Optional cloud sync

Only after local-first behavior is mature.

Potential:

- encrypted account sync;
- conflict detection;
- version history;
- shareable read-only links;
- optional collaboration.

Decision gates:

- local-only mode remains functional;
- content transmission is explicit;
- conflict behavior is specified before implementation;
- static deployment may gain an optional backend, but core editor remains separable.

## 9. Potential future features requiring separate specs

These are not implicitly approved by appearing here.

### 9.1 Rich text

Bold, italic, links, code, and manual line breaks would affect:

- node editor;
- text measurement;
- Markdown mapping;
- clipboard;
- export;
- accessibility.

Requires a dedicated specification.

### 9.2 Icons/images/attachments

Would affect:

- node size;
- storage;
- static hosting;
- export;
- Markdown portability;
- security.

Not a small extension.

### 9.3 Multiple structures

Org chart, fishbone, timeline, matrix, logic chart, and per-branch structures would fundamentally expand layout semantics.

They should not be added as theme variants.

### 9.4 Arbitrary relationships

Cross-links turn the tree into a graph and require:

- edge editing;
- Markdown extension;
- routing;
- selection and deletion rules;
- accessibility semantics.

Separate product layer.

### 9.5 AI assistance

Possible later commands:

- expand a selected topic;
- summarize a branch;
- generate outline from text;
- translate nodes.

Requirements before implementation:

- explicit data transmission consent;
- preview before commit;
- one undoable transaction;
- no dependence for core editing;
- privacy and cost disclosure.

### 9.6 Collaboration

Real-time collaboration requires separate specifications for:

- identity;
- presence;
- conflict resolution/CRDT or OT;
- permissions;
- offline merge;
- history;
- comments.

It is not part of the static MVP.

## 10. Explicit non-goals for version 1.0

- images or icons in nodes;
- attachments;
- rich text;
- notes panel;
- tasks, dates, reminders;
- multiple root topics;
- free-floating nodes;
- relationship arrows;
- boundaries/summaries like full XMind;
- equations;
- tables;
- audio/video;
- real-time collaboration;
- cloud accounts;
- AI generation;
- mobile-first authoring;
- plugin system;
- per-node styling;
- manual coordinates;
- presentation/slides mode;
- PDF export;
- FreeMind/XMind proprietary import.

Omitting these is a scope decision, not an implementation failure.

## 11. Scope-change rubric

A proposed feature should be evaluated against:

1. Does it preserve the ordered-tree semantic model?
2. Can it round-trip through Markdown or clearly separate view metadata?
3. Does it keep keyboard-first operation?
4. Does it create manual geometry?
5. Does it increase content-loss risk?
6. Can it be undone as one or more clear commands?
7. Can it be explained in Help without exceptions?
8. Is it accessible without pointer precision?
9. Does it degrade large-map performance?
10. Is it essential before current core behavior is excellent?

A feature that fails several questions should be deferred or designed as a separate layer.

## 12. Suggested implementation sequence within MVP

1. Data invariants and commands.
2. Right-only layout with measured text.
3. Selection/editing/IME.
4. Keyboard creation/navigation.
5. History.
6. Collapse visible projection.
7. Local save/recovery.
8. Markdown import/export.
9. Two-sided sticky branches.
10. Drag/drop and accessible move commands.
11. Pan/zoom/fit.
12. Theme tokens and presets.
13. SVG export.
14. PNG export.
15. Help/Command Center.
16. Accessibility hardening.
17. Performance and regression pass.

## 13. Decision log baseline

The following version-1.0 decisions should not be casually reopened during implementation:

- one root;
- plain text only;
- no manual node line breaks;
- click selects before editing;
- Enter commits in editing mode and creates a sibling/root child in selected mode;
- Tab child;
- Shift+Tab promote;
- stable first-level side;
- direct-child number on collapsed badge;
- standard Markdown omits collapse and branch side;
- image export reflects visible state;
- Markdown export includes complete state;
- local-first/no account;
- document-level preset themes;
- visible searchable Help.

A change requires updating this document, relevant normative docs, tests, and version notes.
