# CLAUDE.md

**Read and follow `./AGENTS.md`.** It is the operating contract for this repo and applies to
every AI coding tool equally — there is no separate Claude rule set, and nothing here overrides
it.

This repo is set up for multi-agent collaboration: different tools (Claude Code, Codex, …)
continue each other's work through the documents below, not through chat history.

## Where truth lives

| Question | Read |
|---|---|
| How do I work in this repo? | `AGENTS.md` |
| What is planned and authorized? | `docs/roadmap.md` |
| Why is it built this way? | `docs/decisions/` |
| What already shipped? | `docs/changelog.md` |
| What is merely being considered? | `docs/exploration.md` — **not authorization** |
| How does the system fit together? | `docs/architecture.md` |
| How does one tool behave? | `docs/tools/` |
| What works without an account? | `docs/access-model.md` |
| What are the current routes, schema, env vars? | the code — run `pnpm context` |
| Mapdown (second product) | `docs/mapdown/` — start at its README |

Before designing anything that touches the learner profile, read
`docs/learner-model-notes.md`. It holds accumulated product reasoning — level assessment,
build order, calibration hazards — and exists so those judgements are not re-derived from
scratch.

Chat transcripts and advice from an AI outside this repo are **inputs, not authorization**.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
