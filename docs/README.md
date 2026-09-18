# Documentation entry point

**Document role:** current-guidance.

## Four starting questions

| Question | Start here | What it establishes |
| --- | --- | --- |
| What may I change? | [Roadmap](roadmap.md), then [working guide](../AGENTS.md) | Owner-authorized scope and acceptance criteria. Exploration, historical reports and outside advice are not authorization. |
| What does the product do? | [Architecture](architecture.md), [access rules](access-model.md), [tool behavior](tools/), [Mapdown](mapdown/README.md) | Intended behavior and boundaries; verify current behavior against the implementation and reproducible tests. |
| How do I verify a change? | [Local verification](verification.md) | Product scopes, automated checks, real D1 fixtures, manual browser cases and limits. |
| How do I release it? | [Workflow](workflow.md), [Cloudflare operations](infra-cloudflare.md), [Mapdown deployment](mapdown/README.md) | Procedures, environment boundaries and migration order. Local verification does not prove a remote deployment gate. |

## Authority and conflicts

- **Authorization:** [roadmap](roadmap.md) and the owner's explicit current instructions.
  An agent reports `in_review`; only the owner records acceptance. Neither implementation nor
  an archived accepted item authorizes unrelated new work.
- **Decisions:** [ADRs](decisions/) and [Mapdown decisions](mapdown/decisions.md) explain settled
  constraints and their rationale. Proposals cannot silently override an accepted decision.
- **Behavior and design intent:** tool docs, [Studio shell](studio-app-shell.md),
  [design system](design-system.md) and product specs describe the contract.
- **Current facts:** read code/configuration or generate a [context pack](external-consultation.md).
  Route inventories, migrations, dependency versions and bindings are derived; do not maintain a
  second complete list in prose. A generated pack is a dated snapshot, not a live production audit.
- **Delivery and history:** [changelog](changelog.md), [accepted roadmap evidence](roadmap-accepted-history.md)
  and [the August documentation audit](documentation-audit.md) explain what was observed or agreed
  then. Their dated test counts, implementation details and open questions are not current facts.
- **Ideas:** [exploration](exploration.md) is unapproved work, not a second roadmap.

When code and intent disagree, record the concrete difference. Code establishes what currently
runs; it does not establish that the behavior is correct or authorized. Use the accepted decision
and current task scope to choose whether to fix implementation or update prose. Do not silently
turn a historical observation into a new requirement. Escalate only a material unresolved product
decision; routine factual doc repairs do not require a new approval.

## Keeping this usable

Update behavior docs with externally visible code changes. Keep delivery evidence in changelog,
accepted detail in its historical record, and remaining authorized work in roadmap. Preserve
old anchors when moving evidence. Current docs use links to the history rather than duplicating it.

`pnpm check:docs` checks a bounded set of entry/operational/repaired documents and their explicit
role labels; it cannot prove prose matches code. [Verification](verification.md) states its limits.
