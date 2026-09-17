# Local verification

These commands check a checkout. They do not push, deploy, apply remote migrations, prove
Cloudflare Pages waits for checks, or mark roadmap work accepted.

## Prerequisites

- Node **22 or newer**. The current verification evidence uses Node 26.8.2; other supported
  major versions have not been exercised as a matrix.
- pnpm **9.12.0**, as declared in [package.json](../package.json). Install dependencies with
  `pnpm install --frozen-lockfile` first. Each verify command checks Node and pnpm before work.
- Web builds and the integration fixture need permission to bind local ports. The D1 fixture
  uses ports 5191 and 5192; stop any earlier fixture first. It uses temporary, in-memory D1/R2,
  synthetic users and a fake model. No production database or real model quota is used.

## Commands and boundaries

| Command | Coverage |
| --- | --- |
| `pnpm verify:web` | Operational docs; Web/shared/seed/grader unit and React tests; existing root Web/seed/grader/session-cleanup typechecks; Web/shared/worker/scripts lint; Web production build; automatic isolated D1/HTTP regression |
| `pnpm verify:mapdown` | Operational docs; Mapdown client and Functions tests; separate client and Functions typechecks; Mapdown and verification configuration lint; Mapdown build |
| `pnpm verify` | All configured tests and repository lint once; both products' typechecks and builds; operational docs and Web D1/HTTP regression |
| `pnpm check:docs` | Required verification inputs and local inline Markdown link targets in this document, workflow instructions and fixture README |
| `pnpm test:integration` | Starts the isolated fixture, runs D1/HTTP assertions, stops it and removes its temporary configuration |
| `pnpm test:browser:fixture` | Starts the fixture for **manual** browser checks; Ctrl-C stops it. Starting it is not a successful browser test |
| `pnpm verify:failures` | Temporarily injects deliberately failing tests/types/lint/doc links, verifies the appropriate command rejects each, then restores its edits |

Steps run in order and stop on the first failure with a nonzero exit code and a labelled
`FAIL` line. Missing tools or required inputs are failures. Existing lint **warnings** remain
warnings; lint errors block. Builds retain their own package TypeScript versions. The legacy
root `build` and `typecheck` still have their existing Web-focused scope; use `verify` for both
products. No package versions are unified by these commands.

Documentation checking is intentionally bounded: it validates the named required inputs and
ordinary inline local links in three operational documents. It does not validate heading
anchors, reference-style Markdown links, external URLs, prose correctness, current architecture
claims, or every historical design document. Documentation drift remains a separate iteration.

## D1 and browser evidence

[The fixture guide](../scripts/testing/README.md) describes refresh recovery, account switching,
late feedback and cross-round drafts. Automatic checks exercise real migrations, Home SQL/data
bounds and failure paths, first-submit replay, account isolation and retry generations. They do
not mock D1 or call a real model. They do not establish remote migration upgrade behavior,
Mapdown cloud integration, model quality, or full browser accessibility.

Run the browser cases when changing these interactions. Record observed results separately from
`verify`: React tests and successful HTTP responses cannot prove the rendered browser flow.
Known initial document hydration warnings from the previous in-app-browser run remain recorded
in the fixture guide; this iteration does not claim to resolve them.

## Failure-injection safety

`verify:failures` uses uniquely named temporary files, refuses collisions and removes them in
`finally`. The doc-link case appends to this document, then restores the exact original only if
no concurrent edit occurred. Do not run two injection suites or edit their target document at the
same time. Logs are written to a printed temporary directory. An OS kill can interrupt cleanup;
inspect `git status` and that directory before continuing. The suite intentionally fails early,
so it does not build or contact the integration fixture for each probe.

See [workflow](workflow.md) for development/deployment procedures and [roadmap](roadmap.md)
for authorization. CI and remote deployment gates are unchanged.
