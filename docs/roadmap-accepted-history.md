# Accepted roadmap evidence — archived 2026-09-17, extended 2026-09-18, 2026-09-22 and 2026-09-23

**Document role:** historical-evidence.

Verbatim accepted scope/evidence moved out of the active [roadmap](roadmap.md). Dates and status
statements describe the original record, not a fresh audit. Original headings (including “Now”)
are retained for stable links. Contradictory chronological notes are preserved as evidence,
not interpreted as new authorization. See [changelog](changelog.md) for delivery and
[the docs guide](README.md) for authority. Still-open quality caveats remain in the active roadmap.

## Now — Engineering quality iteration

The owner authorized this iteration on 2026-08-15 after reviewing the project diagnosis.
It is engineering-only: no external behavior, contract, schema, or UX change. Each item
ships as its own commit, in the order listed. Report each as `in_review` with evidence;
only the owner marks it accepted.

### 1. Remove dead `EslPassage` code — accepted (2026-08-15)

Shipped as `66a85c1`: removed the eight `EslPassage` CRUD functions, the `EslPassage` type,
and `mapEslPassage` — all zero callers after migration 0012 moved user reading passages
into the unified `passages` table. `docs/material-layer-design.md` §8 still names
`listEslPassagesByUser` as pre-migration design prose and is intentionally unchanged.

### 2. Configure ESLint across the monorepo — accepted (2026-08-17)

- Cover the whole monorepo — `apps/web`, `apps/mapdown`, `packages/*`, `scripts/` — with a
  per-package TypeScript version (web/scripts 5.9.3, mapdown 7.x), not one root override.
- Acceptance: a single `pnpm lint` runs everything and passes with **zero errors**; the
  existing `pnpm test`, `pnpm typecheck`, and production builds stay green.
- Enable `eslint-plugin-react-hooks` for the React surfaces. Do **not** enable type-aware
  (typed) linting in this pass — that is a later enhancement, not this item.
- **Prettier is out of scope.** This item is ESLint only.
- Do not rewrite business code to silence rules; fix mechanical violations only, and where a
  rule genuinely does not fit, disable it narrowly with a reason rather than changing behavior.

Review evidence (2026-08-17): `eslint.config.mjs` uses flat config with TypeScript parsing,
the standard ESLint recommended rules, and the traditional React Hooks rules
(`rules-of-hooks` plus `exhaustive-deps`). The newer compiler-style Hooks rules are not enabled
because they would require behavior-affecting ref/effect rewrites. `pnpm lint` covers the root,
Web, Mapdown, packages, and scripts with zero errors (nine existing dependency-array warnings).
The 564-test suite, Web/scripts typecheck, Mapdown typecheck, Web production build, and Mapdown
production build all pass. Mechanical lint fixes only: unused bindings, intentional control
character regexes, empty catch blocks, and equivalent escape syntax.

### 3. Split `@bcailab/db` into per-domain modules — accepted (2026-08-17)

- One internal module per complete domain (the full set in `index.ts`, not just four).
- `src/index.ts` stays the public barrel; every existing call site keeps importing from
  `@bcailab/db` unchanged. No new subpath public API.
- No change to SQL, return types, or error semantics — a pure mechanical move. The N+1 fix
  (item 4) is deliberately **not** folded into this item.

Review evidence (2026-08-17): the former 2,591-line implementation is now split into internal
`users`, `posts`, `tts`, `reading`, `learner`, `writing`, `usage`, `dictation`, and `passages`
modules, with shared public types and compatibility helpers separated from the barrel.
`packages/db/src/index.ts` remains a 15-line public re-export surface; all existing application
imports remain `@bcailab/db`. Tests, Web/scripts typecheck, Mapdown typecheck, lint, and both
production builds pass.

### 4. Fix the evaluation-history N+1 query — accepted (2026-08-17)

- First locate the exact query (or queries) and record the current and target query counts
  per page load; acceptance is a fixture/test proving the target bound is met.
- Scope is the identified query only, not a general query audit.

Review evidence (2026-08-17): `/reading/:id` previously issued one latest-evaluation query per
attempt plus a second query for the selected attempt (`N + 3` D1 queries after passage and
attempt loading). The evaluation worker had the same per-history-attempt pattern (`N + 3`).
Added `listLatestEslReadingEvaluationsByPassage`, which selects the latest row per attempt in
one user- and passage-scoped query. Both callers now use one evaluation query: the page is 3
D1 queries total and the worker is 4. A fixture asserts one `prepare` call and the latest-row
ordering predicate; 565 tests pass, typecheck/lint pass, and both production builds pass.

### 5. Session cleanup cron — accepted (2026-08-17)

- Recorded implementation parameters before coding: daily at 03:17 UTC, a maximum of 100
  deletes per run, strict `expires_at < now` deletion, and a separate Cloudflare Worker Cron
  Trigger because the app deployment is Pages. The delete is idempotent and uses the same D1
  binding as the app. Unit coverage asserts the strict predicate and batch ceiling.

### 6. Session secret rotation — accepted (2026-08-17)

- Recorded implementation parameters before coding: `SESSION_SECRET` signs new cookies while
  optional `SESSION_SECRET_PREVIOUS` verifies old cookies for the current 30-day maximum cookie
  lifetime; rollback restores the former value as primary before removing the compatibility
  value; final removal uses Cloudflare Pages secret management. Infra operations and the
  compatibility window are documented in `docs/infra-cloudflare.md`, with a cookie test proving
  old-secret verification.

## Now — Account passwords and profile — accepted (2026-08-18)

The owner authorized this on 2026-08-18 and accepted it the same day, after verifying the
shipped behaviour in production. It extends the existing passwordless auth (email OTP +
Google, both unchanged) rather than adopting a new auth framework; better-auth was explicitly
considered and declined because it would require re-schema-ing and rewiring every session call
site for features the custom system already provides. This delivers — and goes beyond — the
Later item "Profile settings (avatar + nickname) for email-OTP users".

- Add an **optional** account password. Accounts stay passwordless by default; a user may set a
  password from their profile and then also sign in with email + password. Passwords are stored
  as PBKDF2-HMAC-SHA256 hashes with a per-user salt in `users.password_hash` (nullable), never
  exposed on the client `User` type. Minimum length 8.
- `/login` keeps Google and email-code sign-in and adds a password mode plus a "Forgot or never
  set a password?" reset that reuses the existing email OTP: a verified code sets a new password
  and signs the user in.
- Add an authenticated `/profile` page reached from the avatar menu. It edits the display name
  and sets or changes the password; changing an existing password requires the current one,
  while setting the first password only requires the authenticated session.
- The avatar is **not** user-editable (owner decision, 2026-08-18): asking a user to paste an
  image URL is poor UX, so the avatar comes from Google or falls back to a default placeholder.
  Because Google is then its only source, a Google sign-in refreshes the avatar outright; the
  display name keeps its no-clobber protection since it *is* user-editable.
- Google sign-in continues to attach to an existing email account by matching email (unchanged).

Acceptance evidence: unit tests for password hashing round-trip, malformed-hash safety, and
strength validation; a local migration adding the nullable column; and end-to-end browser
verification against the running dev server of email-code sign-in, setting a password in
`/profile`, editing profile info, password sign-in, and code-based reset. `pnpm test`,
`typecheck`, `lint`, and the production build all pass. Explicitly out of scope: rate-limiting
the password-login endpoint beyond PBKDF2 cost, session revocation on password change, and
any user-supplied avatar (upload or URL).

Review evidence (2026-08-18): shipped across PRs #41–#44. Password hashing is PBKDF2-HMAC-SHA256
over WebCrypto with a per-user salt and a self-describing hash string; `users.password_hash` is
nullable and absent from the client `User` type. `/login` carries Google, email-code, password,
and code-based reset; `/profile` edits the display name and sets or changes the password, with
an entry in both the site header and the Studio rail avatar menus. A review pass additionally
made `consumeLoginCode` an atomic compare-and-swap so a concurrent reset cannot consume one code
twice, and stopped Google sign-in from clobbering a user-set display name. 579 tests, typecheck,
lint (0 errors), and both production builds pass; the local-D1 checks cover avatar preservation
on a name save and a real SQL `NULL` when the name is cleared.

Two items are carried forward rather than closed by this acceptance:

- **Password-login throttling remains absent** — only PBKDF2 cost stands between an attacker and
  online brute force. Scoped out deliberately; it is the first thing to add if password sign-in
  sees real use (NIST 800-63B expects rate limiting on a password verifier).
- **PBKDF2 is pinned at 100,000 iterations**, below OWASP's current 600,000, to stay inside the
  Workers per-request CPU budget on the sign-in path. Revisit against a measured budget rather
  than raising it blindly.

Operational note: migration `0018` reached production *after* the code deploy, so `/profile`
returned an error until it was applied. Apply the migration before deploying code that reads a
new column — see the deploy-ordering note in `docs/changelog.md`.

## Now — Mapdown local document library — accepted (2026-08-23)

The owner authorized Stage 1 of
[the save/publish proposal](mapdown/save-publish-proposal.md) on 2026-08-21 and accepted the
completed stage on 2026-08-23. This stage closes the existing local-storage gap before any
account, cloud-save, or public-URL contract is introduced.

- Add a Mapdown-native document library backed by the existing IndexedDB document index. Every
  indexed map is listed newest-first with its title, node count, last local update, import source
  when known, and a clear current-document state.
- Let people open, create, rename, duplicate, and delete local maps without an account or network
  connection. Opening or creating a map must first finish the current pending local save; a
  storage failure must keep the current in-memory map active rather than switching and losing it.
- Rename and duplicate update the document snapshot and index consistently. Delete requires an
  in-product confirmation, removes every stored snapshot for that map, and offers a current-tab
  undo that restores the complete stored document. Deleting the active map selects another local
  map or creates a new local map so the editor never has no active document.
- Expose the library from the File menu and the canonical command registry. The dialog traps and
  restores focus, works by keyboard and screen reader, reflows on mobile, and respects reduced
  motion. If IndexedDB cannot be read, the dialog shows an honest unavailable state while the
  in-memory editor remains usable.
- Keep folders, tags, document search, PWA installation, File System Access API, recovery-history
  UI, accounts, cloud sync, and publish/share URLs out of this stage.

Acceptance evidence: storage tests for list ordering, rename, duplicate, delete/restore, complete
snapshot cleanup, imported filename preservation, failed-write atomicity, and IndexedDB parity;
command-registry coverage; browser QA at desktop and mobile widths for open/new/rename/duplicate,
persistence across reload, keyboard focus, responsive layout, and delete confirmation/cancellation.
The destructive delete/undo execution is verified in isolated storage tests rather than against
the browser's live IndexedDB. Mapdown typecheck, lint, focused tests, full tests, and production
build passed before owner acceptance on 2026-08-23.

## Now — Mapdown account save and frozen publishing — accepted (2026-08-23)

The owner authorized stages 2 and 3 of
[the save/publish proposal](mapdown/save-publish-proposal.md) on 2026-08-21, accepting the
recommended `share.bcailab.com` publication host and requiring an account to publish. The
existing local document library remains the primary, fully offline workflow; signing in or
opening the library must never upload a document implicitly. The owner accepted the completed
implementation on 2026-08-23.

The owner authorized a silent-SSO follow-up on 2026-08-24: when Mapdown has no session, it may
perform one background, non-interactive handoff check against Studio. An existing Studio session
creates the same short-lived, single-use, audience-bound Mapdown session; no Studio session leaves
Mapdown visibly signed out without opening a popup or rendering the login page. Explicit Mapdown
sign-out suppresses another silent attempt in that tab, manual Sign in remains available, and no
document is uploaded implicitly. Acceptance requires signed-in/signed-out Studio paths, wrong
origin rejection, explicit-sign-out suppression, existing handoff contract tests, full tests,
typechecks, lint and both production builds.

### Stage 2 — explicit account save

- Add a small Pages Functions backend to the Mapdown project, bound to the existing D1 database
  and R2 bucket. `bcailab_session` remains host-only and unchanged. A signed, 60-second,
  audience-bound, single-use handoff from `bcailab.com` creates an independent host-only
  `mapdown_session`; token replay, tampering, expiry, wrong audience and wrong subject fail.
- Reuse the main site's Google, email-code and password sign-in UI, returning the popup to
  `/auth/mapdown` after authentication. The handoff secret is a dedicated
  `MAPDOWN_HANDOFF_SECRET`, configured on both Pages projects and never committed. Preview
  integration requires one exact `MAPDOWN_PREVIEW_ORIGIN` matching Mapdown's Preview
  `MAPDOWN_ORIGIN`, a build-time `VITE_WEB_ORIGIN` pointing Mapdown at the stable Web Preview,
  and the same Preview D1 on both apps; arbitrary commit-preview hosts remain rejected.
- Save a versioned, lossless internal JSON snapshot only after an explicit per-document action.
  The server issues the cloud document id; the client document id is only a user-scoped
  idempotency key. Cloud list/read/update/delete operations are owner-scoped, with a foreign id
  indistinguishable from a missing id and private responses marked `private, no-store`.
- Use optimistic concurrency. Updating version N succeeds only if N is current. A stale save
  never overwrites the remote copy and creates a separate local conflicted copy for inspection;
  no realtime collaboration or automatic merge is introduced.
- The local library shows Local only / Saved online / Published state, includes online-only
  documents after sign-in, and can download an online snapshot into IndexedDB without losing
  its node ids, collapse state, sides, selection or theme. Selection-only recovery snapshots do
  not turn Saved online into a false pending-content state.

Capacity limits, derived from synthetic 100/500/2,000-node maps rather than user telemetry:
100 private documents per user, 512 KiB UTF-8 per private snapshot, 120 Unicode code points per
title, and the existing 10,000-node structural ceiling. The 2,000-node representative map is
approximately 317 KiB as JSON, leaving headroom below both this product cap and D1's 2 MB row
limit.

Acceptance: cross-implementation handoff proof tests; replay/expiry/audience/tamper tests;
session-cookie scope tests; request-body, snapshot-schema, invariant, ownership, idempotency and
optimistic-concurrency tests; local D1 migration and Pages Functions verification; signed-out
offline regression; authenticated browser coverage for sign-in, first save, repeat save,
online-only open, conflict copy and cloud delete; typechecks, lint, full tests and production
builds. Deployment is migration-first under ADR 0008.

### Stage 3 — frozen publication

- Publishing requires a Mapdown account and an existing cloud document. The client explicitly
  uploads canonical Markdown, the already-rendered script-free SVG, and a 1200×630 PNG rendered
  from the same layout for link previews. The public record is a
  frozen version; ordinary local edits and cloud saves do not change it until **Update
  published version** is invoked.
- Publish/update confirmation names the map and node count and states that current changes are
  first saved online. The resulting public URL and Copy link stay visible inside the document
  library; online-only rows explain that a local open is required to render public assets.
- Serve unlisted URLs as `https://share.bcailab.com/p/{random-id}`. The viewer host receives no
  authenticated cookie, renders user content only through an isolated SVG `<img>`, applies a
  strict CSP and `noindex`, and provides keyboard-operable zoom/fit controls plus a no-JavaScript
  image fallback. The SVG remains the reader asset; `og:image` uses the PNG because common link
  unfurlers do not render SVG previews.
- Unpublish revokes the active record and returns uncached 404 responses immediately on the
  next request; republishing after revocation creates a new random URL. Deleting a cloud
  document also revokes its active publication. Old R2 objects may be cleaned after the D1
  revocation because the database record is the serving authority.
- Provide a bounded public report form without recording document content in logs. Reporter IP
  addresses are stored only as a keyed digest; at most three reports per public URL and digest
  are accepted in 24 hours. Operational takedown remains a D1 revocation, documented in the
  infrastructure procedure.

Capacity limits: 25 active publications per user, 256 KiB canonical Markdown, 2 MiB SVG and
4 MiB PNG per published version. The fixed PNG canvas contains 3.0 MiB of raw RGBA pixels before
compression; the representative 2,000-node map is approximately 129 KiB Markdown and 1.27 MiB SVG.

Acceptance: frozen/update semantics, active-publication quota, SVG/Markdown/content-type
validation, inert hostile labels, no authenticated cookie on the share host, CSP/noindex/OG
metadata, report throttling, republish-new-URL behavior, and uncached 404 after unpublish;
browser coverage at desktop and mobile widths with and without JavaScript; Mapdown and web
typechecks, lint, full tests, and both production builds. These checks passed before owner
acceptance on 2026-08-23.

## Now — Mapdown library page, live published viewer, and copy — accepted (2026-08-25)

The owner authorized this iteration on 2026-08-24 and confirmed its four scoping decisions:
the library becomes a full-page route replacing the dialog; the published viewer is driven by a
new public view snapshot rather than the published Markdown; **Copy** produces a local map in
the visitor's browser; and the interaction work targets the publish flow, save/sign-in feedback,
and the list itself, with editor canvas interaction explicitly out of scope. The design and the
reasoning are in
[the library and live viewer proposal](mapdown/library-and-live-viewer-proposal.md).

The owner reviewed the three surfaces in a browser and accepted the completed iteration **as a
first version** on 2026-08-25.

**Published-host fallback follow-up — accepted (2026-08-25).** The owner accepted commit
`0b96513` after it was pushed. The change closes the D-31 gap found by the first deploy. A
top-level `404.html` disables Pages' implicit SPA fallback, so unlisted paths on both Mapdown
hostnames return 404 while the three explicit app paths continue through middleware. Review
evidence: the route/config test requires the 404 page,
the production build copies it unchanged to the output root, Mapdown browser and Functions
typechecks/lint pass, and all 664 repository tests pass. `wrangler pages dev` remains blocked by
the recorded esbuild `import-source` incompatibility, so the post-deploy probe must confirm
unknown paths return 404 on both hostnames.

**The Pages Functions runtime gap is now closed (2026-08-26).** Acceptance could not cover it: no
local run exercised the real D1/R2 handlers, because `wrangler pages dev` fails to build
Functions in this environment (an esbuild/wrangler version mismatch), so the published page and
the copy endpoint were driven against a static harness. Migration
`0021_mapdown_publication_view.sql` was applied to production D1 before the deploy under ADR
0008, and the owed live check has since run against a real publication: publish → the live
viewer expanding and collapsing a branch → **Make a copy** → unpublish. After the unpublish,
`/p/{id}`, `/p/{id}/map.json`, `/p/{id}/map.svg`, `/p/{id}/map.md` and
`/api/publications/{id}` all return `no-store` 404s with `cf-cache-status` DYNAMIC or BYPASS.

The deploy found two defects that no local check could have caught, both fixed and recorded in
`docs/changelog.md`: a `_redirects` rewrite that Pages normalised into a redirect to the site
root, and a client-side id pattern that assumed hexadecimal where `randomToken(16)` emits
base64url.

**Windows node-editing height follow-up — accepted (2026-08-26).** The overlaid editing
`textarea` now suppresses its native scrollbars. Classic Windows scrollbars consume layout
width, unlike macOS overlay scrollbars; on a box sized exactly from canvas text metrics that
reduced the content area and could wrap every active label onto a second line. The node remains
the owner of live width and height while typing, so the editing control never needs an internal
scrollbar. Evidence: a focused regression test locks the overflow contract; Mapdown tests,
typecheck and production build pass.

### Stage 1 — the document library becomes a page

- Add a three-route client router to the Mapdown SPA (`/`, `/library`, `/import`) with
  `_routes.json` coverage, so `_middleware.ts` sees those paths on the published origin and
  redirects them to the editor host. (The Pages `_redirects` rewrite this originally used was
  withdrawn on 2026-08-25 after it broke both routes in production; the middleware serves the
  shell instead — see the D-31 correction.) The editor remains the default landing surface and stays mounted beneath the library,
  so browser Back returns to the same document, viewport and undo history.
- Replace the modal document library with a full page: one merged local + online list, an
  explicit per-row state (Local only / Unsaved changes / Saved online / Published / Published ·
  outdated / Conflicted copy), title search, sort by last edited or title, inline rename, and an
  explicit action column.
- Move publish, update published version, unpublish, the resulting public URL and Copy link into
  a detail panel for the selected map, so a publish result is never occluded by the surface that
  produced it.
- Keep every storage and cloud contract unchanged: delete stays confirmed and in-tab undoable,
  no document is uploaded without an explicit per-document action, and the signed-out offline
  workflow is unchanged.

Acceptance: direct, menu and command-registry entry to `/library`; Back preserving editor state;
every row state visible without opening a menu and *Saved online* never shown for a map with
unsaved local content; publish results staying visible; search and sort reporting empty results
honestly; keyboard and screen-reader operation at desktop, tablet and mobile widths under
reduced motion; an honest unavailable state when IndexedDB cannot be read; and `/library` and
`/import` not serving the editor on `share.bcailab.com`.

### Stage 2 — the published page becomes a live read-only map

- Publish an additional versioned **public view snapshot** (tree order, node text, first-level
  sides, collapse state, theme pair) to R2, referenced by a new nullable `view_key` column on
  `mapdown_publications`. The published Markdown cannot serve this role: import assigns every
  first-level node `side: "right"` and carries no collapse state, so a Markdown-driven viewer
  would contradict the frozen SVG beside it. Cap 512 KiB per view snapshot.
- Build the viewer as a separate Vite entry importing only `layout/`, `theme/` and the viewport
  helper — never the editor, model commands or storage — so no public code path can mutate a
  document. The Pages Function keeps generating the HTML and owns `og:`, `noindex`, canonical
  and CSP.
- A reader can expand and collapse nodes, pan, zoom, fit and reset, by pointer and by keyboard.
  Editing, selection commands and drag-to-move do not exist on this surface.
- Without JavaScript, or before the bundle loads, or when `map.json` fails, the existing frozen
  SVG `<img>` remains the rendering. Publications created before this stage keep the image
  viewer. CSP gains `connect-src 'self'` and nothing else.

Acceptance: first paint matching the frozen SVG in sides, collapse state and theme; pointer and
keyboard collapse/pan/zoom/fit with no mutation of the publication; a working no-JavaScript page
and PNG unfurling; pre-existing publications rendering without error; hostile node text inert in
the live viewer; no editor/storage/model-command import reachable from the public bundle;
uncached 404 after unpublish for both the page and `map.json`; and server-side validation of the
view snapshot's shape, size, node ceiling and root.

### Stage 3 — Copy

- The published page offers **Make a copy**, linking to `map.bcailab.com/import?src={publicId}`.
  A new unauthenticated, read-only `GET /api/publications/{publicId}` on the editor origin
  returns the active publication's title and view snapshot; the share host gains no write path
  and no session.
- Mapdown builds a new local document from the snapshot, stores it in IndexedDB and opens it.
  Putting it in an account remains the existing explicit *Save online* action. The copy records
  its source public id as provenance; it is a new document with new ids and creates no fork
  graph and no notification to the original author.

Acceptance: copy working signed out and creating exactly one local document; structure, sides,
collapse state and theme preserved; a revoked or unknown id failing clearly and creating
nothing; the endpoint being read-only, `no-store`, identical 404 for revoked and unknown, and
exposing no author identity; a second copy creating a second document; and the share host
gaining no authenticated cookie or mutation endpoint.

Migration `0021_mapdown_publication_view.sql` is applied before the code that reads it is
deployed, `--remote` for production D1 (ADR 0008).

## Now — Mapdown canvas-first chrome — accepted (2026-08-26)

Authorized by the owner on 2026-08-26. The editor currently reads as a web page with a toolbar
above a canvas band: `.editor-shell` is a four-row grid and the map occupies the third row. The
owner's complaint is that this feels fragmented next to Figma and Excalidraw, where the canvas is
the page and the controls float on it.

- Make the map fill the viewport and float the chrome over it: the toolbar, the status line, the
  authoring hint and the existing zoom capsule become overlays that reserve no layout space.
- Teach `fitMap` about those overlays. With chrome floating, fitting to the full viewport puts
  the topmost nodes underneath the toolbar; the fit must target the unobscured area and centre
  the map there. Default behaviour with no insets stays exactly as it is today, so the published
  viewer is unaffected.
- Keep the interaction contract intact. This is presentation only: no change to pan, zoom,
  selection, editing, or the layout engine.

Acceptance:

- (a) The map occupies the full viewport, and no floating control reserves layout space.
- (b) **Fit** leaves every node visible — nothing lands under the toolbar or the status line, at
  desktop, tablet and mobile widths.
- (c) The canvas remains a **single tab stop** (`spec/accessibility.md` §16), and the floating
  controls are reachable by keyboard in a predictable order.
- (d) Coarse-pointer targets stay at 44 px; `prefers-reduced-motion` is respected; light and dark
  both hold up.
- (e) Help and the document library still open above the chrome, and the existing
  `data-overlay-background` inert mechanism still makes everything behind them unreachable.
- (f) No regression to the 500/2000-node benchmark, since floating chrome must not change what
  the canvas re-renders.

**Not in this iteration**, and recorded in `docs/exploration.md` instead: expand/collapse motion,
and the "smoother canvas" question the owner raised alongside it. The owner explicitly declined
to commit to either.

## Now — Mapdown: the root label is the map's name everywhere — accepted (2026-08-26)

Authorized by the owner on 2026-08-26 after the document library shipped and every row read
`Untitled`. This is not a new design decision — it finishes one already made. **D-18** settled
the same question for download filenames on 2026-08-04, *after the same symptom*: "the internal
document title is initialized or imported but has no editing surface, so it can remain
`Untitled` while the visible map has a meaningful name. The root label is the identity users see
and control." Downloads were changed then; the library and the published page were not, because
neither existed yet.

`spec/storage-export.md` §10.3 is the constraint that shapes the fix: *"The root node text is not
automatically forced to equal the filename/title."* So the two values must **not** be merged.
`title` keeps its real job — the imported filename or front-matter title, i.e. provenance — and
stops being what a person is shown.

- Show the root label wherever a map is named to a person: the library rows, the library detail
  panel, the rename field, the destructive-action confirmations, and the published page's `<h1>`,
  `<title>` and `og:title`. Fall back to `title`, then to a neutral placeholder when the root is
  empty.
- Search and sort operate on the displayed name, not on the hidden one.
- Carry `rootLabel` on the document index entry, written wherever `nodeCount` already is, so the
  library renders a row without loading its snapshot.
- **Rename edits the root node**, not `title`. It is otherwise a button with no visible effect —
  the same defect in the opposite direction.

**The asymmetry is accepted, not hidden** (owner's decision, 2026-08-26). Renaming the map open
in the editor goes through history and is undoable, because `spec/vision.md` §4.8 requires every
structural action to be undoable. Renaming a map that is not open edits its stored snapshot
directly, where no history exists; it is covered by the library's existing in-tab undo instead.

Acceptance:

- (a) A map created, imported, or copied from a published link shows its root label in the
  library and on its published page — never `Untitled` while the root says something else. This
  includes a row that exists **only** in an account: the save endpoints derive the stored name
  with the same rule the client uses, so the account list does not become the one surface left
  behind. A row last written by an older client keeps its provenance title until it is saved
  again; no migration backfills it.
- (b) An empty root falls back predictably, and the fallback is the same string in the library
  and on the published page.
- (c) Rename changes what the canvas shows. On the open map it is undoable through history; on
  any other map it is covered by the library's in-tab undo.
- (d) Search and sort match what the row displays.
- (e) `title` is unchanged as a stored field: import still populates it from the filename or
  front matter, and Markdown import/export semantics do not move (§10.3).
- (f) Download filenames still follow D-18, unchanged.

**Not in this iteration.** Existing publications are frozen, so a published map keeps its old
public title until its owner runs *Update published version* — that is D-29's freeze semantics
working, not a bug to route around. No data migration: existing index entries gain `rootLabel`
the next time they are written. Whether the library should become Mapdown's landing surface is a
separate question the owner deferred until names are real.

## Now — English Studio material, memory, and interaction iteration — accepted (2026-08-15)

The owner authorized this iteration and decisions D1-D5 on 2026-08-09. Implementation
continued past the original branch: `codex/english-studio-major-iteration` is now fully
contained in **`codex/ui-navigation-polish`**, which carries the UI/IA work that followed and
is the branch to review. The detailed design and failure registry live in
[the iteration plan](english-studio-major-iteration-proposal.md); what has shipped and its
acceptance state is in [the changelog](changelog.md). Only the owner moves an item to
accepted.

### Product boundary and invariants

- This branch covers English Studio only. Mapdown Create with AI remains authorized in Next,
  but is a separate branch and release.
- Prompt levels are discovery metadata, not measured ability. Never render a null level as B1
  and never lock material by band.
- Translation text is persisted only after an explicit signed-in **Save** action. There is no
  automatic history or anonymous persistence.
- Writing-to-profile measurement remains deferred. Prompt metadata must allow a future writing
  vocabulary without claiming that the vocabulary exists now.
- New Reading evaluations stop requesting `next_drills`; stored historical feedback that has
  the field must remain readable.

### Remaining quality note

The accepted Writing prompt-bank record still notes that a second-party content review has
not happened; publication used the owner as both reviewer and approver. This caveat remains
open. A new review/publication task would need its own scope and fresh manifest. Accepted A–E
scope and evidence are preserved in [the historical record](roadmap-accepted-history.md).

### Explicitly excluded from this iteration

Mapdown Create with AI; writing-to-profile measurement; Dictation v2/session matching;
long-document translation; first-token/provider/AI-Gateway work; model-routing hot config;
LLM-signal weight promotion; Chinese UI; paid tier; profile settings; and further
Reading/Dictation library expansion.

### A. Writing prompt bank and guided entry — accepted

- Add a reviewable `writing_prompts` contract with stable identity, family/task type, prompt
  text, optional CEFR discovery band, topic, target words, optional reviewed asset, provenance,
  editorial status, and timestamps. Add a nullable prompt reference to writing articles while
  preserving the article's assignment as an immutable snapshot.
- Add deterministic intake/validation and idempotent publication tooling. The first batch is
  exactly 48 original prompts: 24 general prompts (six each for A2/B1/B2/C1), 12 IELTS
  Academic Task 1 prompts with reviewed chart/table/process/map assets, and 12 IELTS Task 2
  prompts across the four common task families.
- Generated artifacts may be committed as drafts, but no prompt becomes published until
  automated validation, an independent content review, and owner review of all flagged items
  plus the agreed sample are complete.
- Make `/writing` a material-led catalogue with family/task filters, visible learner work and
  progress, and repeated attempts as distinct articles. Preserve freeform writing at
  `/writing/new`; no prompt may be hidden because of level.
- Starting a published prompt must use its correct coach, target, and asset and save both its
  stable prompt reference and immutable assignment snapshot. Draft/retired prompts never
  appear or start; retiring/editing a prompt never rewrites existing work.
- Add a distinct IELTS Academic Task 1 evaluation contract. The anonymous trial uses one
  reviewed featured prompt without gaining catalogue access, persistence, or extra quota.

Acceptance evidence: validation/parser unit tests; a 48-item manifest with zero validator
errors and review status; local D1 checks for published/draft/retired visibility, immutable
snapshots, and repeated attempts; browser coverage for catalogue, prompt detail/start,
freeform entry, Task 1/Task 2, trial, progress, mobile, keyboard, and reduced motion.

Review evidence (2026-08-10): deterministic validation passes for all 48 source prompts
(24 general, 12 Task 1, 12 Task 2); all 12 derived Task 1 assets and the review pack match
batch hash `38d84de9ab133f3308d3ac95ec24a06c243ef60f58b6bcfc9a08244836864078`.
Fresh local D1 applies all 17 migrations with no foreign-key violations; browser/D1 fixtures
cover no-write preview, atomic/idempotent first submission, immutable snapshots, feedback
retry generations, failure recovery, trial, and responsive catalogue/detail layouts.

Publication status (2026-08-10): the batch is approved and published to development and
production D1; `/writing` serves all 48 assignments. The approval was recorded by a single
reviewer — the owner acted as both independent content reviewer and approving owner, with no
second party — in `docs/approvals/writing-prompts-38d84de9.json`. A second-party content
review is therefore still outstanding as a quality step, and would need a fresh manifest.
Publication does not by itself make this item accepted; only the owner makes that transition.

### B. Saved translations — accepted

- Add private, user-owned saved translations containing the source/result language metadata
  and timestamps. Saving is explicit, signed-in only, retry/double-click idempotent, and
  available after the existing popup-auth handoff without losing the in-memory result.
- Add an authenticated, bounded/paginated `/translate/saved` workspace with list/detail and
  confirmed hard delete. Every read and mutation is user-scoped; foreign and absent ids are
  indistinguishable. Failed/partial streams cannot be saved.
- Keep the feature out of the universal navigation rail: it is history inside the Translate
  workspace, consistent with the English Studio information architecture.

Acceptance evidence: pure validation/idempotency tests where applicable; local D1 checks for
no implicit or anonymous persistence, owner-only save/read/delete, retry stability, bounded
queries, and deletion; browser coverage for anonymous-to-auth Save, list/detail/delete,
mobile, keyboard, and failure recovery.

Review evidence (2026-08-10): proof tests cover tampering, expiry, subject changes,
normalization, size limits, and anonymous-to-auth handoff. Local D1/browser fixtures cover
explicit-only persistence, replay idempotency, snapshot integrity, two-user isolation,
same-result 404s, 25-row keyset pagination, confirmed hard delete, no-JavaScript redirect,
failed streams, and consecutive results that do not inherit `Saved` state. Private responses
use `Cache-Control: private, no-store`; no remote migration or deployment was performed.

### C. Shared interaction and layout correctness — accepted

- On narrow Translate layouts, keep the primary action reachable and reveal completed output;
  long input grows to a bounded height and the page owns ordinary reading scroll. Preserve
  streaming, selection, keyboard shortcuts, reduced motion, and no-JavaScript behavior.
- The mobile navigation drawer traps focus, makes covered content inert, closes by Escape and
  backdrop, locks background scroll, and restores focus. Navigation remains usable if drawer
  JavaScript fails.
- Give Reading's record control a state-dependent accessible name.
- Replace the duplicate Reading/Writing feedback-language keys with one English Studio
  preference, one-time compatibility fallback, and same-tab updates.
- Replace the five native web-app `confirm()` calls with one accessible branded dialog,
  including cancel/confirm, keyboard, pending, and return-focus paths. Mapdown is excluded.
- Replace Writing's static evaluation wait with honest narrative progress while preserving
  retry/failure behavior; do not add fake progress to Translate's real stream.

Acceptance evidence: relevant unit tests plus browser QA at desktop/tablet/mobile widths,
keyboard-only, reduced motion, and screen-reader accessibility-tree inspection. The four
planning-baseline failures (Translate mobile reveal, drawer focus escape, unnamed Reading
record control, unguided Writing trial) must all be closed without new console errors.

Review evidence (2026-08-10): browser QA at 375, 768, and 1280px verifies Translate action
reachability, output reveal, drawer `inert`/focus loop/Escape restoration, dialog role/title/
description/return focus, and Writing catalogue/detail layouts with no console errors.
Standard-tier QA found and fixed two remaining touch-target defects; the relevant Writing
links and Translate language selectors now measure 44px. Reduced-motion rules are present in
the production bundle; dynamic emulation was best-effort only because the isolated browser's
CDP allowlist rejects `Emulation.setEmulatedMedia`.

Acceptance-review follow-up (2026-08-10): nested Writing loaders now preserve the schema
unavailable state during Remix's parallel loading; trial submission is server-pinned to the
single featured slug; first-submit keys survive loader revalidation; article deletion retains
learner revisions; and recent-piece dates use the hydration-safe local formatter. Translation
completion is now independent from Save-proof eligibility, so output beyond the 40,000-character
Saved limit still completes and consumes quota without exposing Save. The first-batch census
was moved out of the shared prompt domain into seed policy, canonical sorting is locale
independent, publish SQL has explicit typed quoting, and the seed pipeline joins root
typecheck/tests. Mobile touch sizing is scoped to intended Studio controls, and destructive
form triggers cannot submit without the confirmation JavaScript path.

### D. Reading evaluation dead output — accepted

Remove `next_drills` from new evaluation prompts and generated schemas. Keep read compatibility
for existing stored payloads and leave the future one-tap drill/session lifecycle deferred.

Acceptance evidence: parser fixtures prove old feedback still loads; prompt/schema tests prove
new evaluations do not request or require `next_drills`.

Review evidence (2026-08-10): compatibility fixtures load legacy `next_drills`, while prompt
and schema tests prove new Reading evaluations neither request nor generate the field. The
full repository suite passes 558 tests.

### E. Scalable Studio navigation and material discovery — accepted

The owner authorized this follow-up on 2026-08-10 after reviewing the current desktop Writing
and Coach Home surfaces. It changes information architecture and presentation, not the
underlying learning, recommendation, or evaluation policies.

- Replace the heavy desktop rail treatment with a quieter, narrower navigation spine. Keep
  destinations, active state, account access, mobile drawer behavior, keyboard behavior, and
  the existing English Studio product boundary intact.
- Make `/english/home` action-first: continuation is primary, the coach recommendation is
  secondary, level/practice/coverage form a compact status summary, and detailed skills and
  recent activity read as lists rather than a dashboard card mosaic. Preserve the current
  recommendation seam and all null-level/no-locking invariants.
- Make `/writing` a category hub instead of rendering the complete prompt bank. It must expose
  General English, IELTS Academic Task 1, IELTS Academic Task 2, recent learner work, and the
  freeform path; a category selection opens a bounded catalogue and every published prompt
  remains reachable regardless of CEFR band.
- Keep catalogue state in the URL, query only the selected family/task and page, and use a
  bounded continuation mechanism rather than a client-side fetch of the whole bank. The
  resulting material-directory contract must be reusable by future Reading and Dictation
  catalogues without forcing material taxonomy onto Translate or Speech.
- Preserve the established editorial design tokens, responsive reading order, 44px primary
  touch targets, visible keyboard focus, reduced-motion behavior, and accessible names.
- Use **Session** for one durable Writing workspace and **Round** for a revision inside it.
  Rename the Writing hub's recent-work section accordingly and provide an authenticated,
  bounded `/writing/sessions` history where every non-deleted session remains reachable.

Acceptance evidence: focused query/filter/pagination tests; browser coverage at 375, 768, and
1280px for rail, Home, Writing hub, category catalogue, prompt detail, and continuation;
keyboard-only and reduced-motion checks; no new console errors; and the full repository test,
typecheck, and production build. Writing session history additionally covers empty, populated,
continued-page, and mobile layouts without loading an unbounded article collection. New materials, Reading/Dictation catalogue implementation,
global search, and a taxonomy/schema expansion are explicitly outside this follow-up.

Review evidence (2026-08-10): `/writing` now queries three collection counts instead of the
complete prompt bank; `/writing/library` keeps category, level/task-family, and opaque keyset
continuation state in the URL and reads at most 13 rows to render a 12-item page. The first
page promotes three non-duplicated assignments into the retained prompt-card treatment, then
uses compact rows for the remaining bank. Authenticated browser checks cover the rail, cold
Coach Home, Writing hub, catalogue, second-page continuation, drawer focus/Escape restoration,
visible keyboard focus, and 44px mobile actions at 375/768/1280px with no horizontal overflow.
Owner-review follow-up moves shallow detail return links to the leading edge and uses compact
breadcrumbs for Writing's real hub → collection → prompt hierarchy, including category-aware
prompt return destinations. Prompt-backed learner work extends that context through the source
assignment to the current piece; freeform work keeps a compact Writing → piece trail.
The in-app browser injects `#codex-browser-sidebar-comments-root` as a third child of `<html>`,
which produces Remix hydration warnings in that test surface; standalone browser checks are
clean, and no application runtime error was observed. The full suite passes 561 tests, Web
typecheck passes, and the production build succeeds.

Session-history follow-up (2026-08-10): Writing now uses Session for one durable workspace
and Round for an in-session revision. `/writing` exposes six recent sessions and links to the
authenticated `/writing/sessions` history; the history reads 21 rows to render a 20-item page
with a stable opaque continuation cursor. Cursor/unit coverage includes first and continued
pages. Authenticated empty-state browser QA at a 351px content width verifies breadcrumb
semantics, 44px actions, and no horizontal overflow. The full suite now passes 564 tests;
Web typecheck and the production build pass.

Filter-interaction follow-up (2026-08-10): bounded Writing catalogues expose every available
level or task-family choice as a direct URL-backed link, including All. Selection immediately
loads the filtered first page without an intermediate Apply action; native link semantics keep
the interaction available to keyboards and without JavaScript.

Home-density follow-up (2026-08-10): the action zone groups continuation and recommendation
into two lightweight, equal-height panels; recommendation alternatives become subordinate
text actions rather than competing buttons. The status summary moves closer in one bounded
strip, and a lone detail section uses the full available width instead of reserving an empty
second column. Authenticated cold-state QA at 351px verifies reflow, 44px primary and level
actions, and no horizontal overflow; the full suite, Web typecheck, and production build pass.

Owner-review correction (2026-08-11): removed the equal-height framed Home panels after they
turned useful whitespace into visible empty card space. Continue now leads with a single
editorial rule, the recommendation stays unboxed, alternatives form a stable vertical action
list, and status uses open dividers instead of another container. Null-level recommendations
no longer claim to fit a known level; learners with history but no estimate regain the direct
level picker; Coverage reads the practised passage bands rather than the bounded recommendation
window; and Writing continuation names its last edit. Translate and Speech now share the same
title → workspace tabs → tool canvas rhythm: Translate uses a bounded two-pane workspace with
visible From/To labels, while Speech uses a narrower unboxed compose surface with a persistent
text label, linked help/count text, visible focus, and a mobile-sized editor that keeps Generate
in the first viewport. Browser checks at a 351px content width confirm no horizontal overflow
and first-viewport primary actions on Translate and Speech; all 564 tests, root typecheck, and
the production build pass.

History-surface follow-up (2026-08-11): Saved translations and Speech History no longer
repeat creation actions that are already available through their workspace tabs. Saved
translations keeps Translate as the single return path; Speech History removes its second,
oversized History heading and begins directly with the generation list or concise empty state.

Translate focus follow-up (2026-08-11): the composer keeps a clear two-pixel keyboard focus
indicator, inset within the input so it no longer obscures the two-pane divider or workspace
boundaries.

## Now — Mapdown production MVP

The owner authorized Mapdown implementation through the Phase 2 production-MVP exit criteria
on 2026-08-04. Phase 1 merged in PR #26; Phase 2 implementation and deployment are complete
and **accepted** (owner, 2026-08-15). Its acceptance criteria
are `docs/mapdown/spec/phases.md` §4 plus the scenario matrix in
`docs/mapdown/spec/testing-acceptance.md`.

The owner additionally authorized three Mapdown stabilization checkpoints on 2026-08-04:

- **P0 active-draft persistence — accepted.** Text visible in the editing textarea must be
  included in the debounced local snapshot before the editing session commits; direct refresh
  inside and after the debounce window must restore it; the saved indicator must track the
  visible draft; typing must retain one undo group; the textarea, node box and connectors must
  follow the visible draft in real time without creating per-keypress history entries; and
  leaving the empty node created by Enter must remove only that empty node, never the text that
  Enter just committed. Double-clicking a node must continue editing at the end of its existing
  label; `F2` remains the select-all replacement path.
- **Visual polish — accepted.** Reduce the top-level toolbar to a
  clear 6–7-control information hierarchy without losing commands; establish primary,
  secondary and quiet control styles; replace the unstyled theme picker; distinguish selection
  from node type; improve connector and collapse-control legibility; and establish consistent
  chrome spacing, typography and focus treatment. Keep chrome visuals out of document themes
  and exported SVG/PNG. Before increasing node typography, align layout measurement with
  rendered font metrics. Verify desktop, tablet, mobile, keyboard and reduced-motion behavior.
- **Interaction-state clarification — accepted.** Editing Enter must commit only and return
  the same node to selected mode; selected-mode Enter must create exactly one sibling/root
  child; a new empty leaf must not multiply on repeated Enter. The state machine must be
  recorded as an event/guard/action/next-state table. Markdown, SVG and PNG downloads must use
  the sanitized current root label with a safe fallback. `⌘0`/`Ctrl+0` must restore canvas zoom
  to 100% without changing viewport centre, document content or semantic history.

The owner authorized a fourth and fifth Mapdown checkpoint on 2026-08-06:

- **Canvas affordances — accepted.** Four independent items, each shippable
  alone. (a) Move the zoom control out of the status bar and View menu into a floating
  bottom-left capsule (− percent +), where clicking the percentage restores 100%; the View
  menu keeps its entries. (b) Show a dismissable hint line on an untouched empty map naming
  the two authoring keys (Enter = sibling, Tab = child); it must disappear once the map has
  any content beyond the root and must never appear in an export. (c) Choose the initial
  document theme from the system colour scheme — light systems open Minimal Light, dark
  systems open Dark — as an **initial value only**: once the user picks a theme, or a stored
  document carries one, the system preference is ignored for that document. (d) Give nodes a
  hover treatment distinct from both the selected and the editing state. Acceptance for all
  four: chrome visuals stay out of document themes and exported SVG/PNG; keyboard and
  screen-reader behaviour is unchanged; verified at desktop, tablet and mobile widths and
  under reduced-motion.
- **Theme differentiation — accepted, all three steps.** The four presets read as hue variants
  of one design because the branch palette reaches only connector strokes: `branchColorFor()`
  is consumed for stroke colour alone, so node fills always come from a single per-role token
  and no theme can look structurally different from another. Three ordered steps, each
  shippable alone.
  1. **Palette reaches the nodes.** In `by-first-level-branch` mode the branch colour must
     drive first-level node fill as well as connector stroke, with node text switched to the
     accessible contrast partner of that fill. Descendants follow the theme's existing
     `descendantTintPolicy`. Acceptance: every palette colour in every preset yields node text
     at WCAG AA or better against its own fill; `single` mode renders exactly as it does today;
     SVG and PNG exports carry the fills as literals.
  2. **Presets differ in shape language, not only hue.** Give the presets genuinely distinct
     node geometry — corner radius, border presence and weight, padding density, and root
     treatment — instead of today's near-identical `node()` defaults. The typography scale
     belongs to this step. Acceptance: the four presets are distinguishable in a grayscale
     screenshot.
  3. **Split the theme into two orthogonal fields — shape language × palette.** Acceptance:
     Markdown front matter carries both fields; a document written with the current single
     `themeId` still opens and maps onto the pair; the picker presents the two axes separately.
- **Sequencing constraint (owner, 2026-08-06): step 3 must land before any Mapdown publish or
  share-URL feature.** The theme id is persisted in Markdown front matter, so it becomes a
  public contract the moment a published URL carries it; splitting the field is close to free
  now and requires format migration plus back-compatibility afterwards. Publish is not yet on
  this roadmap — when it is added, this constraint applies to it. **Step 3 shipped 2026-08-06
  (PR #37), so this gate is clear**; the front matter now carries `shape:` and `palette:` and a
  published URL can safely reference either axis.

## Now — Readability and Home action hierarchy (iteration 6) — accepted (2026-09-18)

Owner-authorized 2026-09-17: F06 and the bounded Home hierarchy follow-up.
Keep the current palette, typography, recommendation logic and product boundaries.

Acceptance:
- Necessary supporting text and placeholders meet 4.5:1 against their rendered light/dark
  backgrounds; required input boundaries and custom focus indicators meet 3:1. Preserve
  light decorative dividers and distinguish disabled controls from actionable ones.
- Continue is the primary Home action when available; recommendation Start is secondary.
  Without Continue, recommendation Start is primary. Recent status stays next to its title
  and wraps with long content on narrow screens.
- Verify Home, Writing and Dictation in light/dark, narrow layouts and keyboard use, with
  stable input labels and visible focus. Compare identical fixture data between themes.
- Exercise cold, Continue-only, recommendation-only, combined, empty/degraded and long-title
  Home states using isolated data. Record actual checks and limitations; update behavior docs.

Review evidence (2026-09-17): `verify:web` passes 227 tests, typechecks, build and 29 isolated
D1/HTTP assertions; lint has 0 errors and 7 existing warnings in this scope. Six contrast-token
regressions include both dark modes; the old colors fail all three supporting-text cases.
Manual browser checks covered the Home state matrix, light/dark input contrast, narrow reflow,
labels, Tab focus and mobile navigation Escape/focus return. See [changelog](changelog.md) and
[fixture instructions](../scripts/testing/README.md). Screen-reader speech, forced-colors rendering
and real audio were not tested. Owner accepted (2026-09-18).

No Reading experiment, recommendation algorithm, font replacement, Mapdown redesign or
release/CI changes. Report `in_review`; The owner accepted this on 2026-09-18.


## Now — Documentation authority and drift repair (iteration 5) — accepted (2026-09-18)

Owner-authorized 2026-09-17. Establish a concise docs entry point; repair the reviewed Writing
rail, Home, layout-width and testing-scope conflicts against code. Preserve settled product
boundaries and distinguish historical review evidence from current guidance.

Acceptance:
- The entry point answers what is authorized, how actual behavior is established, how to verify,
  and how to publish; conflicts between intent, implementation and dated evidence have a rule.
- Architecture describes component relationships rather than duplicating the complete route list.
- Already accepted roadmap details move to a dated historical record without losing text,
  evidence or old anchors. Keep summaries, still-open caveats and all unaccepted work reachable;
  do not infer new acceptance or reorder active work.
- Context packs fail on missing selected inputs and explicitly requested files, classify history
  separately from intent/derived facts, and never leave an apparently successful partial pack.
  Generated output stays untracked; existing secret-handling boundaries remain.
- Extend bounded docs checks to the repaired/entry documents and explicit document-role markers.
  Exercise context profiles and failure cases using synthetic copies, including a missing input.

Review evidence (2026-09-17): the documentation entry point and factual repairs are complete.
Accepted history preserves 93 original paragraphs and 22 old heading anchors; unaccepted work
remains active. Combined verification passes (744 tests, 25 D1/HTTP assertions), plus 31 context
checks and two expected documentation failures. All four real-checkout pack profiles generate.
See [delivery record](changelog.md) and [documentation entry point](README.md). Owner accepted (2026-09-18).

No product behavior, visual refresh, CI/deployment changes, Reading experiment or wholesale docs
folder reorganization. Report delivery as `in_review`; the owner accepted it on 2026-09-18.


## Now — Local verification entry points (iteration 4) — accepted (2026-09-18)

Owner-authorized 2026-09-17. Add `verify:web`, `verify:mapdown`, and `verify` with explicit
scope for tests, typechecks, lint, builds and operational documentation checks. Preserve the
per-package TypeScript choices. Root verification must include Mapdown client and Functions.
Reuse the isolated Writing/Home D1 fixture as an automatic check and document how to repeat
browser checks; do not silently report manual browser checks as automated passes.

Acceptance:
- All three commands run locally, identify their scope and failing step, and exit nonzero on
  failure. Required tools/input files cannot be silently skipped. Check Node compatibility and
  the repository's declared pnpm version before starting.
- Web covers its shared packages, existing seed/grader/worker checks, React regressions, build
  and isolated D1/HTTP checks. Mapdown covers client and Functions tests/types, lint and build.
  Combined verification covers both without relying on the legacy Web-only root build.
- Deliberate unit, type and lint failures block the appropriate product command; a Functions
  type error blocks combined verification. A broken operational-doc link also blocks verification.
  Keep a reproducible failure-injection command that restores its temporary changes.
- Document command boundaries, prerequisite tools, D1/browser invocation and limitations.
  Limit doc checking to verification/workflow instructions and required inputs; semantic doc
  drift and historical-doc reorganization belong to a later iteration.

Review evidence (2026-09-17): all three verify commands pass; 744 tests, 25 D1/HTTP assertions,
and eight injected failures confirm scope and fail-fast behavior. See [verification instructions](verification.md)
and [changelog](changelog.md). Browser interaction checks remain manual; owner acceptance is pending.

No CI, remote settings, deployment mechanism, production migration, product behavior or Reading
experiment changes are authorized in this iteration. Delivery is `in_review`, with evidence in
changelog; The owner accepted this on 2026-09-18.


## Now — Writing reliability and Home data correctness — accepted (2026-09-18)

Owner-authorized 2026-09-16: iterations 1–3 of the review follow-up plan. Implement in this
order, one independently reviewable change per iteration. The review's findings F01–F05 are
inputs, not authorization for the remaining review batches.

### 1. Writing retry lifecycle (F01) — in_review

Consume each retry response once, by article/revision/feedback generation; keep feedback task
start time separate from revision creation time. Acceptance: a React regression fails on the old
loop and passes after the fix; retry → pending → completed terminates; old responses cannot reset
completed feedback or overwrite another article/round; browser polling continues then stops with
no update-depth warning. Additive response fields preserve existing API consumers.

### 2. Writing draft recovery and account isolation (F02/F03) — in_review

One account-scoped local draft contract for freeform, assignments and new rounds, carrying text,
topic/coach, base revision, update time and first-submit identity. Existing unscoped keys are not
automatically assigned to whoever is signed in. Anonymous trials remain non-persistent. Acceptance:
refresh/return and failed requests preserve input; server revalidation does not overwrite dirty
edits; account B cannot see account A's draft; a lost successful first-submit response followed by
refresh/retry creates one article and Round 1; success only clears the corresponding submitted
version; unavailable storage is visible. Verify through an isolated browser and real local D1.

### 3. Home bounded inputs and degradation (F04/F05) — in_review

Separate level/adjacent candidates from record-referenced passages needed for Continue/Recent.
Keep queries and returned rows bounded; absence from a candidate window is not withdrawal.
Acceptance: >60 and uneven-band fixtures retain B2 recommendations and old eligible unfinished
work; withdrawn passages stay excluded; profile/history/library failures each have an intentional
fallback, with unknown level never displayed as B1; authentication failures retain their existing
behavior. Verify SQL against local D1 and error paths against the dev server.

### Delivery and exclusions

Review evidence (2026-09-17): see the four reliability entries in [changelog](changelog.md)
and [the reproducible local fixture](../scripts/testing/README.md). Owner accepted (2026-09-18).

Each iteration includes its behavioral docs, defect-specific regression tests and changelog
entry marked `in_review`. Minimal React/D1/browser test support belongs with these fixes; the
broader verify/CI/docs reorganization is not authorized here. No Reading enablement, Stage 2
category work, quota redesign, visual refresh, Mapdown changes, push or deployment is included.


## Now — Material library expansion — accepted (2026-09-18)

The owner authorized this on 2026-08-27, together with
[ADR 0009](decisions/0009-ielts-is-a-material-family-not-a-second-product.md), which settles
that IELTS is a family of material rather than a second product. This is a **content-and-review
push, not engineering**: the pipelines already exist and are unchanged by this item
(`scripts/material-seed/` for passages, `scripts/writing-prompt-seed/` for prompts).

**Counts confirmed by the owner 2026-08-27.** Drafts for both halves are generated and
validated; nothing is published.

**Correction to this item's own framing (2026-08-27).** "Content-and-review push, not
engineering" held for the passages and was wrong for the writing prompts. The first batch's
census — exactly 48 prompts, 12 per IELTS task, 2 per Task 1 kind, 3 per Task 2 kind — was
frozen as literals in three places: `scripts/writing-prompt-seed/policy.ts`, a second copy in
`packages/db/src/writing-prompt-content.test.ts`, and the `validate` command's summary line.
Any second batch was therefore a code change by construction. The census now lives in one
`WRITING_PROMPT_BATCH_CENSUS` constant with its totals derived from it, the duplicate assertion
is gone, and the summary counts instead of stating. No schema, taxonomy, evaluator or navigation
change was needed, so the item's boundary held even though its cost estimate did not.

### Scope

- **Graded passages: 40 → 80** (from ten per band to twenty, across A2/B1/B2/C1). One passage
  continues to serve both dictation and reading-aloud. Every newly published passage gets its
  per-sentence audio *and* its whole-passage reference recording in the same pass, so TTS is
  paid once.
- **IELTS writing prompts: 24 → 48** (from twelve to twenty-four each for Academic Task 1 and
  Task 2). Task 1 additions need reviewed chart/table/process/map assets on the same terms as
  the first batch.
- **General writing prompts: unchanged at 24.** Writing thinness is not the current complaint;
  passage thinness is.

### Explicitly out of scope

- **IELTS Listening and IELTS Reading material.** ADR 0009 keeps them out: they need
  question-type schemas and timed-section semantics that do not exist, which is product work
  with its own authorization, not a content push.
- **Reading's topic/state filters.** The stated trigger was "a band passes roughly thirty";
  twenty per band still browses fine, so this stays deferred rather than being folded in.
- **Backfilling reference audio** for the twenty passages published before reference recordings
  existed. Optional, costs a fresh TTS pass, and is not blocking anything.
- Any schema, taxonomy, evaluator, or navigation change.

### Acceptance criteria

- Every new passage passes `intake.ts` with zero errors — sentence count, per-sentence length,
  title shape, duplicate titles, and the digits rule — before any review time is spent on it.
- Generation follows the recorded review policy: a capable model generates, a second independent
  LLM pass checks each item against the constraints and flags doubt, and the owner reviews the
  flagged set plus an agreed sample. Register stays distinct per band (one sub-agent per band).
- New writing prompts pass deterministic validation and are published with a batch manifest and
  hash, exactly as batch `38d84de9` was. **Publication requires owner approval of the manifest**;
  an agent never publishes a batch on its own.
- Publication is idempotent and additive: republishing changes nothing, and no existing passage,
  prompt, learner attempt, or stored assignment snapshot is rewritten.
- `tag.ts` is re-run across the whole library afterwards, since it replaces tags wholesale and
  is the intended path rather than a migration.
- Local D1 checks confirm the new counts per band and per task family, and that Reading,
  Dictation and Writing catalogues page correctly at the larger size with no unbounded query.

### Progress — published, in_review (2026-09-18)

- **Passages 40 → 80.** The existing forty were one passage per topic per band across ten
  topics; the new forty add ten topics on the same grid (education, technology, money,
  neighbourhood, sport, music, pets, housing, friendship, celebrations), so the library stays
  one passage per topic per band. All eighty pass `intake.ts`: 8–12 sentences, no sentence over
  110 characters, no digits, valid titles, and no duplicate title anywhere in the library.
- **IELTS prompts 24 → 48**, source 48 → 72. Task 1 goes 2 → 4 per material kind across all six
  kinds; Task 2 goes 3 → 6 per family across all four. General prompts untouched at 24.
- **Published to production 2026-09-18.** Two people reviewed the content on 2026-09-18 at
  16:00 America/Vancouver — kaixi as the independent reader, Z.Sun as owner — recorded in
  [the batch approval](approvals/writing-prompts-034b84f4.json). Forty passages were published
  (TTS → R2 → D1) and the whole eighty-passage library re-tagged. Production D1 now reads 80
  library passages with 822 sentence rows and 60 carrying reference audio (the twenty published
  before reference audio existed still have none); the writing bank holds 72 published prompts,
  24 per family. `preflight --remote` and `verify --remote` pass; the new Task 1 assets answer
  200 from the production domain.
- **A pipeline defect surfaced only at this size.** The writing bank's publish path built one
  multi-row `INSERT`. At 72 prompts that statement measured 133 KB and D1 refused it
  (`SQLITE_TOOBIG`, against a limit near 100 KB), where the 48-prompt first batch had fitted at
  about 89 KB. Statements are now packed to a documented 60 KB budget, each repeating the same
  upsert clause; three tests cover the split. The refused attempt wrote nothing — a statement is
  atomic — and the retry published all 72 in three statements.
- **Provenance moved for the already-published 48.** Publication is a whole-bank upsert, so
  those rows now carry batch `034b84f4`'s `review_manifest_json` and a `reviewed_at` where the
  column was previously null. Per-row `owner_approved_hash` (the content hash) and every prompt
  text are unchanged, and both columns are storage provenance that the app never renders. What
  is no longer visible in the database is that the first batch's own record — the one whose note
  states no second-party review was performed — lives on only as the committed
  [approval file](approvals/writing-prompts-38d84de9.json) and in git history.
- **The second-model review, and what the owner decided about it.** A model other than the one
  that generated the batch was asked, after publication, to review it independently. It found no
  defect — mechanical constraints, every Task 1 item's arithmetic, the derived SVGs and production
  against the reviewed drafts all held — and flagged four wording or arithmetic choices plus one
  substantive observation: the earlier register corrections measured sentence length but never
  lexical difficulty, and at B2 the new ten passages are simpler than the existing shelf on the
  tagger's own `rare_word_ratio` by a margin that separates the groups completely, while that
  proxy also places the existing B2 shelf above the existing C1 shelf. The owner accepted the
  batch as published on 2026-09-18 and kept the observation as guidance for the next batch rather
  than reopening this one. Reading and options:
  [the model review](spikes/material-batch-034b84f4-model-review.md).
- **The reference-audio gap is closed.** The twenty passages published before reference recordings
  existed were backfilled on 2026-09-19 by
  [`scripts/material-seed/reference-backfill.ts`](../scripts/material-seed/reference-backfill.ts),
  a one-off that reuses the publish pipeline's TTS and bucket handling, skips any passage already
  marked complete, and caches synthesized MP3s so a failure does not re-spend. All eighty library
  passages now carry a completed reference recording, verified in production D1 with the uploaded
  objects re-downloaded from the bucket at their recorded byte sizes. One run was interrupted by
  the intermittent wrangler `7403` error after its upload; the retry reused the cached audio.
- **Deferred.** Reading's topic/state filters stay deferred at twenty per band.
- **Catalogue size check.** Counts were confirmed against production D1 per band and per task
  family. The Writing catalogue query is bounded (`limit` clamped to 12–24 with a `hasNext`
  probe) and the Home candidate queries were exercised against an eighty-passage fixture in the
  isolated D1/HTTP suite, so neither grew unbounded with the library.

### The honest caveat, recorded deliberately

Expansion here is **supply-side work against unmeasured demand**. The library is thin, but no
learner has yet exhausted a band, because there are effectively no learners. Twenty per band is
chosen to remove the most visible thinness, not because a measurement asked for it — the
demand-driven alternative (expand what the practice engine asks for and cannot find) needs a
practice engine that does not exist yet. If usage later shows learners concentrating in one
band or one family, that evidence should redirect the *next* batch rather than this one.

## Now — Chinese interface for Chinese-speaking learners — accepted (2026-09-22)

The owner named the first cohort on 2026-09-22 — Chinese-speaking learners — and required a
Chinese interface, confirming three decisions the same day. Recorded as
[ADR 0011](decisions/0011-chinese-ui-same-url-feedback-follows-interface.md), which supersedes
[ADR 0003](decisions/0003-defer-chinese-ui.md); mechanism, coverage and reasoning in
[the design](chinese-ui-design.md).

This runs alongside "Now — Learner context for graders", which is open only for its Reading half
and is blocked there on two owner decisions and a recording corpus that do not exist yet. Neither
item is deprioritized by the other, and nothing here touches the learner brief.

Half the capability already exists and the scope depends on knowing which half: Reading and
Writing already produce Chinese feedback from a shared `localStorage` preference that defaults to
English and is reachable only from inside those two tools' settings; **Dictation has no language
option at all**; and the interface is English with no catalogue, switcher or locale routing.

### Decisions (owner, 2026-09-22)

- **D1 — Scope is the whole of English Studio**, including the homepage that leads with it.
  Mapdown, Posts and `/about` are out. Learning material stays English.
- **D2 — One URL per page.** The locale is a cookie, negotiated from `Accept-Language` on a first
  visit, with an explicit switcher and no redirect. No `/zh` prefix; search engines will index the
  English rendering, and that cost is accepted.
- **D3 — Feedback language follows the interface by default**, and Dictation gains Chinese output.
  The existing setting survives as an explicit override.
- **D4 / D5 (recommended, not separately confirmed)** — Simplified only, with `zh-TW` negotiating
  to it; and nothing stored is retranslated.

### Scope

- A pure locale module plus a cookie and a `POST /locale` switcher that works without JavaScript,
  a `LocaleProvider` beside the existing `Outlet` context rather than inside it, and one helper so
  route `meta` is localized too. Design §3.
- Two typed catalogues, where the Chinese one is typed against the English one so a missing string
  is a type error rather than a silent English fallback.
- Every learner-facing surface of English Studio in the design's §4 coverage list, including page
  titles, meta descriptions, validation and error text, empty states and assistive text.
- Locale-aware typography rules for the styles that do not survive translation — mono uppercase
  labels with letter-spacing, italic emphasis, line height and fit — written into
  `docs/design-system.md` as rules, not patched per component. Design §6.
- The feedback preference becomes three-valued (follow the interface / English / Chinese), and
  `dictation-feedback.server.ts` gains the language directive the other two graders have. Design §5.

### Acceptance criteria

- (a) **Negotiation is pure and unit-tested**: cookie outranks header; `zh`, `zh-CN`, `zh-Hans`,
  `zh-SG`, `zh-TW`, `zh-HK` resolve to `zh`; weighting decides a mixed header; unknown or
  malformed input resolves to `en` and never throws.
- (b) **An untranslated string cannot ship.** The Chinese catalogue is typed against the English
  one, and a test asserts the two key sets are identical. There is no runtime fallback that
  renders English inside a Chinese page.
- (c) **Server-rendered in the negotiated language**, with no flash of English after hydration;
  `<html lang>` matches; the error boundary renders with a sane `lang` when loader data is absent.
- (d) **Coverage is checked against the design's §4 list**, surface by surface, and the checklist
  is recorded. No user-visible English remains on a covered surface, including titles, meta
  descriptions, form errors, empty states and `aria-label`s.
- (e) **Switching works without JavaScript**: the form posts, the cookie is set for a year, the
  visitor returns to the page they were on, and an explicit choice outranks the header on every
  later visit.
- (f) **One URL, two languages, no stale cache.** Document responses are verified not to be
  cached across locales — either uncached or varying on the cookie.
- (g) **Feedback language.** Default follows the interface; the setting offers three states; an
  existing explicit `en`/`zh` preference migrates to an explicit override and is never silently
  converted; Dictation feedback is produced in Chinese when selected, for first attempts, retries
  and trials alike, proven by prompt fixtures whose only change is the language directive.
- (h) **Nothing else moves.** No migration; no change to stored feedback schemas,
  `learner-context.ts`, the learner brief's English rendering, `learner_tag_observations`,
  `SOURCE_WEIGHT`, or CEFR resolution. Stored feedback renders in its original language.
- (i) **Verification.** `pnpm test`, typechecks, lint (0 errors) and both production builds pass;
  the first-contact path is walked on an isolated dev server with `Accept-Language: zh-CN` and
  again after switching to English; light and dark themes and mobile width are each checked for
  the typography rules in (d), with screenshot evidence.
- (j) **Docs in the same PR.** The feedback-language sections of `docs/tools/dictation.md`,
  `docs/tools/esl.md` and `docs/tools/writing.md`; the Chinese typography rules in
  `docs/design-system.md`; `docs/access-model.md` if locale affects any access rule; and a
  `docs/changelog.md` entry marked `in_review` per stage.

### Stages

Independently shippable, in the order a Chinese visitor meets them, so stopping early still
leaves the most valuable part done.

1. **Mechanism and first contact** — negotiation, cookie, switcher, provider, meta helper,
   typography rules; homepage, `/english`, header, login popup, and Dictation end to end.
2. **The remaining tools** — Reading, Writing, Translate, Speech, with their trials, settings and
   progress surfaces.
3. **Signed-in surfaces and feedback language** — Home, Progress, the three-valued preference, and
   Dictation's Chinese feedback.

### Explicitly excluded

Mapdown, Posts and `/about`; learning material, prompts, passage titles and TTS audio; Traditional
Chinese; locale-prefixed URLs and any Chinese SEO work; bilingual feedback output; retranslating
stored feedback; product analytics; and giving signed-out visitors Dictation feedback — which
stays signed-in only, so the Chinese entry path still ends without an explanation of the learner's
errors. That hole is real and is recorded in the design's §8, not fixed here.

### Progress

Accepted by the owner on 2026-09-22, all three stages, including the migration of an earlier
stored `en` to Follow interface — the departure from criterion (g) recorded below.

- **Stage 1 — mechanism and first contact: accepted (2026-09-22).** Negotiation, cookie,
  no-JS switcher, provider, meta helper and Chinese typography rules; the homepage, `/english`,
  site header, studio rail, sign-in popup, error boundary and Dictation library/session/summary
  render in Chinese. Evidence and the surface-by-surface checklist: `docs/changelog.md` and
  design §9.
- **Stage 2 — the remaining tools: accepted (2026-09-22).** Translate, Speech, Reading and
  Writing, with their trials, settings and progress pages, and the profile page, render in the
  interface language; dates follow it. Evidence: `docs/changelog.md` and design §9. Stage 3 is not
  started; until it is, Home and the Progress overview show English content inside a Chinese rail.
- **Stage 3 — signed-in surfaces and feedback language: accepted (2026-09-22).** Home and the
  Progress overview render in the interface language; the shared feedback setting offers Follow
  interface / English / Chinese; Dictation feedback is produced in Chinese when the resolved
  language is Chinese; the sign-in email is written in the requesting page's language. Earlier
  feedback is not retranslated (owner, 2026-09-22). Evidence: `docs/changelog.md` and design §9. **One departure from criterion
  (g), for the owner's decision:** an earlier stored `en` migrates to Follow interface rather than
  to an explicit English choice, because the earlier code persisted `en` as a default and the two
  cannot be told apart (design §5, *As built*). A stored `zh` stays explicit as written.

## Now — English Studio Home v3 — accepted (2026-09-23)

The owner authorized this on 2026-09-23, after reviewing three outside Home mockups and agreeing
[the design](home-v3-design.md). Decisions O1–O3 were taken as recommended (design §8). It changes
how `/english/home` presents what `selectStarterPractice()` already returns. Each state gets one
protagonist and one primary button. It does not change what is recommended.

### Acceptance criteria

- (a) **States.** S1–S4 and the degraded state render as design §4, in both interface languages.
  A pure view-model function decides the state, the hero and the strip. Its tests assert exactly
  one primary action per state.
- (b) **S1 dictation hero.** It shows a progress bar and `done / total` from `sentences_done` and
  the passage's sentence count. Its button names sentence `done + 1`.
- (c) **Recommendation.** It renders as a strip under Continue in S1 and as the hero in S2. The
  directional alternatives are text links, and only directions the seam returned are shown.
- (d) **Excluded content.** No duration, streak, cross-mode average, tool grid or chart appears
  on Home.
- (e) **Recent.** It shows design §5.4's bars and never repeats the Continue passage. It still
  shows up to three rows.
- (f) **O1.** A Writing session last updated more than 14 days before the request is not offered
  as Continue. Unit tests cover 13 and 15 days, and both kinds present.
- (g) **O2.** The Writing hero states the latest round's feedback state, from one bounded query
  on that single article. No copy claims the feedback is unread.
- (h) **O3.** The meta line shows the passage's stored topic and leaves it out when absent.
- (i) **Layout.** At 390 px there is no horizontal scroll and the primary button is at least
  48 px tall. Dark mode keeps bars and text at the design system's contrast.
- (j) **Existing tests still pass,** including the ADR 0006 invariants and the Home data-bounds
  behaviour.

### Progress

- **Implemented — accepted (2026-09-23)** by the owner after checking it in production (merged as PR #74). Evidence:
  - (a): `utils/home-view.ts` decides the state, hero and strip. 11 tests, including exactly one
    primary action in each of five input shapes.
  - (f): `WRITING_CONTINUE_MAX_AGE_DAYS = 14` in `selectStarterPractice()`, with the request time
    passed in. Five tests cover 13 days, 15 days, a stale draft falling back to an older
    dictation, a dictation never ageing out, and no cutoff without a time.
  - (e): `recentWithoutContinue` has three tests.
  - (g): `getLatestWritingRevision`, one query on the Continue article only.
  - Automated checks: 865 tests pass, as do typecheck, lint (0 errors) and both builds.
  - Browser fixture:
    - User `a`: S1 with Writing Continue, the round-state line and the recommendation strip.
    - User `b`: S1 with dictation Continue and its progress bar; Recent without the Continue
      passage.
    - User `recommend`: S2.
    - User `cold`: S3.
    - Chinese and English interfaces.
    - At 375 px in dark mode: no horizontal scroll, a 48 px primary, and one `.btn-primary`.
  - Not seen in the browser: S4 (neither Continue nor a recommendation) and the degraded
    notice. Their markup follows the same hero component; S4's layout is covered by the
    one-primary test.

### Explicitly excluded

- Any change to what `selectStarterPractice()` recommends.
- A Today plan, streaks, duration estimates, and Home panels that duplicate `/english/progress`.

## Now — Dictation sentence navigator — accepted (2026-09-23)

The owner authorized this on 2026-09-23. It covers the step-navigation requirement recorded in
[`ux-follow-ups-2026-07-30.md`](ux-follow-ups-2026-07-30.md) §3B, which had never been scheduled.
Today a session shows only "Sentence n of m". The learner cannot see the passage's shape or go
back to a checked sentence.

### Decisions (owner, 2026-09-23)

- **D1 — Review only.** A checked sentence can be replayed and its result read, but not
  re-answered or re-checked. The score stays a record of the first attempt.
- **D2 — Later sentences are locked.** There is no forward skipping and no "leave unanswered"
  action.

### Acceptance criteria

- (a) **Navigator.** A horizontal navigator shows one step per sentence, in three states that
  are distinct by more than colour: checked (reachable), current, and locked (not reachable,
  with a lock). It scrolls horizontally when it does not fit, and keeps the current step in
  view.
- (b) **Going back.** Selecting a checked step shows that sentence's answer, diff and reference,
  and lets the learner replay its audio. The answer cannot be edited or checked again. A single
  primary action returns to the first unchecked sentence. Typed-but-unchecked text there, the
  checks already made, and session progress are all preserved.
- (c) **After a resume.** Checked sentences are reviewable exactly as in (b). The loader
  re-scores each stored answer server-side and returns the reference only for checked
  sentences; unchecked sentences' text never reaches the client.
- (d) **Honest counts.** Listens during review do not change a sentence's stored replay count.
  A resumed attempt keeps the replay counts stored before the resume, rather than resetting them
  to 0 at completion.
- (e) **Accessibility.** The navigator is keyboard-operable: steps are buttons, and locked steps
  are disabled with an accessible name that says so. It works at 390 px with touch targets of at
  least 40 px.
- (f) **Unchanged behaviour.** Scoring, completion, quota, anonymous sessions and the summary
  view are unchanged. Existing tests pass, and the new state logic is covered by unit tests.

### Progress

- **Implemented — accepted (2026-09-23)** by the owner after checking it in production (merged as PR #75). Evidence:
  - **Rules.** `utils/dictation-steps.ts` holds the frontier, step states, which steps can
    open, view mode and the return target. It has 13 tests.
  - **Resume re-scoring.** `reviewableResults` has 3 tests: the full diff is rebuilt; an
    unchecked sentence's reference never appears; a stale index is ignored.
  - **Automated checks.** 881 tests pass, as do typecheck, lint (0 errors) and both builds.
  - **Browser fixture, user `b`, 3-sentence passage:**
    - checking unlocks the next step;
    - text typed at the frontier survives reviewing an earlier sentence;
    - review shows the note and "Back to sentence 3", and returns with focus in the answer;
    - after a reload, earlier sentences are restored as checked, with their stored answers and
      accuracies;
    - a programmatic change to a checked answer was found and is now ignored;
    - in the Chinese interface at 375 px: no horizontal scroll, and 40 × 44 px steps.
  - **Not seen in the browser:** a long passage where the navigator has to scroll. The fixture
    passages have 3 sentences; the strip uses `overflow-x: auto` and scrolls the step on screen
    into view.
  - **Found while testing.** The fixture's resumable attempt claims `sentences_done = 1` with no
    stored results. Resume now starts from the stored results (see `docs/tools/dictation.md`,
    *Sentence navigator*).

### Explicitly excluded

- Re-answering a checked sentence, and skipping ahead.
- Per-sentence audio duration and the check-shortcut hint (§3C and §3D of the same follow-ups
  document).

## Now — Home v3.1: fewer words — accepted (2026-09-23)

The owner authorized this on 2026-09-23; it started once the Dictation sentence navigator was
accepted. It came from outside feedback (ChatGPT) that Home still explains too much. The
assessment agreed with the owner keeps Home v3's structure and removes repetition, testing each
line by whether it changes what the learner does next.

### Acceptance criteria

- (a) The dictation Continue hero drops "N sentences left" from the greeting and "your checked
  sentences are kept" from beside the button. The button reads "Continue dictation". The meta
  line drops the sentence count, because the progress bar carries it.
- (b) The greeting is the learner's name only, or nothing when there is no name. There is no
  time-of-day greeting, because the server cannot know the learner's clock.
- (c) A `level_fit` reason ("Fits your current level") is not shown. Reasons that explain a
  different choice (adjacent band, cross-mode, revisit) stay.
- (d) In S1 the recommendation strip is a whole-row link with no separate Start button, and its
  directional alternatives move into a `···` disclosure. As the S2 hero, the alternatives stay
  visible, because they are how a learner consents to exploring another band (ADR 0006).
- (e) The basis line becomes a compact level marker, with its explanation on hover or focus. The
  attempt count leaves Home; it is on Progress.
- (f) Mode stays in the meta line, because Home mixes modes. No duration estimate is added
  until per-passage practice time supports one.

### Progress

- **Implemented — accepted (2026-09-23)** by the owner after checking it in production (merged as PR #76). Evidence by criterion:
  - (a) The dictation hero's meta line is mode / band · topic, and its button reads "Continue
    dictation". The "checked sentences are kept" note is gone.
  - (b) The greeting is "{name}, welcome back." or nothing; cold start keeps its one-line brief.
  - (c) `practice.reason.levelFit` is hidden wherever it would appear. Other reasons show,
    including the no-level "starting point that helps estimate your level".
  - (d) In S1 the strip is a single `<Link>` (title, meta, any reason, arrow). The alternatives
    sit in a `<details>` disclosure beside it, not inside it. `homeLayout` now gives the S1
    recommendation `link` emphasis, and the one-primary tests still pass. The S2 hero keeps the
    alternatives visible.
  - (e) The basis line is a level chip whose explanation shows on hover or focus
    (`role="tooltip"`, `aria-describedby`). The attempt count is gone from Home. A no-level user
    sees the level picker instead. A profile failure keeps its one-line notice.
  - (f) Mode stays. No duration was added.
  - The S2 mode-explanation line added in v3 was also removed, in the same spirit.
  - 22 catalogue keys that no longer had a caller were removed.
  - Automated checks: 881 tests pass, typecheck passes, lint has 0 errors.
  - Browser fixture: users `b` (S1 dictation, chip tooltip, `···` menu), `recommend` (S2) and
    `a` (S1 Writing, at 375 px: no horizontal scroll, one `.btn-primary`).

## Former Next summary

- **Mapdown — production MVP (accepted 2026-08-15).** A static, local-first, keyboard-first
  Markdown mind-map editor at `apps/mapdown`, live at `map.bcailab.com`. The editor works:
  keyboard authoring (Enter/Tab/Shift+Tab), two-sided layout, four document themes,
  Markdown/SVG/PNG export, IndexedDB autosave with validated recovery, pan/zoom/fit,
  searchable Help/Command Center, and accessible tree semantics.
  All seventeen implementation steps and D-03 deployment are complete with evidence in
  `docs/mapdown/README.md` and `docs/changelog.md`. The production deployment and all five
  stabilization checkpoints were accepted by the owner on 2026-08-15. Read
  `docs/mapdown/decisions.md` before reopening any settled question — it has nineteen records,
  several of which correct an earlier
  mistake of mine and say so.
- **Dictation contributes practice duration** (owner-authorized 2026-08-12; in_review 2026-09-18;
  **accepted 2026-09-21**, evidence in `docs/changelog.md`, rule in `docs/tools/dictation.md`; production
  needs migration 0022 applied before the deploy).
  `total_practice_seconds` counts reading only: `learner-model.server.ts` passes
  `practiceSeconds: 0` for dictation because nothing times a dictation attempt. A learner who
  practises both modes therefore has a duration covering half their work. The surfaces were
  made honest rather than left overclaiming — Home dropped duration entirely, Progress renamed
  its card to *Reading time* and hides it at zero — so this item is about restoring the
  measurement, not about the copy. Acceptance: (a) a dictation attempt records elapsed practice
  time and adds it to `total_practice_seconds`; (b) resuming an in-progress attempt does not
  double-count time already recorded; (c) idle time with no interaction is excluded, by a
  documented rule; (d) Progress presents one duration covering every mode that measures one,
  renamed back from *Reading time*; and (e) existing rows are unaffected — historical dictation
  attempts stay at zero rather than being back-estimated. Explicitly excluded: timing Writing,
  whose unit of work is a submitted round rather than a timed sitting.
