# Consulting an External AI About This Repo

A fixed workflow for taking a question about bcailab to an AI that cannot browse the
codebase (ChatGPT, Gemini, a fresh Claude session, a colleague).

## Why a generated pack, not a hand-picked doc

`docs/` is written for agents that are already *inside* the repo — they can read
`architecture.md` for intent and then open the actual files to check it. An external
AI has only what you paste, so a doc alone gives it intent without facts, and any
drift in that doc becomes a wrong premise it will reason from confidently.

`scripts/context-pack.sh` therefore assembles two kinds of material and labels them
distinctly in the output:

- **_(intent)_** — hand-written docs: what we're trying to build and the conventions
  we hold ourselves to. May lag the code.
- **_(derived)_** — extracted from the repo at generation time: route inventory,
  route module exports, D1 schema from all migrations, env binding names, dependency
  versions, commit history, file inventory. Authoritative on what exists.

The pack's preamble tells the consulting AI to flag disagreements between the two,
because that gap is frequently the actual bug.

## Running it

```bash
pnpm context                        # full pack, ~25k tokens
pnpm context -p arch                # architecture + infra + conventions, ~14k
pnpm context -p product             # roadmap + per-tool docs, ~20k
pnpm context -p debug -s <file>...  # lean base + verbatim source of named files
```

Useful flags:

| Flag | Purpose |
| --- | --- |
| `-q "<question>"` | Embeds the question in a `## The question` section near the top |
| `-s <path>` | Inlines a source file verbatim; repeatable |
| `-o <path>` | Output location (default `.context/context-pack-<profile>-<stamp>.md`) |
| `-p <profile>` | `arch` \| `product` \| `debug` \| `full` |

Output lands in `.context/`, which is gitignored — packs are regenerated, never
committed, so they can't themselves become the stale artifact this exists to avoid.

## Picking a profile

- **`arch`** — "is this design sound", infra questions, Cloudflare/D1/R2 tradeoffs.
- **`product`** — prioritization, roadmap sequencing, feature scoping.
- **`debug`** — a concrete bug or performance question. Pair with `-s` for the files
  actually involved; the derived sections give the AI enough surrounding structure
  to reason about them.
- **`full`** — first consultation with a given AI, or an open-ended review.

## Secret handling

The script never emits secret *values*. `.dev.vars` is read for variable names only,
and a redaction pass over the entire output replaces UUIDs (Cloudflare resource ids)
and anything matching common API-key shapes.

That pass is defense in depth, not a guarantee. **If you use `-s` to inline a file,
skim the emitted section before sending it anywhere.** Never inline `.dev.vars`,
`.env*`, or a service-account JSON.

## After the consultation

If the external AI's answer changes direction or surfaces a decision:

- Roadmap changes need owner confirmation, per `AGENTS.md` — an external AI's
  recommendation is input, not authorization.
- Record accepted decisions in `docs/roadmap.md` or the relevant `docs/` page, so the
  next generated pack carries them. Advice that lives only in a chat log is lost
  context for every future consultation.
