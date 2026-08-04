# Mapdown — Decision Log

Decisions that are **not** in the upstream specification, or that amend it. Append; do not
rewrite history. Each entry records the reasoning, because the reasoning is what tells a future
reader whether a changed circumstance should reopen the decision.

All entries below were settled with the owner on **2026-08-01**, before any code existed.

---

## D-01 — Name and domain

**Decision.** The product is **Mapdown**, served from **`map.bcailab.com`**.

**Why.** "Markdown in, mind map out" — the name states the one thing that distinguishes it from
XMind, Excalidraw and the rest, which is that Markdown is the canonical semantic format rather
than an export option. Two nearby names were rejected as taken: `markmap` (the existing
markmap.js.org project) and `MindMark` (an existing mind-mapping product).

The subdomain is deliberately shorter than the product name. `map.` is easier to say, type and
remember; the brand lives in the page title and mark, not in the hostname.

---

## D-02 — Mapdown lives in this monorepo, as `apps/mapdown`

**Decision.** Mapdown is developed in the `bcailab` repo as a new workspace package under
`apps/`, not in a repository of its own.

**Why.** The third phase of the product plan — accounts, saved documents, paid tiers — runs on
the account system that already exists here. `packages/auth` exports `createSessionCookie`,
`getSessionUser`, `startGoogleOAuth`, `handleOAuthCallback` and the session table helpers,
against the same D1 instance and migrations. In-repo, adopting all of that is a
`"@bcailab/auth": "workspace:*"` dependency. Out-of-repo, it is one of: a duplicated session
system that will drift, a private registry to maintain, or cross-origin API plumbing. None of
those buy anything.

Secondary: one pinned toolchain (the root `pnpm.overrides` block fixes React, TypeScript, Vite
and Wrangler versions) instead of two, and one set of agent conventions — `AGENTS.md`,
`CLAUDE.md`, `docs/roadmap.md` — instead of a second copy that no agent working on the other
product would read. `AGENTS.md` already describes `apps/` as "Product surfaces (Remix app,
future tools)".

**Contrast with vanmemo**, which `docs/roadmap.md` records as permanently separate. That
decision turned on vanmemo sharing "almost nothing" while adding a second build system and a
second deploy pipeline: it has its own top-level domain, its own accounts, and a Next.js +
Auth.js stack. Mapdown differs on every one of those points — it stays under `bcailab.com`, it
adopts bcailab's accounts, and it adds no new server runtime. The two decisions are consistent
with the same rule, not exceptions to each other.

**Consequences.** Shared packages now have two consumers. Mapdown *consumes* `@bcailab/ui` in
no way today (D-05) and `@bcailab/auth` not yet; when a change to a shared package is made for
Mapdown's sake, `apps/web` must be verified in the same change.

**Reversible.** If Mapdown is ever open-sourced or spun out, `git subtree split` extracts
`apps/mapdown` with its history intact. Nothing here is a one-way door.

---

## D-03 — A second Cloudflare Pages project, not a second route tree

**Decision.** Mapdown deploys as its own Cloudflare Pages project, connected to the same GitHub
repository, with `map.bcailab.com` as its custom domain.

| Setting | Value |
|---|---|
| Root directory | `apps/mapdown` |
| Build command | `cd ../.. && pnpm install --frozen-lockfile && pnpm --filter mapdown build` |
| Build output directory | `dist` |
| Build watch paths | include `apps/mapdown/*`, `packages/*` |

> **Implementation note (2026-08-04).** `apps/mapdown/wrangler.toml` must retain
> `pages_build_output_dir = "dist"`. Without an app-local config, the monorepo build command
> discovers the repository-root Wrangler config for the main web project and rejects its
> `apps/web/build/client` output as outside Mapdown's configured root.

**Why.** This is forced, not chosen: the existing Pages project sets its root directory to
`apps/web` (see `docs/infra-cloudflare.md`), so it cannot see or build a sibling app. Two
projects from one repository is a supported Cloudflare configuration.

**Consequences.** Without **build watch paths** on *both* projects, every push to `main`
triggers two builds. Set them when the second project is created — the existing `apps/web`
project should be narrowed to `apps/web/*` + `packages/*` at the same time.

Because both hosts sit under the `bcailab.com` apex, the session cookie already reaches
`map.bcailab.com` — see the correction below.

> **Correction (2026-08-01).** This record originally stated that the session cookie is
> host-only and would need widening in phase three. **That was wrong**, and was written without
> checking the code. `getCookieDomain()` in `packages/auth/src/index.ts` returns
> `"bcailab.com"` for any hostname ending in `bcailab.com`, and an explicit `Domain` attribute
> makes a cookie valid for that domain *and all subdomains* (RFC 6265 §5.2.3 — the legacy
> leading dot is not required). `bcailab_session` will therefore be sent to `map.bcailab.com`
> from its first deploy, before Mapdown has any account feature. No work is needed to share
> sessions; the open question is whether that default is desirable, which is now the question
> recorded below.

---

## D-04 — A plain Vite SPA, not Remix

**Decision.** `apps/mapdown` is a client-rendered Vite + React application. It does not use
Remix and declares no D1 or R2 bindings.

**Why.** The specification requires a static, local-first editor that works with no server
(`spec/vision.md` §4.2). Remix would contribute an SSR runtime the product does not want and
bindings it does not use. A pnpm workspace places no constraint on the framework a member app
chooses — `apps/*` is only a glob.

**Consequences.** The two apps have different build and dev commands. That is the intended
cost, and it is bounded: the shared packages are plain TypeScript and framework-agnostic React.

---

## D-05 — No visual reuse; Mapdown owns its own design tokens

**Decision.** Mapdown does not depend on `@bcailab/ui` and inherits none of the Studio's visual
language. It defines its own neutral system — greys and white for chrome, a single accent —
under `apps/mapdown/src/styles/`.

**Why.** Three independent reasons converge, and it is worth keeping all three, because losing
one should not reopen the decision.

*Product.* A canvas tool's chrome must recede so the user's map is the figure and the
application is the ground. The specification already requires this in
`spec/product-specification.md` §2.1: "The shell SHOULD remain visually quiet so the map is the
primary surface." A content-consumption interface tuned for English Studio wants the opposite.

*Technical, and the strongest of the three.* Mapdown's themes are not chrome styling — they are
document data. A theme id is written into the Markdown front matter (`theme: soft-branches`),
and the theme's values must render inside an exported SVG that is required to carry **no
external dependency whatsoever** (`spec/storage-export.md` §12.3, §12.6). Document theme tokens
therefore have to be serialisable to literal values at export time. A browser-runtime CSS
custom property system, which is what `@bcailab/ui` provides, is structurally the wrong shape
for that job; reusing it would force a resolve-variables-to-literals step in the exporter for
no benefit.

*Brand.* Mapdown competes with Excalidraw, draw.io and markmap. A visitor arriving from a link
has no interest in an English-learning studio, and even once Mapdown is a paid product it stays
a distinct brand under the bcailab umbrella.

**Consequences.** Two design systems to maintain — acceptable precisely because they are
intended to differ and their overlap is near zero. Note that this costs nothing in the account
integration: `packages/auth` is logic-only (`src/index.ts`, exporting functions and types, with
no React component anywhere in it), so sharing sessions and sharing a visual language are
orthogonal. Mapdown will render its own sign-in surface against the shared session backend.

---

## D-06 — App chrome and document themes are two separate token systems

**Decision.** Two token layers, deliberately not unified. Specified in `design-tokens.md`, which
also records the two design constraints that follow from the split.

**Why.** They differ in lifetime, in serialisation, and in who chooses them: chrome is an
application preference, a document theme is a property of the document that travels with the
file and appears in exports. Collapsing them creates the trap recorded as constraint C-02 in
`design-tokens.md`.

---

## D-07 — Editorial changes made when the v1.0 baseline entered the repo

**Decision.** Three changes on intake, all editorial; no normative behaviour was altered.

1. The product name replaced the upstream working name in `spec/README.md`, `spec/vision.md`
   and `spec/product-specification.md` (5 occurrences of the proper noun; the common-noun
   phrase "mind map" was left alone).
2. `roadmap.md` is checked in as **`spec/phases.md`**. In this repo "roadmap" is reserved:
   `docs/roadmap.md` is the single source of truth for iteration planning, and two files with
   that name mean different things is a trap for the next agent. The document map in
   `spec/README.md` was updated to match.
3. The upstream single-file combined edition (`MindMap-Specification-v1.0.md`, ~176 KB) was
   **not** copied. It duplicates every normative statement in the split files; keeping both
   guarantees they drift.

The Chinese translation of the specification was likewise not copied, for the same
duplication-drift reason. English is normative.

---

## D-08 — `ControlTokens` no longer carries toolbar styling

**Decided 2026-08-01.** Amends `spec/theme.md` §10 — a normative schema change.

**Decision.** `toolbarBackground`, `toolbarText` and `toolbarBorder` are removed from
`ControlTokens`, and therefore from `MindMapTheme`. Application chrome is styled by Layer A and
is outside the theme schema. A new §10.1 states the rule in the specification itself.

**Why.** The interface bundled tokens with opposite export behaviour. The collapse badge is part
of the map and is **required to appear in exported images** (`spec/storage-export.md` §12.2);
the toolbar is chrome and is excluded from every export. Keeping them in one interface implied
that a document theme could restyle the application frame — which would mean that exporting a
Business-themed map asserted something about the toolbar, a claim with no meaning. Full
reasoning: `design-tokens.md` §5.

**Consequences.** A theme preset defines six collapse tokens rather than nine. Chrome tokens
live in `apps/mapdown/src/styles/`. No behaviour described elsewhere in the specification
changes: no other document referenced these three tokens, verified before the edit.

---

## D-09 — `markdown-format.md` §14.3 restated as a rule

**Decided 2026-08-01.** Amends `spec/markdown-format.md` §14.3 — **presentation only; the rule
is unchanged.**

**Decision.** The section previously offered three candidate approaches to exporting empty node
labels and rejected two of them in running prose ("But that pollutes Markdown…"), leaving the
operative rule buried in the discussion. It now states the rule directly: an empty root exports
as `#`, an empty ordinary node exports as a bare `-` with no trailing whitespace, no placeholder
and no sentinel.

**Why.** A normative document that argues with itself gets implemented inconsistently, and this
one would have been read by an implementer building the serialiser. The conclusion the original
reached was sound; only its presentation was not.

**What was preserved.** The two rejected alternatives are retained as a short note, because the
reasoning bears on any future revision: `- Untitled` was rejected for silently inventing content
and changing document semantics; `- <!-- empty -->` was rejected for polluting the file and
breaking portability. The section also now states explicitly that the round trip of a bare list
marker is parser-dependent and therefore a **required** test rather than a recommendation, and
that the editor's `emptyPlaceholderText` must never be written to the exported file.

---

## D-10 — The session cookie is host-only until a second host needs it

**Decided 2026-08-01.** Applied in `packages/auth/src/index.ts`, and locked by
`packages/auth/src/session-cookie.test.ts`. That change ships as its own pull request, separate
from this documentation — deliberately, since it fixes the existing product and Mapdown has no
code yet.

**Decision.** `bcailab_session` sets no `Domain` attribute. It does not reach
`map.bcailab.com`. Sharing it with a second host is a deliberate change made when phase three
needs one, not a default inherited from a helper that happened to be written that way.

**Why.** An explicit `Domain` is all-or-nothing: it covers the domain and *every* subdomain
(RFC 6265 §5.2.3), with no way to include one and exclude another. The trade was a free phase
three against an authenticated cookie sitting on a static origin that has no use for it.

The asymmetry decided it. Tightening now costs one function deletion and a test; leaving it open
costs a standing exposure that only shows up when something goes wrong. And because subdomains
are same-**site**, `SameSite=lax` gives no separation between `map.bcailab.com` and
`bcailab.com` — a protection people commonly assume is there. Mapdown will import arbitrary
Markdown and generate SVG, so it is precisely the kind of application that should not share a
site boundary with an authenticated app before it has to.

**Verified before changing.** `www.bcailab.com` has no DNS record, so no real session is split.
Logout is unaffected: `destroySession()` deletes the D1 row, so server-side revocation is the
source of truth and a lingering legacy cookie carries an id that no longer resolves.

**Consequences.** Phase three must widen this explicitly, with its own review. The constraint is
locked by `packages/auth/src/session-cookie.test.ts`, which was confirmed to fail when `domain`
is reintroduced. `httpOnly`, `SameSite` and the localhost `Secure` exemption are locked in the
same test, so tightening one attribute cannot quietly loosen another.

---

## D-11 — URL-fragment sharing is approved, after the serialiser is stable

**Decided 2026-08-01.** Approved as future work. **Not yet scheduled**; see `docs/roadmap.md`.

**Decision.** Mapdown will support sharing a map by compressing its Markdown into the **URL
fragment**. Build it once canonical Markdown export is stable — that is, after Phase 1 — and not
before.

**Why.** Sharing is the one thing a local-first tool cannot otherwise do, and it works with no
backend and no account, which is the whole first phase of the product. A shared link is also its
own distribution. Building it before the serialiser settles would mean rebuilding it.

**Binding constraint — the fragment, never the query string.** The payload MUST live after `#`.
A fragment is never sent to the server, so no document content reaches Cloudflare's logs.
`spec/product-specification.md` §20 requires that the app not transmit document content by
default; a query string would violate that requirement, not merely be untidy.

**Binding constraint — version the payload.** The encoded payload MUST begin with a format
version. This is the one part of the design that cannot be retrofitted: without it, every link
ever shared breaks the first time the encoding changes. With it, old links can be migrated. The
cost now is one byte.

**Known limits, to be surfaced in the UI rather than hidden.** Browsers accept large fragments
and Markdown compresses well, so length is not the real ceiling — chat clients truncating long
URLs is. A shared link is a *snapshot*: it cannot be edited, and losing the link loses the copy.
The UI must not let it look like durable storage.

**Alternatives considered.** A short-link service backed by a server — rejected for phase one:
it would require the backend the product is defined by not having, and it would put user content
on a server the privacy stance says it never touches.

---

## D-12 — 科判 outlines are validation material, not a product commitment

**Decided 2026-08-01.**

**Decision.** A real 科判 (Buddhist-study) outline is adopted as a **test fixture** for Phase 0
and Phase 1. It does not make 科判 a supported vertical, and it earns no feature of its own.

**Why it is the right fixture.** This content happens to exercise all three risks Phase 0 exists
to retire, which no synthetic English sample would: it nests five or six levels deep, which
stresses variable-size tidy-tree layout and the collapse projection; its labels are long CJK
strings, which stress text measurement, wrapping, and Chinese IME inside canvas editing; and a
科判 is meant to be *looked at*, so CJK-safe SVG and PNG export is the fixture's own pass/fail
condition rather than a separate concern. Testing the spikes on Latin placeholder text would
route around every hazard the spikes were written to find.

**Why the line matters.** `spec/vision.md` §2 lists Buddhist-study outlines among the target use
cases, and left unqualified that could pull the product toward outline numbering schemes, deep
outline navigation, or per-branch presets — none of which fit an ordered tree with automatic
layout. Any such request goes through the scope rubric in `spec/phases.md` §11 like any other,
with no standing built from this decision.

**Consequences.** One non-sensitive outline is committed as a fixture, and layout and export
regressions run against real deep CJK structure from Phase 0 onward. The owner selects the
outline.

---

## D-13 — Mapdown builds on TypeScript 7; `apps/web` stays on 5.9.3

**Decided 2026-08-02.**

**Decision.** `apps/mapdown` uses TypeScript **7.x** (`latest` at the time of writing is 7.0.2).
`apps/web` stays on **5.9.3**, unchanged. `typescript` is therefore removed from the root
`pnpm.overrides` block and pinned per package instead.

**Why TypeScript 7.** It is the compiler rewritten in Go — a build-performance change, not a
language version bump — and it is now the stable `latest` on npm rather than a preview. Mapdown
is greenfield with no legacy type surface, so it carries none of the migration risk that makes
this decision hard elsewhere, and compiler speed compounds over the life of a project that will
be edited constantly.

**Why `apps/web` does not move with it.** Not conservatism — **risk independence**. `apps/web`
runs on Remix 2.17.4, a framework generation behind (Remix 2's successor is React Router 7).
Validating TypeScript 7 against its type surface and the `@remix-run/dev` Vite plugin is a task
with its own failure modes and its own value, and it has nothing to do with Mapdown. Coupling
them would let an unrelated problem block a new product from starting. `apps/web` should move
when someone decides to move it, on that task's own evidence.

**Mechanics, and why they are safe.** The root `pnpm.overrides` block is a workspace-wide hard
constraint: while `typescript` sat in it, no package could choose its own version. Removing it
leaves `apps/web` bit-identical, because `apps/web/package.json` already pins `5.9.3` in its own
`devDependencies` — the override was redundant for that package. The root `devDependencies` pin
stays at `5.9.3` as well.

**Relationship to D-02.** That record listed "one pinned toolchain instead of two" among the
monorepo's benefits. This is the first time that benefit becomes a cost, and it is worth being
honest that it does. It does not reopen D-02: the decisive argument was always `packages/auth`,
not the toolchain, and per-package pinning is the ordinary way a workspace handles this — two
TypeScript versions in one repository is normal, not a symptom.

**Verified on the scaffold (2026-08-02).** No friction found. TypeScript 7.0.2 typechecks the
scaffold — React 18.3.1 with `@types/react` 18.3.27, `vite/client` types, `@vitejs/plugin-react`
and the `vite.config.ts` itself — in **0.83 s**, and `pnpm --filter mapdown build`
(`tsc --noEmit && vite build`) completes end to end in **1.5 s**. `pnpm --filter mapdown exec tsc
--version` reports 7.0.2 while `pnpm --filter web exec tsc --version` reports 5.9.3, so the two
versions genuinely coexist in one workspace. `apps/web` typecheck and the 118-test suite were
re-run unchanged.

Still unverified, because those dependencies do not exist yet: whatever Mapdown adds later —
a Markdown parser, a compression library for D-11's share payload, a test runner for the app.
Record any friction here.

**Not changed in the same pass.** `vite` stays pinned at 5.4.21 by the root overrides, and React
at 18.3.1. One variable at a time: TypeScript was the question, and a scaffold that fails should
implicate one change, not three.

**Rollback.** One line in `apps/mapdown/package.json`. If TypeScript 7 proves troublesome, that
app returns to 5.9.3 without touching anything else.

---

## D-14 — Phase 2 must swap in a real CommonMark parser, and the reason is a test blind spot

**Recorded 2026-08-03**, from building the Phase 1 serialiser.

**What happened.** `markdown/parse.ts` is a small hand-written reader, written so that §15's
round-trip guarantee could be tested at all — a serialiser with no reader is unverifiable. It
passes every round-trip test. **A mutation check showed those tests were nearly worthless:**
switching inline escaping off entirely left all 202 tests green.

**Why.** The parser does not interpret inline Markdown, so unescaped `*x*` survives it untouched
and comes back identical. The round trip proved the serialiser and this parser agree with *each
other* — not that either is correct. Testing a serialiser against your own parser measures
symmetry, not conformance.

**Fixed for now** by pinning the escaping contract to concrete output (`escapeLabel("*x*")` must
equal `\*x\*`) rather than to a round trip. Those assertions do fail under mutation, verified.

**The standing consequence.** `markdown-format.md` §10.4 requires a documented
CommonMark-compatible parser, and Phase 2 must actually adopt one. A real parser strips `*x*` to
`x`, which is precisely the case the current reader cannot exercise. Until then, **round-trip
tests in this repository are evidence about symmetry only**, and the byte-level assertions are
the real contract.

**For whoever does it:** when the CommonMark parser lands, re-run the same mutation — disable
escaping and confirm the round-trip tests go red. If they stay green, the new parser is not
being exercised either.

> **Resolved 2026-08-03.** `markdown/parse.ts` now parses the document body with `commonmark`
> (0.31.2, the reference implementation), walking its AST instead of matching lines against
> hand-written regexes. Front matter parsing is unchanged — it was never CommonMark's job, and
> §7.2's anti-YAML reasoning still applies to it.
>
> **The mutation was re-run.** Disabling `escapeLabel` now turns **21 of 63** markdown tests red
> (previously: 0 of 202). The parser is genuinely being exercised.
>
> **One test changed, not regressed.** `- A\n      - B` (six-space indent) no longer produces a
> nested `B` under `A`. Real CommonMark resolves six spaces of indent here as lazy continuation of
> A's paragraph, not a new nested list — §4.3 only asks for a child node "if the Markdown parser
> already resolves it that way," and a real parser does not. The old hand-written reader invented
> that nested node from indentation alone; this is D-14's own premise showing up in a test, not a
> new defect. Updated in `markdown.test.ts` with the CommonMark reasoning inline.
>
> **Escaping still works the same way, for a different reason.** `escapeLabel`/`unescapeLabel`
> (`escape.ts`) are unchanged and still used on export. On import, `unescapeLabel` is no longer
> called — CommonMark performs backslash-escape resolution itself as part of inline parsing, so a
> label serialised as `\*emphasis\*` comes back already unescaped from the AST's text nodes.
> Calling `unescapeLabel` again on that output would be a harmless no-op (nothing left to
> unescape), so it was simply removed rather than kept as dead-but-safe code.
>
> **One category dropped, two added.** `mixed-indentation` is gone: the old reader tracked raw
> indent widths itself to flag mismatches, but a real CommonMark parser resolves indentation
> structurally through its own AST nesting, and there was never a test pinning this category's
> behaviour. Added `continuation-merged` and `unsupported-block-removed`, both named in
> `markdown-format.md` §11's warning list but not reachable through the old line-based reader,
> which had no concept of "another block inside a list item."

---

## D-15 — The editing surface is an overlaid textarea

**Decided 2026-08-03**, deferred here from Phase 0.

**Decision.** In-place node editing uses a `<textarea>` positioned over the node box, not
`contentEditable` and not a hidden input.

**Why not on IME grounds.** Spike 1 measured all three surfaces under a real Chinese IME in two
browsers and found **no difference** — the OS consumes the confirming key before any of them
sees it. IME risk was the stated reason that spike ran first, so it is worth being clear that it
did not decide this.

**What decided it.**

*A real form control is the boring path.* Every browser's IME, autocorrect, dictation and
accessibility machinery is tuned for form controls. `contentEditable` is a rich-text surface
pretending to be plain text: `product-specification.md` §4.3 requires plain Unicode, so paste
sanitisation and suppressing browser formatting commands would be permanent obligations rather
than one-off work.

*A hidden input costs a hand-drawn caret.* It gives the most rendering control, which suits an
SVG canvas — but the caret must then be positioned and blinked by hand, including mid-composition,
which is exactly where CJK text measurement is hardest. That is a large cost for a benefit MVP
does not need.

**The cost accepted.** The textarea must track its node box as the map reflows. It is positioned
from the same `viewBox` the canvas computes, not measured from the DOM, so the two cannot drift.

**Revisit when** per-node rich text arrives (`phases.md` §9.1), which would need a real editing
model rather than a plain-text field, or if caret rendering inside the canvas becomes a
requirement for another reason.

---

## D-16 — Active text drafts are overlaid into persistence snapshots

**Decided 2026-08-04** after reproducing a production data-loss path.

**Decision.** The active textarea draft remains ephemeral editor state for rendering, layout
and undo, but autosave derives a snapshot-only document with that draft applied. Typing schedules
this derived snapshot through the existing 500ms debounce. `visibilitychange` and `pagehide`
flush the latest draft, and `beforeunload` warns only while a write is unresolved or failed.

**Why.** Previously the autosave effect observed only `history.doc`. A draft entered the document
only on Enter, Escape, blur or selection change, so refreshing or closing a tab directly after
typing restored the previous label even while the status said “Saved on this device.” Committing
each keystroke to history would avoid the storage gap but would also couple typing to document
revision, layout and undo mechanics.

**Constraint.** The derived snapshot MUST NOT mutate the live document or add history entries.
An editing session still becomes one undo group when it commits. Recovery is allowed to start
with an empty undo history, as already permitted by `storage-export.md` §5.3.

---

## Open questions

None currently. Resolved questions become records above rather than disappearing.
