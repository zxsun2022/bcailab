# 0011 — A Chinese UI on the same URLs, with feedback following the interface

**Status:** Accepted · **Date:** 2026-09-22 · **Origin:** owner requirement, after an external
product review · **Supersedes:** [0003](0003-defer-chinese-ui.md)

## Context

[ADR 0003](0003-defer-chinese-ui.md) deferred a Chinese UI on 2026-07-15 and preserved no
reasoning for the deferral, which is why this record does not argue against one.

Two facts made the question live again. First, the owner named the first cohort: Chinese-speaking
learners. An English-only interface stops being a deferred nicety at that point — it is the first
thing that cohort cannot read. Second, the owner cannot recruit people to observe using the
product, so the owner is the only available stand-in for a target learner, and can only walk the
first-run path as that learner if the path is in their language.

The capability is already half-built and easy to overlook: Reading and Writing produce English or
Chinese feedback from a shared `localStorage` preference that defaults to English and lives inside
those two tools' settings pages; Dictation — the studio's first practice for a new learner — has
no language option at all; and the interface chrome is English with no catalogue, switcher or
locale routing anywhere.

## Decision

**Build a Chinese interface across English Studio, on the same URLs, with feedback that follows
the interface.**

- **Scope is the whole of English Studio**, including the homepage that leads with it. Mapdown,
  Posts and `/about` are excluded. Learning material — passages, prompts, audio — stays English:
  it is the object of study, not chrome.
- **One URL per page.** The locale is a cookie, negotiated from `Accept-Language` on a first
  visit, with an explicit switcher and no redirect. No `/zh` prefix.
- **Feedback language follows the interface by default**, and Dictation gains the Chinese output
  the other two graders already have. The existing per-learner setting survives as an explicit
  override, and an existing explicit choice is never silently converted.

Design, coverage list and mechanism: [`docs/chinese-ui-design.md`](../chinese-ui-design.md).
Scope and acceptance criteria: `docs/roadmap.md`.

## Alternatives considered

**Locale-prefixed URLs (`/zh/...`).** The only option that lets Chinese pages be indexed and
found by Chinese search. Rejected for now on cost and evidence: it duplicates every route, and
the product has no organic traffic in either language to protect. The trade is recorded rather
than hidden, because reversing it later is a route restructure, not a setting.

**A manual switcher with no negotiation.** Cheapest, and it fails the exact visitor this decision
exists for: a Chinese learner's first screen would still be English.

**Leaving feedback language independent, defaulting to English.** Smallest change, and it leaves
an A2–B1 learner with a Chinese interface wrapped around feedback they cannot read — the part of
the product that carries its whole value.

**Bilingual feedback (English plus Chinese explanation).** The most informative output, and the
most expensive: longer generations, higher cost, prompt and stored-payload changes across three
graders. Not ruled out later; ruled out as this item's default.

## Consequences

- Every future user-facing string is two strings. The Chinese catalogue is typed against the
  English one, so an untranslated key fails the type check instead of silently rendering English.
- Search engines index the English rendering. Chinese organic discovery is not available until
  the URL decision is revisited.
- Stored feedback is never retranslated; historical rows render in the language they were written
  in, and no schema or migration changes.
- Chinese feedback reaches signed-in learners only, because Dictation feedback is signed-in only.
  A signed-out Chinese visitor still finishes a dictation with no explanation of their errors;
  whether to give an anonymous first attempt one feedback call remains an open product decision.
- Traditional-Chinese readers are served Simplified.
- Parts of the visual system — mono uppercase labels, letter-spacing, italic emphasis — do not
  survive translation and gain locale-aware rules in `docs/design-system.md`.
- This decision produces no usage evidence, so it does not satisfy the revisit triggers in
  [0002](0002-translate-stays-inside-english-studio.md) or
  [0009](0009-ielts-is-a-material-family-not-a-second-product.md).

## Revisit when

- Chinese organic search becomes a channel worth having — then locale-prefixed URLs, with the
  cost this record declined to pay now.
- Traditional-Chinese readers show up, or the owner decides Simplified-for-everyone is not
  acceptable.
- A third locale appears, at which point statically bundling every catalogue stops paying.

## Related

- [0003](0003-defer-chinese-ui.md) — the deferral this supersedes.
- [0002](0002-translate-stays-inside-english-studio.md) — the entry-point question this item does
  not answer.
