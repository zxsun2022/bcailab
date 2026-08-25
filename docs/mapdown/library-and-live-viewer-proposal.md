# Mapdown — Library Page, Live Published Viewer, and Copy

**Status:** Written 2026-08-24 after the owner confirmed the four scoping decisions below.
Authorized through `docs/roadmap.md`, implemented on `claude/mapdown-library-and-live-viewer`,
and accepted by the owner as a first version on 2026-08-25 — with the Pages Functions runtime
check still owed on deployment, as `docs/roadmap.md` records.

The save/publish work accepted on 2026-08-23
([`save-publish-proposal.md`](save-publish-proposal.md)) made saving and publishing *possible*.
This iteration makes them *usable*, and turns a published link from a picture into a map.

Four scoping decisions were made by the owner on 2026-08-24, before this document was written,
and are treated here as settled inputs:

1. The document library becomes a **full-page route**, replacing the modal dialog. The editor
   stays the default landing surface.
2. The published viewer is driven by a **new public view snapshot**, not by the published
   Markdown, because Markdown loses branch side and collapse state.
3. **Copy** produces a **local** map in the visitor's browser. Saving it to an account remains
   the existing explicit action.
4. The roughness to fix is, in the owner's order: the **publish flow**, **save/sign-in
   feedback**, and the **list itself**. Canvas interaction is explicitly out of scope.

---

## 1. What is wrong today

**The library is a dialog doing a page's job.** `DocumentLibrary.tsx` is 728 lines rendering a
modal that carries local documents, online documents, sign-in, save, publish, update, unpublish,
delete, conflict copies and the resulting public URL — inside a focus trap, on top of an inert
editor. Acceptance criterion (k) of stage 3 exists only because the publish result kept landing
*behind the dialog's own overlay*. That criterion is a symptom: the surface is too small for
what it was asked to hold.

**Publishing is a modal inside a modal.** Publish, update and unpublish confirm through
`CloudConfirmation` inside the dialog, and the public URL, Copy link and publication version
compete for the same row as rename and delete. There is no place that answers "what is public
right now, and what does it look like".

**Save state is inferred, not shown.** A row can be local-only, saved online, saved online with
newer local edits, published, published-but-stale, or a conflicted copy. Today several of those
read as the same thing until you open a menu.

**A published link is a picture.** `functions/p/[publicId]/index.ts` serves the frozen SVG in an
`<img>` with `default-src 'none'`, and `public/published.js` scales that image. A reader cannot
collapse a branch they do not care about, cannot pan naturally, and cannot take the map with
them. For a mind map — a structure whose whole point is progressive disclosure — that is the
wrong artifact.

## 2. The constraint that shapes stage 2

`spec/storage-export.md` §14.4 and `markdown/parse.ts:381` are the load-bearing facts:

- Markdown export **must** contain every node, including collapsed descendants.
- Markdown import assigns **every first-level node `side: "right"`** and has no collapse state.

So the published Markdown cannot reproduce the map the author published. A viewer built on it
would put every branch on the right and expand everything, and would then disagree with the
frozen SVG sitting next to it as the no-JavaScript fallback. Two public renderings of one
publication that do not match is a correctness bug, not a cosmetic one.

Hence a **public view snapshot**: a versioned, published-only JSON payload carrying exactly what
the renderer needs — node text, tree order, first-level sides, collapse state, and the theme
pair. It is not the private cloud snapshot (D-27), which stays free to change because it is
never a public contract, and it is not Markdown, which stays the portable interchange format.

## 3. Stage 1 — the library becomes a page

**Route.** `/library`, a real path. The SPA gains a three-route client router (`/`, `/library`,
`/import`) with `history.pushState`, and those paths are added to `_routes.json` so the existing
`_middleware.ts` sees them on the published origin and redirects them to the editor host.

> **Amendment (2026-08-25).** This originally used a `_redirects` rewrite to serve `index.html`
> for those paths. It does not work: Pages normalises the `/index.html` destination into a 308 to
> `/`, which lost the route in production. The middleware serves the shell instead. See the
> correction on D-31.

**The editor stays mounted.** The library renders as a full-page surface above a hidden editor
rather than replacing it. Unmounting would discard the undo history, and `vision.md` §4.8 makes
reliable history non-negotiable; a document manager that silently costs you your undo stack is a
worse trade than a modal. The editor's existing `overlayOpen` gating already makes it inert.
Navigation into the library still flushes the pending local save first, as the dialog did.

**What the page holds that the dialog could not.**

- One row per map with an explicit state chip: *Local only* · *Saved online* · *Unsaved changes*
  · *Published* · *Published · outdated* · *Conflicted copy*.
- Search by title, and sort by last edited or title.
- Row actions promoted from a cramped cluster to an explicit action column, with rename inline.
- A **detail panel** for the selected map: node count, local and online timestamps, publication
  version, the public URL with Copy link, Open, and the publish/update/unpublish controls — the
  place stage 3's criterion (k) was reaching for.
- Online-only documents listed in the same list rather than a separate block, marked as needing
  a local open before their public assets can be rendered.

**What does not change.** The storage and cloud functions in `storage/library.ts` and
`cloud/api.ts` are already page-agnostic and are reused as-is. Delete stays confirmed and
undoable in-tab. Nothing uploads without an explicit per-document action. Signed out, every
local behaviour still works offline.

### Acceptance criteria

- (a) `/library` is reachable directly, by the File menu, and from the command registry; browser
  Back returns to the editor with its document, viewport and undo history intact.
- (b) Every state a row can be in is visible without opening a menu, and *Saved online* is never
  shown for a map with unsaved local content changes.
- (c) Publish, update published version and unpublish all happen in the detail panel, and the
  resulting public URL and Copy link stay visible after the action completes.
- (d) Search and sort operate on the merged local + online list and never hide the active map
  silently — an empty result says so.
- (e) The page is keyboard- and screen-reader-operable at desktop, tablet and mobile widths,
  under reduced motion, with the same focus discipline the dialog had.
- (f) With IndexedDB unavailable the page shows an honest unavailable state and the editor still
  runs.
- (g) On `share.bcailab.com`, `/library` and `/import` do not serve the editor.

## 4. Stage 2 — the published page becomes a live map

**A second Vite entry.** `src/viewer/` builds to a fixed-name bundle served from the Pages
static assets. The Function keeps generating the HTML — it owns `og:` metadata, `noindex`, the
canonical URL and the CSP — and references the bundle. The viewer imports `layout/`, `theme/`
and `canvas/viewport.ts`; it does **not** import the editor, the command registry, the model
commands or the storage layer, so no code path through the public bundle can mutate a document.

**Rendering.** The viewer fetches `/p/{id}/map.json`, runs the same layout engine the author
ran, and renders read-only SVG through its own component. It deliberately does not reuse
`MapCanvas.tsx`: that component carries drag, selection, IME and command dispatch, and pulling
it onto the public host would ship editing code to readers. Visual fidelity is protected where
it actually lives — `layout/`, `theme/` and the measurement path are shared, and Phase 0 spike 2
established that canvas measurement and SVG layout agree to 0.000 px.

**What a reader can do.** Expand and collapse any node with children, pan by drag, zoom by wheel
or the existing zoom capsule, fit to screen, and reset. Keyboard: arrow-key tree navigation,
Enter/Space to toggle collapse, `0` to fit. No editing, no selection commands, no drag-to-move.

**Fallbacks and safety.**

- No JavaScript, or a failed `map.json` fetch, leaves the existing `<img>` SVG in place. The
  page must be useful in exactly the way it is today before the bundle loads.
- CSP gains `connect-src 'self'` and nothing else. `default-src 'none'` stays.
- Node text reaches the DOM as React text children only; no `innerHTML`, no `dangerouslySet*`,
  no `foreignObject`.
- Publications made before this stage have no view snapshot and keep the image viewer. The
  column is nullable and the viewer branches on it.

**Storage.** The view snapshot is uploaded by the client at publish time alongside the SVG and
PNG, stored in R2 under `mapdown/publications/{publicId}/v{n}.json`, and referenced by a new
nullable `view_key` column on `mapdown_publications`. D1 stays the serving authority, so
unpublish still revokes by row and R2 cleanup can lag. Cap: 512 KiB per view snapshot — the
representative 2,000-node map is ≈317 KiB as JSON.

### Acceptance criteria

- (a) The interactive view is visually identical to the frozen SVG on first paint: same sides,
  same collapse state, same theme.
- (b) Collapse, expand, pan, zoom and fit work by pointer and by keyboard, and no interaction
  changes the stored publication.
- (c) With JavaScript disabled the page still shows the map, and link unfurling still uses the
  PNG.
- (d) A publication created before this stage renders through the image viewer with no error.
- (e) Hostile node text — HTML, `<script>`, `javascript:` — is inert in the live viewer, proven
  by a test that feeds those labels through it.
- (f) The public bundle contains no import path reaching the editor, storage or model commands.
- (g) Unpublish still returns an uncached 404 for the page **and** for `map.json`.
- (h) The view snapshot is validated server-side on publish: shape, size, node ceiling, and a
  root that exists.

## 5. Stage 3 — Copy

**The flow.** The published page shows **Make a copy**. It links to
`https://map.bcailab.com/import?src={publicId}` — the editor origin, not the share host, because
the share host deliberately carries no session and must not gain a write path. The import route
calls a new same-origin public endpoint `GET /api/publications/{publicId}`, which reads the
active publication straight out of D1/R2 and returns the view snapshot and title. Mapdown builds
a **local** document from it, stores it in IndexedDB, and opens it in the editor.

**Why local.** It works signed out, it keeps `spec/product-specification.md` §20's local-first
rule intact, and it never uploads anything the visitor did not explicitly ask to upload. A
visitor who wants it in their account uses the existing *Save online* action, which is one click
away in the new library page.

**Provenance.** The copy records `copiedFromPublicId` in its index entry and is titled from the
source title. It is a new document with new ids; nothing links it back to the original author's
cloud document, and the original is not notified. Copy is not attribution and not a fork graph.

### Acceptance criteria

- (a) Copy works signed out, offline after the fetch, and creates exactly one local document.
- (b) The copy preserves structure, first-level sides, collapse state and theme.
- (c) Copying a revoked or unknown id fails with a clear message and creates nothing.
- (d) `GET /api/publications/{id}` is read-only, unauthenticated, `no-store`, returns 404 for
  revoked and unknown ids alike, and exposes no author identity.
- (e) A second copy of the same map creates a second document rather than overwriting the first.
- (f) The share host gains no authenticated cookie and no mutation endpoint.

## 6. Decisions to record

The implementation records these in `docs/mapdown/decisions.md`:

- **D-31 — The document library is a route, not a dialog, and the editor stays mounted beneath
  it.** Includes why unmounting was rejected (undo history) and why the published origin must
  reject the app routes.
- **D-32 — A published map ships a versioned public view snapshot, and the published page is a
  live read-only renderer with the SVG as its fallback.** Amends D-29's "displays user content
  only as an isolated SVG image", and records why Markdown could not be the viewer's source.
- **D-33 — Copy is a local copy made on the editor origin.** Records why the share host gains no
  write path and why copy is not a fork graph.

## 7. Sequencing

Stage 1 is independent and reversible. Stage 2 introduces a stored public format and a migration
and is not. Stage 3 depends on stage 2's snapshot. ADR 0008 applies: `0021_mapdown_publication_view.sql`
is applied before the code that reads it is deployed, `--remote` for production D1.

The documentation sync rule applies in the same PR: routes, API contract, schema and CSP all
change.
