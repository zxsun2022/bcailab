# 0002 — Translate stays inside English Studio as its free funnel

**Status:** Accepted · **Date:** 2026-07-16 · **Origin:** `docs/roadmap.md` (Later)

## Context

Translate is the most broadly useful tool in the studio and the one least tied to English
learning, which raised the question of whether it should stand alone as a homepage product.

## Decision

Translate stays inside English Studio as its free, no-account acquisition funnel, rather than
becoming a standalone homepage product.

## Alternatives considered

Promoting Translate to a standalone product with its own landing surface. Not adopted.

## Consequences

- Translate remains a `public: true` module reachable without an account, subject to anonymous
  daily quotas rather than a login gate.
- Its role in the product story is acquisition: it is the first thing a visitor can use, and
  the path into the rest of the studio.

## Revisit when

Usage data shows a distinct audience for Translate that does not overlap with English Studio's
learners. Recorded in the original entry as the explicit re-trigger.
