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
