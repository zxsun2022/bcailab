# Decision Records

Accepted decisions and the reasoning behind them. **Append-only**: a decision that stops being
true is superseded by a new record, never edited away, so the trail of why the project is
shaped the way it is stays readable.

These records answer *"why is it like this, and may I change it?"* They do not schedule work
(`docs/roadmap.md`), describe current behaviour (the code and its tests), or record what
shipped (`docs/changelog.md`).

## Index

| # | Decision | Status | Date |
|---|---|---|---|
| [0001](0001-vanmemo-stays-a-separate-product.md) | vanmemo stays a separate product | Accepted | 2026-07-21 |
| [0002](0002-translate-stays-inside-english-studio.md) | Translate stays inside English Studio as its free funnel | Accepted | 2026-07-16 |
| [0003](0003-defer-chinese-ui.md) | Defer a Chinese UI | Accepted | 2026-07-15 |
| [0004](0004-dictation-v2-retrieves-rather-than-generates.md) | Dictation v2 retrieves from a library rather than generating per request | Accepted | 2026-07-20 |
| [0005](0005-reading-grader-stays-single-call.md) | Reading grader stays a single LLM call | Accepted | 2026-07-23 |
| [0006](0006-learner-surface-invariants.md) | Two learner-surface invariants | Accepted | 2026-07-28 |

**Mapdown's decisions live in `docs/mapdown/decisions.md`**, not here. That log predates this
directory, is self-contained, and covers one product end to end; duplicating it would create
exactly the drift this directory exists to avoid. Treat it as a peer of the records above.

## Provenance

Records 0001–0006 were extracted on 2026-08-01 from prose that had accumulated inside
`docs/roadmap.md`, where a closed decision was structurally indistinguishable from a deferred
idea. Wording is preserved from the original entries. Where the original recorded no rationale,
the record says so rather than supplying one after the fact.

## Writing a new record

Number sequentially. Include Context, Decision, Alternatives considered, Consequences, Status,
and Date. Mark rationale you inferred rather than found as **inferred**. To reverse a decision,
add a new record and set the old one's status to `Superseded by NNNN`.

Status values: `Accepted` · `Superseded by NNNN` · `Deprecated` · `Proposed`.
