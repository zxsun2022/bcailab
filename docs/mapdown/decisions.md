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

## Open questions

Not decided. Listed so they are not lost, and so nobody assumes they were settled.

- **Should `map.bcailab.com` receive the session cookie before it needs one?** It will by
  default: `getCookieDomain()` already scopes `bcailab_session` to the whole `bcailab.com`
  domain (see the correction in D-03). Two consequences to weigh. In Mapdown's favour: phase
  three needs no cookie work at all. Against: an authenticated cookie is sent to a static origin
  that has no use for it, and — because subdomains are **same-site** — `SameSite=lax` provides
  no protection between `map.bcailab.com` and `bcailab.com`. The cookie is `httpOnly`, so
  Mapdown's own scripts cannot read it. The alternative is making the domain attribute
  conditional so only the app host gets it until phase three deliberately widens it.
- **URL-based sharing.** A static site can still share: compress the Markdown into the URL
  fragment, as mermaid.live does. Zero backend, zero account, and it makes "send someone a map"
  work long before accounts exist. Raised as a candidate; **not** on the roadmap and not
  approved.
- **Own-use validation.** `spec/vision.md` §2 lists Buddhist-study outlines among the target use
  cases, which matches the 科判 outlines maintained elsewhere by the owner. That is a real
  first-user scenario worth exercising during Phase 1, not a product commitment.
