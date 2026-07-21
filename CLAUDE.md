# CLAUDE.md

This repo is set up for multi-agent collaboration: different AI coding tools (Claude Code,
Codex, etc.) continue each other's work through shared docs, not chat history.

**Start here, in order:**

1. **`AGENTS.md`** — conventions, routing patterns, editing rules, doc-sync rules.
   It is the single source of truth for *how* to work in this repo.
2. **`docs/roadmap.md`** — the single source of truth for *what* to work on:
   current iteration (Now), upcoming (Next/Later), and history (Done).
3. **`docs/architecture.md`** — system overview and route map.
4. **`docs/learner-model-notes.md`** — accumulated product reasoning for the next
   iteration (level assessment, build order, calibration hazards). Read before designing
   anything that touches the learner profile; it exists so those judgements are not
   re-derived from scratch.

**Maintenance duties (all AI tools):**

- When you finish a roadmap item, move it to Done in `docs/roadmap.md` with the date,
  in the same commit/PR.
- Follow the Documentation Sync Rule in `AGENTS.md`: external-behavior changes must
  update `docs/` in the same task.
- Do not add or reprioritize roadmap items without the owner's confirmation.
