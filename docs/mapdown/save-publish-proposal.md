# Mapdown — Document Library, Account Save, and Publish

**Status:** All three stages were authorized by the owner. Stage 1 and the combined stage 2/3
implementation are `in_review`; only the owner can accept them. Written 2026-08-18 as an
exploration, authorized through `docs/roadmap.md` on 2026-08-21, and implemented on the
`codex/mapdown-local-document-library` branch.

Four scoping decisions were made by the owner on 2026-08-18, before this document was written,
and they are treated here as settled inputs:

1. The work splits into **three independently shippable stages**, local library first.
2. The account API lives on **`map.bcailab.com` as Pages Functions**, not on `bcailab.com`.
3. Published maps are served from a **separate host**, not from the editor origin.
4. Publishing produces a **frozen snapshot** with an explicit *Update published version*.

---

## 1. What this is

The owner's request: signed-in users can save their mind maps, there is a file list, and a map
can be *published* to a URL that other people can open.

That request spans two phases of `spec/phases.md`:

- **Phase 5 — document management and installation.** Recent local documents, rename /
  duplicate / delete, recovery history. Its explicit boundary: *"no cloud account is required;
  document library remains lightweight and local-first."*
- **Phase 6 — optional cloud sync.** Account sync, conflict detection, version history,
  shareable read-only links. Its gate: *"only after local-first behavior is mature."*

So the file list is not part of the account feature. It is the layer underneath it, and it must
work signed out.

## 2. The gap that already exists today

Mapdown's storage layer already keeps a multi-document index — `DocumentIndexEntry` and
`listIndexEntries()` in `apps/mapdown/src/storage/store.ts`, specified by
`spec/storage-export.md` §4. **Nothing in the UI calls `listIndexEntries()`.**

Meanwhile *Open Markdown…* creates a new document and tells the user, truthfully, that
"your current map remains saved in this browser" (`Editor.tsx`). It is saved, and there is no
way to reach it again. Documents accumulate in IndexedDB with no door back in.

Stage 1 closes that on its own, with no backend, no account, and no new decision to reverse.

## 3. Stage 1 — Local document library (no account, no network; in review)

**Scope.** A document list inside Mapdown, built on the existing index: open, new, rename,
duplicate, delete (confirmed and undoable per the destructive-action rule), sorted by
`updatedAt`, showing title and node count. `sourceFilename` shows where an imported map came
from. Recovery-snapshot history stays out of this stage unless it falls out for free.

**Where it lives.** Inside Mapdown's own chrome — the *File* menu grows a *Document library…*
entry, and the library is a Mapdown surface, not an English Studio one (D-05).

**Acceptance criteria.**

- (a) Every document that exists in the local index is reachable from the library; a map made
  unreachable by *Open Markdown…* before this stage is reachable after it.
- (b) Rename, duplicate and delete operate on the index and the snapshots together; delete is
  confirmed, and a deleted document's snapshots are actually removed.
- (c) The library works with no account and no network, and transmits nothing.
- (d) Storage failure (`spec/storage-export.md` §8) degrades the library, never the editor: an
  unavailable IndexedDB shows an honest empty/unavailable state and the editor still runs.
- (e) Keyboard- and screen-reader-operable, verified at desktop, tablet and mobile widths and
  under reduced motion, consistent with the existing Help/Command Center pattern.
- (f) The library is reachable as a command in the command registry, so it appears in Help.

**Explicitly excluded from stage 1.** Folders, tags, search across documents, PWA install,
File System Access API, recovery-history UI. `spec/phases.md` §7 already excludes a full
folder/tag/library system.

**Review evidence (2026-08-21).** The implementation adds a Mapdown-native, newest-first
library with open/new/rename/duplicate/delete/current-tab undo; atomic index-and-snapshot
storage operations; imported-filename preservation; command/help integration; focus trapping,
focus restoration and responsive layout. Storage and IndexedDB tests cover the destructive
operation and complete restoration. Browser QA covered persistence across reload, keyboard
focus, confirmation cancellation and the 375 px layout without console errors. The final
typecheck, lint, test and production-build results are recorded in `docs/changelog.md`.

## 4. Stage 2 — Account save

### 4.1 The architectural problem

Mapdown is a static SPA with no backend, deliberately (D-04), deployed as its own Pages project
(D-03). Accounts live on `bcailab.com`. And `bcailab_session` deliberately sets **no `Domain`
attribute**, so it never reaches `map.bcailab.com` — decided in D-10 and locked by
`packages/auth/src/session-cookie.test.ts`.

That test is not an obstacle to route around. D-10's reasoning was that an explicit `Domain` is
all-or-nothing (RFC 6265 §5.2.3) and that Mapdown — an app that imports arbitrary Markdown,
generates SVG, and (now) would host other people's content — is precisely the kind of origin
that should not share a site boundary with an authenticated app. Publishing makes that argument
stronger, not weaker.

### 4.2 Implemented shape

**Mapdown grows its own backend on its own origin.** `apps/mapdown/functions/` (Cloudflare
Pages Functions) bound to the same D1 database and R2 bucket, serving a small same-origin API.
No CORS, no cross-site cookie, no change to `bcailab_session`, and `git subtree split` still
extracts `apps/mapdown` intact (D-02's reversibility clause).

**Sign-in is a signed one-time handoff, not a shared cookie.**

1. Mapdown opens `https://bcailab.com/auth/mapdown` in a popup — the same popup pattern as
   `login-popup.ts`, reusing the existing Google OAuth flow.
2. `bcailab.com`, with an authenticated session, mints a short-lived signed token bound to the
   user id and to a single use.
3. The popup posts it back; Mapdown exchanges it at its own API for a **host-only
   `mapdown_session` cookie** on `map.bcailab.com`.

The signed-token mechanics already exist in this repo and should be copied rather than
reinvented: `apps/web/app/utils/translate-save-proof.server.ts` has domain separation, a version
field, TTL with clock-skew tolerance, subject binding and tamper tests. Proposed domain string
`bcailab:mapdown-signin:v1`, TTL ≈ 60 s, single use enforced by a consumed-nonce row.

**Sessions stay separate from web sessions.** A new `mapdown_sessions` table rather than an
`audience` column on `sessions`, for the same risk-independence reason D-13 gives for the
TypeScript split: a Mapdown mistake must not be able to mint or accept a Studio session, and
`apps/web` should not have to change to make that true.

**Cost to accept, stated plainly:** a new Google OAuth redirect URI; a Pages Functions build for
a project that is currently pure static; and D-04's "no server, no Cloudflare bindings" needs a
recorded correction, not a silent violation.

### 4.3 What gets stored, and in what format

Private save and publish should **not** use the same format. This is the one genuinely
load-bearing design call in the proposal.

| | Private cloud save | Publish |
|---|---|---|
| Format | internal JSON snapshot, `schemaVersion` | canonical Mapdown Markdown |
| Why | **lossless** — node ids, `collapsed`, `side` all survive; migratable | already the public contract; `shape:` / `palette:` front matter cleared its gate in D-24 |
| Audience | the owner's own other browser | anyone with the link |

Plain Markdown is **lossy** today: node identity, collapse state and branch side do not survive a
round trip. That is exactly what Phase 4's `.mind.md` profile is for. Using Markdown as the
private sync format would either silently drop state on every sync or drag Phase 4 into this
work. Storing the versioned internal snapshot avoids both and keeps the private format free to
change, because it is never a public contract.

Documents are small; D1 `TEXT` is the right home for both bodies, with a hard size cap. R2 holds
only the published SVG (see §5.3).

### 4.4 Local-first is preserved, not weakened

- IndexedDB stays the primary store. Cloud save is an **explicit, per-document, opt-in action**,
  never automatic and never implied by signing in (`spec/product-specification.md` §20; the same
  rule the roadmap already applies to saved translations).
- Signed out, everything in stage 1 still works, offline, with nothing transmitted.
- The library shows one list with a per-row state: *Local only* / *Synced* / *Published*.

### 4.5 Conflicts

Phase 6's decision gate requires conflict behavior to be **specified before implementation**.

Optimistic concurrency: each cloud document carries an integer `version`. A save sends the
version it was based on; a mismatch is rejected, and Mapdown **never overwrites**. The rejected
save becomes a local copy (`Title (conflicted copy)`) that the user can inspect and merge by
hand. No CRDT, no operational transform, no realtime collaboration — none of that is in scope,
and `spec/phases.md` §8 lists collaboration as "potential", not planned.

### 4.6 Anonymous → signed-in migration

Local documents carry client-generated ids. On upload, the **server** issues the cloud id and
Mapdown stores the mapping locally. Client-supplied ids are never trusted as primary keys —
otherwise a crafted local id becomes an ownership-collision vector.

### 4.7 Acceptance criteria

- (a) Signed out, every stage-1 behaviour is unchanged, offline, with no network request
  carrying document content.
- (b) No document leaves the browser without an explicit user action on that document.
- (c) The handoff token is single-use, expires, is bound to the user, and is rejected on
  tampering, replay, expiry, or subject change — proof tests in the shape of
  `translate-save-proof.test.ts`.
- (d) `bcailab_session` is unchanged and `session-cookie.test.ts` still passes untouched.
- (e) A Mapdown session cannot authenticate against `apps/web`, and vice versa.
- (f) Every read and mutation is user-scoped; a foreign id and an absent id are
  indistinguishable (the rule already applied to saved translations).
- (g) A stale-version save is rejected without data loss and produces a conflicted copy.
- (h) Save is retry- and double-click-idempotent.
- (i) Per-user document count and per-document size limits are enforced server-side with a
  clear message, not a generic failure.
- (j) Private responses use `Cache-Control: private, no-store`.

## 5. Stage 3 — Publish

### 5.1 Semantics: frozen snapshot

Publishing freezes the current document into a public record. Later edits do not change the
public URL until the user explicitly runs *Update published version*. The editor autosaves
continuously; a live link would put every half-finished intermediate state on the public
internet, and the user would have no way to know what a reader is seeing.

*Unpublish* must genuinely revoke: the row is revoked, the URL returns 404, and the caching
strategy must not defeat that — either a short edge TTL or a version-bearing URL, decided and
tested, never assumed.

### 5.2 A separate host for published content

Published maps are user-generated content. Serving them from `map.bcailab.com` would put them
same-origin with the editor and with `mapdown_session`. They therefore use
`share.bcailab.com`, which carries no authenticated cookie.

Node text is plain text today — there is no rich text (`spec/phases.md` §9.1 keeps it behind a
dedicated spec), so escaping is cheap right now and expensive later. Also required: a strict
CSP on the viewer, the existing SVG security rules (`spec/storage-export.md` §12.6), random
unlisted ids with no index page and `noindex` by default, per-user publish quotas, and a
reachable report/takedown path.

### 5.3 The rendering hazard — decide this before implementing

**Layout depends on text measurement**, which depends on a canvas. A Worker cannot measure
text. Therefore the published page cannot be laid out server-side, and `og:image` cannot be
rendered on demand. This will surface as a blocker halfway through implementation if it is not
settled first.

Resolution: at publish time the **client** generates the SVG with the existing
`src/export/svg.ts` and uploads it alongside the Markdown. The published page is the Mapdown SPA
in read-only mode (pan / zoom / collapse, no editing); the stored SVG serves as `og:image` and
as the `<noscript>` fallback. Spike 2 already established that canvas measurement and SVG layout
agree to 0.000 px, so the uploaded SVG matches what the reader sees.

### 5.4 Acceptance criteria

- (a) Publishing is explicit, per-document, and shows exactly what will become public before it
  happens.
- (b) The published URL renders the frozen version; subsequent editing does not change it until
  *Update published version* is run.
- (c) Unpublish returns 404 for the URL within a stated, tested time bound, including through
  the CDN.
- (d) The published page is read-only: no path through it mutates the source document.
- (e) A published map with no JavaScript still shows the map (the stored SVG), and link previews
  work.
- (f) Published content is served from a host that carries no authenticated cookie.
- (g) Publishing renders no user text as markup; a map whose node text contains HTML, script
  tags or `javascript:` URLs is inert when published.
- (h) `shape:` / `palette:` front matter in a published document round-trips, and a legacy
  single `theme:` key still opens (D-24).
- (i) Publish quota and document size limits are enforced, and a report path exists.
- (j) Keyboard- and screen-reader-operable at desktop, tablet and mobile widths.

## 6. Decisions recorded by the implementation

The implementation records these as D-26 through D-30 in `docs/mapdown/decisions.md`:

1. **Mapdown gains a backend on its own origin** — corrects D-04's "no server, no Cloudflare
   bindings".
2. **Cross-host sign-in is a signed one-time handoff, not a shared cookie** — extends D-10
   rather than reversing it, and records why the cookie stays host-only.
3. **Private save and publish use different serialization formats** — versioned JSON vs.
   canonical Markdown, with the lossiness argument.
4. **Published content is served from a separate host** — and why the editor origin is not it.
5. **Conflict behaviour is optimistic-concurrency with a conflicted copy** — required by
   Phase 6's own gate.

## 7. Sequencing and process notes

- Stage 1 is independent and reversible. Stages 2 and 3 are not: an OAuth redirect URI, a public
  URL format and a stored document format all become contracts.
- ADR 0008 applies: the schema migration is applied **before** the code that reads it is
  deployed, with `--remote` for production D1.
- Any code change here touches external behaviour — routes, schema, env vars, auth flow — so the
  documentation sync rule applies in the same PR.
- The theme sequencing constraint from 2026-08-06 that gated publish behind the shape/palette
  split **is already clear**: step 3 shipped in PR #37.

## 8. Resolved questions

- Published host: `share.bcailab.com`.
- Publishing requires an authenticated Mapdown account.
- Limits: 100 private documents, 512 KiB private JSON, 25 active publications, 256 KiB
  Markdown, 2 MiB SVG, 120-code-point titles, and three reports per URL/reporter digest per
  24 hours. These are synthetic-size-based product limits, not user telemetry.
- Recovery-history UI remains deferred; the local library exposes documents, not individual
  recovery snapshots.

## 9. Review evidence

Migration `0019_mapdown_cloud.sql` applied successfully to the local D1 state (14 statements).
Pages Functions runtime verification covered a successful handoff, rejected replay, first
cloud save, stale-version 409 without overwrite, publication backed by local R2, public CSP and
`noindex` headers, and an immediate 404 after unpublish. Six cross-implementation contract tests
cover handoff tampering/expiry/audience, nonce hashing, Host-only cookies, snapshot invariants,
canonical Markdown and safe SVG. The repository suite passes 593 tests; Mapdown and Web
typechecks/builds pass; lint has zero errors and the same nine pre-existing Hook warnings.
Authenticated browser QA covered online-only open, explicit publish, the frozen viewer and UI
unpublish; screenshots at 375, 768 and 1280 px showed no horizontal overflow, and ordinary
flows produced no console errors. No remote migration, domain configuration, secret change or
deployment was performed.
