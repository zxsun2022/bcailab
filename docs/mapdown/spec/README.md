# Mapdown Specification

**Product name:** Mapdown  
**Document version:** 1.0  
**Status:** Product and interaction baseline  
**Primary deployment model:** Static website, local-first, no mandatory backend  
**Primary content format:** Markdown

## 1. Purpose of this document set

This repository defines the product behavior of a lightweight, Markdown-native mind-map editor before implementation begins.

The documents are intentionally technology-neutral. A React, Vue, Svelte, Solid, vanilla TypeScript, SVG, Canvas, or hybrid implementation may all be valid, provided the observable behavior complies with this specification.

The specification is normative. In the documents:

- **MUST** means the behavior is required for the stated release.
- **SHOULD** means the behavior is strongly recommended and may be omitted only for a documented reason.
- **MAY** means the behavior is optional.
- **MVP** means the first production-quality public release, not a throwaway prototype.

## 2. Product definition

Mapdown is a browser-based, WYSIWYG, keyboard-first mind-map editor whose semantic source is a Markdown tree.

It is not intended to be:

- a full clone of XMind;
- a free-position drawing canvas;
- a collaborative whiteboard;
- a rich-media knowledge base;
- a project-management suite;
- a cloud-first note-taking service.

Its core promise is:

> Open the site, create a structured mind map immediately, edit it fluently with the keyboard, let the application arrange it automatically, and export the complete content as standard Markdown or a high-quality image.

## 3. Document map

| File | Scope |
|---|---|
| `vision.md` | Product philosophy, user value, boundaries, design principles |
| `product-specification.md` | Complete functional product requirements |
| `data-model.md` | Document, node, view-state, command, and history models |
| `interaction.md` | Pointer, focus, selection, editing, drag, collapse, and state-machine rules |
| `keyboard.md` | Complete keyboard behavior and shortcut-resolution rules |
| `markdown-format.md` | Markdown import, export, normalization, and metadata format |
| `layout-engine.md` | Automatic layout, stability, side assignment, spacing, and animation |
| `theme.md` | Theme tokens, presets, branch colors, contrast, and customization scope |
| `storage-export.md` | Local persistence, recovery, file handling, SVG/PNG/Markdown export |
| `help-command-center.md` | Help button, shortcut list, command search, and onboarding |
| `accessibility.md` | Keyboard accessibility, screen-reader semantics, reduced motion, contrast |
| `testing-acceptance.md` | Acceptance tests, invariants, regression suite, release gates |
| `phases.md` | MVP scope, later phases, explicit non-goals, decision gates |
| `glossary.md` | Shared terminology |

Two editorial changes were made when this baseline entered the repo (see
`../decisions.md`, D-07): the product was renamed from its working name to **Mapdown**, and
the file the document map originally called `roadmap.md` is checked in as `phases.md`, because
in this repo `docs/roadmap.md` is the reserved single source of truth for iteration planning.
The upstream combined single-file edition was deliberately not copied, to avoid two
copies of every normative statement drifting apart.

**This baseline has since been amended.** It is no longer pristine v1.0. Every amendment carries
an inline `> **Amendment (date)**` note at the point of change and a matching record in
`../decisions.md`, so the delta from v1.0 is readable both from the spec and from the log:

| Amendment | Section | Kind |
|---|---|---|
| D-08 | `theme.md` §10, §10.1 | Normative — toolbar tokens removed from `ControlTokens` |
| D-09 | `markdown-format.md` §14.3 | Presentation — rule restated, unchanged |
| D-16 | `storage-export.md` §5.1 | Normative — active text drafts included in autosave snapshots |
| D-17 | `product-specification.md` §§5–6; `interaction.md` §§4, 6, 9; `keyboard.md` §4 | Normative — editing Enter commits only; selected Enter creates |
| D-18 | `storage-export.md` §11.3 | Normative — downloads are named from the root label |
| D-19 | `keyboard.md` §10 | Normative — `Primary+0` resets canvas zoom to 100% |

## 4. Normative product decisions

The following decisions are fixed for version 1.0 unless changed through a recorded specification revision:

1. A document has exactly one root node.
2. Nodes contain plain text only.
3. Manual line breaks inside a node are not supported in MVP; text wraps visually.
4. Clicking a node selects it; text input or a second text-area click enters editing.
5. `Enter` commits while editing; when the node is selected, it creates a sibling or a first-level node from the root.
6. `Tab` creates a child.
7. `Shift+Tab` promotes the selected node by one level.
8. Deleting a node deletes its full subtree and is undoable.
9. The editor supports right-only and two-sided layouts.
10. A first-level branch keeps a stable side assignment in two-sided layout.
11. Collapse controls appear on the outward edge of a branch.
12. A collapsed badge shows the number of direct children.
13. Markdown export always includes all nodes, including currently hidden descendants.
14. Image export reflects the current expanded/collapsed visual state.
15. The application autosaves locally and does not require an account.
16. Themes apply at document level; per-node visual styling is not part of MVP.
17. Undo and redo are required core capabilities.
18. A visible Help button opens a searchable keyboard and command reference.

## 5. Change control

A change that affects one of the following MUST update the relevant specification before or in the same change as implementation:

- node creation, deletion, movement, or hierarchy;
- keyboard behavior;
- Markdown round-trip behavior;
- layout side assignment or ordering;
- undo/redo boundaries;
- storage or recovery behavior;
- export output;
- accessibility semantics;
- visual tokens used by themes.

Implementation-specific notes should live outside this product specification unless they affect observable behavior.

## 6. Recommended implementation workflow

1. Read `vision.md` and `product-specification.md`.
2. Implement the data model and command layer from `data-model.md`.
3. Implement state transitions from `interaction.md`.
4. Add keyboard dispatch from `keyboard.md`.
5. Implement deterministic layout from `layout-engine.md`.
6. Add serialization from `markdown-format.md`.
7. Add persistence and export from `storage-export.md`.
8. Add themes, help, and accessibility.
9. Run the complete acceptance suite in `testing-acceptance.md`.

## 7. Definition of done for version 1.0

Version 1.0 is complete only when a user can:

- open the static site without signing in;
- create and edit a multi-level map using only the keyboard;
- select, collapse, expand, reorder, reparent, delete, undo, and redo nodes;
- switch between right-only and two-sided structures without content loss;
- reload the browser and recover the last local document;
- import a supported Markdown outline;
- export semantically equivalent Markdown;
- export a legible SVG and PNG;
- open the Help interface and discover every supported shortcut;
- perform all core actions without a mouse.
