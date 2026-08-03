# 0001 — vanmemo stays a separate product

**Status:** Accepted · **Date:** 2026-07-21 · **Origin:** `docs/roadmap.md` (Later)

## Context

vanmemo (formerly vanbox) was under consideration for absorption into this monorepo. It has its
own top-level domain (vanmemo.com), its own accounts, and a Next.js + OpenNext on Workers stack
with Auth.js.

## Decision

vanmemo stays a permanently separate product, in its own repository. bcailab's only tie to it
is a product link from the homepage, shipped 2026-07-23 as the third card in the homepage
Products list.

This is not a decision awaiting a trigger. It is closed.

## Alternatives considered

Absorbing vanmemo into this monorepo. Rejected: it would share almost nothing while adding two
build systems and two deploy pipelines.

## Consequences

- No shared packages, no shared accounts, no shared deployment with vanmemo.
- The homepage link is the entire integration surface.
- Cross-product work means cross-repository work, accepted deliberately.

## Related

`docs/mapdown/decisions.md` **D-02** reaches the opposite conclusion for Mapdown on the same
test — Mapdown stays under `bcailab.com`, adopts bcailab's accounts, and adds no new server
runtime, so all three factors that separated vanmemo are absent. The two decisions apply one
rule rather than contradicting each other, and D-02 says so explicitly.
