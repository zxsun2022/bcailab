# Local Storage, File Handling, and Export Specification

## 1. Purpose

The application is a static site but must behave like a dependable local editor.

This document defines:

- local persistence;
- recovery;
- document list behavior;
- browser storage failures;
- opening and saving files;
- Markdown, SVG, and PNG export;
- separation between semantic save and viewport state.

## 2. Persistence principles

1. The current document must survive ordinary reloads.
2. Typing must not wait for storage writes.
3. Storage failure must be visible and actionable.
4. Local browser persistence is not presented as a durable backup.
5. Exported Markdown is the user-controlled durable source.
6. The app does not require a server or account.
7. No document content is transmitted by default.

## 3. Storage layers

### 3.1 In-memory active state

The active runtime document is the immediate source for rendering and commands.

Every successful command updates memory synchronously before autosave.

### 3.2 IndexedDB

IndexedDB SHOULD be the primary persistent store because documents, snapshots, and history metadata may exceed localStorage limits.

Conceptual stores:

```text
documents
snapshots
documentIndex
preferences
recoveryJournal
```

### 3.3 localStorage

localStorage MAY contain only small bootstrap pointers or preferences, such as:

- last active document ID;
- last successful app schema version;
- first-run/onboarding flags.

Large document JSON MUST not rely on localStorage.

### 3.4 File System Access API

Where supported and explicitly authorized, the application MAY keep a file handle for direct save.

This is progressive enhancement. Core behavior must work through standard file download/upload.

## 4. Local document index

Even if MVP initially exposes only the last document, the storage model SHOULD maintain a minimal index:

```ts
interface LocalDocumentIndexEntry {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  nodeCount: number;
  lastSnapshotId: string;
  sourceFilename?: string;
}
```

A future recent-documents screen can use this without changing storage.

MVP user interface MAY expose:

- current document;
- New;
- Open Markdown;
- Recover last local document.

A full folder/tag/library system is excluded.

## 5. Autosave

### 5.1 Trigger

A save is scheduled after:

- text change commit/update;
- node creation/deletion/move;
- collapse/expand;
- theme/layout change;
- import;
- document-title change.

> **Amendment (2026-08-04):** “text change update” includes the visible draft in an active
> editing surface, before Enter, Escape or blur commits the editing session to document history.
> Autosave snapshots MUST include that draft without creating per-keystroke undo entries or
> forcing per-keystroke layout. The UI MUST NOT report “Saved on this device” for a snapshot
> that is older than the visible draft.

Viewport changes MAY be saved separately at a lower frequency.

### 5.2 Debounce

Text changes SHOULD use a short debounce to avoid a write per keystroke, while structural commands may be saved promptly.

Recommended behavior:

- mark state dirty immediately;
- schedule save after approximately 300–800 ms of inactivity;
- force save on page visibility change, modal file operation, or before unload where browser permits;
- never block text input.

The exact interval is implementation-specific and should be tested under rapid input.

### 5.3 Serialization snapshot

A local snapshot includes:

- complete `MindMapDocument`;
- collapse and side state;
- current layout and theme;
- optional viewport;
- selected node ID, optional;
- schema version;
- checksum or validation metadata;
- save timestamp.

Undo history MAY be persisted, but MVP is not required to restore undo across a full browser restart. If omitted, this must be acceptable and documented.

### 5.4 Atomicity

A save MUST not overwrite the last valid snapshot before the new snapshot is completely serialized and committed.

Recommended pattern:

1. write new snapshot with temporary/new ID;
2. validate/complete transaction;
3. update document index pointer;
4. retain a bounded number of prior snapshots;
5. prune old snapshots asynchronously.

## 6. Recovery journal

To reduce loss from crashes between debounced saves, the app SHOULD maintain a lightweight recovery journal or more frequent small snapshot.

Options:

- command journal since last full snapshot;
- frequent full snapshot for ordinary map sizes;
- pending serialized state in IndexedDB.

Recovery MUST validate tree invariants before activation.

If the latest state is invalid:

- try the previous valid snapshot;
- notify the user that an earlier recovery point was opened;
- preserve invalid data for diagnostic export where possible.

## 7. Save status

The UI should distinguish:

- **Saved locally** — current revision committed to browser storage;
- **Saving…** — pending write;
- **Unsaved locally** — changes in memory, write not yet attempted/complete;
- **Storage failed** — browser storage operation failed;
- **Exported** — a file download/save succeeded; this is separate from local autosave.

Do not label local autosave simply “Saved” if users may interpret it as a file or cloud backup.

Recommended wording:

> Saved on this device

## 8. Storage failure

### 8.1 Failure causes

Possible causes include:

- private browsing restrictions;
- quota exceeded;
- browser permission changes;
- IndexedDB corruption/unavailability;
- serialization bug;
- device storage pressure.

### 8.2 Required behavior

On failure:

- keep the active in-memory document;
- show a persistent but nonblocking warning;
- offer immediate Markdown export;
- avoid repeated disruptive dialogs;
- retry only with bounded backoff or after the next meaningful edit;
- log technical detail locally/console without exposing confusing internals by default.

Suggested message:

> This document could not be saved in the browser. Export a Markdown copy now to avoid losing changes.

## 9. Page unload

Browsers do not guarantee asynchronous work during unload.

Therefore:

- autosave should occur continuously rather than depend on unload;
- `visibilitychange` should trigger an immediate save attempt;
- `beforeunload` warning SHOULD appear only when there are known unsaved changes and storage has failed or a write remains unresolved;
- routine locally saved work should not produce a nag dialog.

## 10. Opening Markdown files

### 10.1 Standard file picker

The app MUST allow selecting `.md`, `.markdown`, and optionally `.txt` when user explicitly chooses “Import as Markdown.”

### 10.2 Safe replacement

Parsing and validation happen before active-document replacement.

If import fails, the current document remains active and unchanged.

### 10.3 Imported document naming

Use filename without extension as document title unless front matter provides a title.

The root node text is not automatically forced to equal the filename/title.

### 10.4 File handle enhancement

If direct file handles are supported:

- user permission must be explicit;
- direct save must not occur after permission is revoked;
- the UI must distinguish “Saved to file” from “Saved on this device”;
- a fallback “Download Markdown” remains available.

## 11. Markdown export

### 11.1 Modes

MVP exports canonical Markdown as specified in `markdown-format.md`.

A future choice between “Portable Markdown” and “Lossless MindMap Markdown” is deferred.

### 11.2 Content

Markdown export includes all nodes, including hidden descendants.

It excludes:

- selection;
- hover;
- editing caret;
- viewport;
- undo history;
- temporary errors;
- collapse state in standard mode.

### 11.3 Download filename

Default for Markdown, SVG and PNG downloads:

```text
<sanitized-root-node-label>.<format-extension>
```

Sanitization MUST:

- remove filesystem-forbidden characters;
- collapse repeated whitespace;
- avoid reserved Windows filenames;
- use a fallback such as `mind-map.md` when the root label is empty.

The active root draft is used when the root is currently being edited, so the visible map name
and the downloaded filename cannot disagree.

> **Amendment (2026-08-04):** D-18 uses the root label rather than internal document title for
> download names. The root is the map identity users can see and edit; document title may remain
> the imported filename and is not otherwise editable in the current UI.

### 11.4 Save feedback

After a download is initiated, the UI may say “Markdown export prepared” rather than claiming disk success when browser download completion cannot be verified.

## 12. SVG export

### 12.1 Scope

SVG export represents the current visible map state:

- visible nodes;
- visible connectors;
- current theme;
- current layout mode;
- current collapse states.

It excludes editor UI.

### 12.2 Bounds

Export bounds include:

- nodes;
- connectors;
- shadows;
- collapsed badges if they are part of the visual map;
- configurable outer padding.

Selection/hover outlines and collapse-hover minus controls SHOULD be excluded. A collapsed count badge remains because it communicates hidden structure.

### 12.3 Text

SVG SHOULD preserve text as `<text>` or equivalent accessible vector text where practical.

Requirements:

- correct wrapping into spans/lines;
- XML escaping;
- system font stack or embedded permitted web font only when licensing and packaging allow;
- no external network dependency in the exported SVG;
- correct Chinese Unicode.

### 12.4 Background

Export dialog options:

- Theme background (default);
- Transparent.

Transparent output may reduce legibility for themes designed around a dark background. The UI SHOULD warn or adapt only when necessary.

### 12.5 Metadata

SVG MAY include a small metadata element with generator and version. It MUST not include private local paths or document history.

### 12.6 Security

Generated SVG MUST not contain script, unsafe foreign objects, external URLs, or untrusted raw HTML from node labels.

## 13. PNG export

### 13.1 Resolution

MVP MUST support:

- 1×;
- 2×.

3× MAY be included.

The displayed pixel dimensions should be shown before export where possible.

### 13.2 Maximum size

The exporter must account for browser canvas limits.

If requested dimensions exceed safe limits:

- reduce scale with explanation;
- offer SVG instead;
- or tile internally and compose if reliable.

It MUST not silently produce an empty or clipped image.

### 13.3 Rasterization

Rasterization must:

- wait for required font readiness or use deterministic fallback;
- include theme background or transparency;
- preserve connector anti-aliasing;
- exclude selection/editor UI;
- avoid clipping shadows and outer nodes.

### 13.4 Progress

For large exports, show a cancellable progress state or at least a busy indicator. The active document remains intact if export fails.

## 14. Export dialog

The export interface SHOULD contain tabs or clear choices:

- Markdown;
- SVG;
- PNG.

### 14.1 Markdown options

MVP requires no complex options beyond filename.

### 14.2 SVG options

- theme background/transparent;
- outer margin, optional preset;
- current visible map statement.

### 14.3 PNG options

- 1×/2×;
- background;
- resulting dimensions;
- warning for excessive size.

### 14.4 Explanatory text

The dialog MUST state:

- Markdown contains the complete tree even when branches are collapsed;
- image export reflects the current visible state.

This distinction prevents data-loss misunderstanding.

## 15. Clipboard image/export enhancements

Not required for MVP, but future options may include:

- Copy SVG;
- Copy PNG to clipboard;
- Copy selected branch as Markdown;
- Export selected branch.

These must reuse the same serialization/layout rules.

## 16. Static-site/offline behavior

The deployed site SHOULD be cacheable as a Progressive Web App or equivalent static bundle so that, after first load, the editor can reopen offline.

Offline support must not imply cloud synchronization.

Service-worker updates must avoid replacing the app during an active editing session without warning.

Recommended update behavior:

- download new assets in background;
- show “A new version is available”;
- apply after user reloads, preferably once current local save is confirmed.

## 17. Data retention and user controls

The app SHOULD eventually expose:

- delete current local document;
- clear all local documents;
- export before clearing;
- show approximate local storage usage.

MVP at minimum must not clear stored documents automatically except bounded old recovery snapshots.

## 18. Privacy and analytics

If analytics exist:

- document text, hierarchy, filenames, and exports MUST not be collected;
- analytics should be optional or privacy-preserving;
- the privacy statement should distinguish static hosting logs from app telemetry.

Core specification assumes no content analytics.

## 19. Required persistence and export tests

1. Type, reload immediately after autosave indicator, recover exact tree.
2. Simulate failed latest snapshot, recover previous valid snapshot.
3. Simulate quota error, keep in-memory document and offer export.
4. Import malformed Markdown, preserve current document.
5. Export collapsed map: Markdown contains hidden descendants; SVG/PNG omit them.
6. Export Chinese text to SVG/PNG without corruption.
7. Export long labels without clipping.
8. Export transparent and theme backgrounds.
9. Export a map near canvas-size limits with clear fallback.
10. Switch app version/schema and migrate stored document safely.
