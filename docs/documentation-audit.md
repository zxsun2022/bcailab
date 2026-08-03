# Documentation Audit — 2026-08-01

An inventory of this repository's documentation, produced to decide whether and how to
restructure it.

**Migration status (updated 2026-08-01):** the owner approved three of the four recommended
items — split the roadmap, extract ADRs, and move feature behaviour out of `AGENTS.md` — plus
archiving the three documents §6 could not classify. All four are **executed**; see §4. The
fourth recommendation, regrouping `docs/` into `specs/` and `ops/` subdirectories, was
**deferred** by agreement, and the declined items in §5 stand.

Scope of the audit: `AGENTS.md`, `CLAUDE.md`, `README.md`, the whole of `docs/`,
`scripts/context-pack.sh`, `package.json` scripts, CI configuration, and current Git state.

---

## 1. Headline findings

**F-1 — The repository already implements intent/derived separation, and does it better than
committing generated files.** `scripts/context-pack.sh` opens by stating the principle
outright: *"docs/ carries intent and conventions; everything factual (routes, schema, env var
names, dependencies, git state) is derived live from the repo at generation time, so the pack
never ships stale claims."* It derives the route inventory, per-route loader/action/component
exports, server-module sizes, the full D1 schema, environment-variable **names only**,
dependencies, and recent history — with UUID and API-key redaction on the way out. Output goes
to `.context/`, which `.gitignore` marks *"regenerate, never commit."*

This is the point that changes the shape of any restructuring: generated documentation that is
**not** committed cannot drift, so it needs no drift check. A `docs/derived/` directory plus a
`docs:check` CI job exists to police a drift that this design has already eliminated by
construction. See D-1 below.

**F-2 — `AGENTS.md` is not bloated, but about a third of it is the wrong category.** At 99
lines it is already inside the 100–150 line target, so there is no size problem to fix. The
composition is the issue: roughly 30 lines describe *feature behaviour* rather than *working
rules* — "Tool Route Canonicalization", "Unauthenticated Interaction" (which module is public,
which has a trial route, how the OAuth popup is triggered), and "Delete / Destructive Actions".
Those are specifications that happen to live in the operating contract, and they are exactly
the kind of fact that goes stale silently.

**F-3 — `docs/roadmap.md` genuinely conflates five roles.** This is the strongest case for
change in the repository. In 363 lines it serves as strategy statement, authorized queue,
backlog, exploration list, and completion record simultaneously. The completion record ("Done")
is ~190 lines — over half the file — and it is a changelog written as prose. As it grows, the
part an agent actually needs on starting work (Now / Next) sinks further beneath history.

**F-4 — Accepted decisions exist but have no home, so they are stored inside backlog bullets.**
Several settled decisions live as prose inside `Later` items, where their status is
structurally ambiguous — a reader cannot tell a decision from a deferred idea by position.
Examples: vanmemo staying a permanently separate product ("settled 2026-07-21 … treat it as
closed"), Translate staying inside English Studio ("Decided 2026-07-16"), Chinese UI deferral
("decided to defer, 2026-07-15"), and the reading-grader deterministic split being downgraded
with an explicit re-trigger condition. `docs/mapdown/decisions.md` (2026-08-01) is the first
proper decision log in the repository and demonstrates the pattern.

**F-5 — `CLAUDE.md` duplicates rules that `AGENTS.md` owns.** Three of its four "maintenance
duties" restate `AGENTS.md` verbatim in substance: the Documentation Sync Rule, Commit
Discipline, and the roadmap-authorization rule. Two copies of a rule is two places to update
and one place to forget.

**F-6 — Migration hazard: moving documents silently degrades `scripts/context-pack.sh`.** The
script hardcodes six documentation paths (`docs/architecture.md`, `docs/roadmap.md`,
`docs/infra-cloudflare.md`, `docs/design-system.md`, `docs/css-layout-conventions.md`,
`docs/tools/*.md`), and its `emit_file()` helper begins `[[ -f "$path" ]] || return 0` — a
missing file is skipped **without any warning**. Any relocation must update this script in the
same commit, or external AI consultation quietly starts receiving an incomplete picture with
no error to notice.

**F-7 — There is no CI and no task tracker.** `.github/workflows/` does not exist; there is no
pre-commit hook infrastructure. `package.json` provides `dev`, `build`, `typecheck`, `lint`
(a stub echoing "lint not configured"), `context`, `test`, `test:watch`. Task state lives
entirely in `docs/roadmap.md`. Consequently any mechanical enforcement or drift check would
require **introducing CI**, which is a new workflow and a gated decision, not a migration step.

---

## 2. Inventory and classification

Categories: **Contract** (stable intent) · **Decision** · **Spec** · **Ops** · **Derived** ·
**Task state** · **Exploration** · **Historical**.

| Document | Lines | Primary category | Notes |
|---|---:|---|---|
| `AGENTS.md` | 99 | Contract | Mixed: ~30 lines are Spec (see F-2) |
| `CLAUDE.md` | 26 | Contract | Duplicates `AGENTS.md` (F-5) |
| `README.md` | 9 | Contract | Thin; Quickstart only |
| `docs/architecture.md` | 117 | Contract + Derived | Component overview is intent; route/schema mentions are derivable |
| `docs/roadmap.md` | 363 | Task state + Exploration + Historical + Contract + Decision | Five roles (F-3) |
| `docs/design-system.md` | 188 | Contract | Visual rules, semantic colour families |
| `docs/css-layout-conventions.md` | 139 | Contract | Conventions |
| `docs/tool-shell-pattern.md` | 207 | Contract | Reusable pattern |
| `docs/studio-app-shell.md` | 115 | Spec | Contains acceptance rules |
| `docs/learner-model-design.md` | 427 | Spec | |
| `docs/material-layer-design.md` | 397 | Spec | Records a known gap (§9.1), since closed |
| `docs/english-studio-ia-v2-design.md` | 364 | Spec | Shipped 2026-07-28 |
| `docs/english-studio-ia-design.md` | 203 | Spec | v1; **still cross-referenced** by roadmap — supersession unconfirmed |
| `docs/dictation-v1-design.md` | 342 | Spec | |
| `docs/tools/*.md` (7 files) | — | Spec | Per-tool observable behaviour |
| `docs/workflow.md` | 150 | Ops | |
| `docs/infra-cloudflare.md` | 87 | Ops | |
| `docs/google-oauth-setup.md` | 111 | Ops | |
| `docs/external-consultation.md` | 73 | Ops | Governs `context-pack.sh` |
| `docs/learner-model-notes.md` | 105 | Exploration | Explicitly "accumulated product reasoning" |
| `docs/ux-follow-ups-2026-07-30.md` | 220 | Exploration | Self-labelled "a discussion record, not a commitment" |
| `docs/tool-shell-audit.md` | 238 | Historical | A point-in-time audit |
| `docs/reading-shell-refactor-plan.md` | 362 | Historical? | A plan; execution status **unconfirmed** |
| `docs/spikes/*.md` (3 files) | — | Historical | Evidence for a Done roadmap entry |
| `docs/mockups/` | — | Historical | Structural prototype for IA v2 |
| `docs/mapdown/` | — | Contract + Decision + Spec | Already structured (2026-08-01) |
| `scripts/context-pack.sh` | 300+ | Derived (generator) | See F-1 |
| `ai/README.md` | 5 | Contract | Two rules; near-empty directory |
| `.context/` | — | Derived (output) | Gitignored by design |

**Totals.** 21 flat files in `docs/` plus four subdirectories; ~4,300 documentation lines
outside `docs/mapdown/`.

---

## 3. Problems requested by the audit brief

**Contradictory sources of truth.** None found at the level of conflicting rules. The nearest
thing is F-5's duplication, which is currently consistent and therefore a latent rather than
active contradiction.

**Duplicate rules.** `CLAUDE.md` ↔ `AGENTS.md`, three rules (F-5).

**Stale or unverifiable implementation facts in hand-written docs.** The feature-behaviour
paragraphs in `AGENTS.md` (F-2) name specific modules as public or trial-gated; those lists are
maintained by hand and verified nowhere. `docs/architecture.md` similarly narrates table names.
Neither is currently wrong; both are unguarded.

**Documents performing multiple incompatible roles.** `docs/roadmap.md` (F-3); `AGENTS.md` to a
lesser degree (F-2).

**Rules stated in prose that could be enforced mechanically.** The Documentation Sync Rule, the
"`Docs impact: none`" declaration, commit scoping, and the stub `lint` script are all prose-only
today. Enforcing any of them requires introducing CI (F-7) — gated.

**Missing acceptance criteria.** The per-tool docs and design docs describe behaviour but rarely
state observable acceptance criteria. `docs/studio-app-shell.md` is the exception and is the
model worth copying. Retrofitting criteria onto shipped work is explicitly out of scope; the
gap is recorded here instead.

**References that would break during migration.** `scripts/context-pack.sh` (F-6, silent);
`CLAUDE.md`'s four-item reading list; `AGENTS.md`'s pointers to `docs/external-consultation.md`;
many roadmap entries citing design docs by path; `docs/mapdown/` internal links (self-contained,
verified 2026-08-01).

**Cannot yet be classified confidently.** `docs/reading-shell-refactor-plan.md` — a plan whose
execution status is not recorded. `docs/english-studio-ia-design.md` — v1 of a design whose v2
has shipped, but which the roadmap still cites. `docs/tool-shell-audit.md` versus
`docs/tool-shell-pattern.md` — whether the audit is superseded by the pattern. All three need
owner confirmation before being archived; none should be moved on inference.

---

## 4. Migration table

| Original | Responsibility before | Destination | Action | Status |
|---|---|---|---|---|
| `docs/roadmap.md` "Done" (~186 lines) | Completion record | `docs/changelog.md` | split | **done** — verbatim |
| `docs/roadmap.md` "Under consideration" | Exploration | `docs/exploration.md` | split | **done** — verbatim |
| `docs/roadmap.md` Now/Next/Later | Authorized queue | retained in place | retain | **done** — 363 → 153 lines |
| Decisions embedded in roadmap bullets (F-4) | Decision | `docs/decisions/0001`–`0006` | split | **done** — see note below |
| `AGENTS.md` — Tool Route Canonicalization | Spec inside Contract | `docs/tools/tts.md` | moved | **done** — was already duplicated there |
| `AGENTS.md` — Unauthenticated Interaction | Spec inside Contract | `docs/access-model.md` (new) | moved | **done** |
| `AGENTS.md` — Delete/Destructive details | Spec inside Contract | `docs/tools/posts.md` | moved | **done** — repo-wide rule kept in `AGENTS.md` |
| `AGENTS.md` — remainder | Contract | retained | retain | **done** — 99 → 105 lines |
| `CLAUDE.md` duplicated rules | Contract (duplicate) | pointer + reading table | replaced | **done** — 26 → 30 lines |
| `docs/tool-shell-audit.md` | Historical | `docs/archive/` | archived | **done** — owner confirmed executed |
| `docs/reading-shell-refactor-plan.md` | Historical | `docs/archive/` | archived | **done** — owner confirmed executed |
| `docs/english-studio-ia-design.md` | Spec (v1) | `docs/archive/` | archived | **done** — owner confirmed superseded |
| `scripts/context-pack.sh` | Derived (generator) | extended | retained | **done** — added §2b decisions, §2c changelog, access-model |
| `docs/*-design.md` (4 remaining) | Spec | `docs/specs/` | — | **deferred** by agreement |
| `docs/{workflow,infra-cloudflare,google-oauth-setup,external-consultation}.md` | Ops | `docs/ops/` | — | **deferred** by agreement |
| `docs/tools/*.md` | Spec | retained | retain | Already grouped and referenced by path |
| `docs/spikes/`, `docs/mockups/` | Historical | retained | retain | Still cited as evidence by ADR 0005 and the changelog |
| Derived facts (routes, schema, env names, deps) | Derived | **stays in `scripts/context-pack.sh`** | retained | `docs/derived/` declined — see D-1 |
| `docs/mapdown/` | Contract + Decision + Spec | unchanged | retain | Already conforms |

**Note on the ADR extraction.** The first pass was planned as copy-don't-remove. In execution,
four of the six left a pointer rather than a duplicate, because leaving two copies of a
rationale reintroduces exactly the drift this migration exists to remove:

- **0001 (vanmemo)** was removed from `Later` entirely — it was a closed decision, not work,
  which is why it did not belong in a backlog.
- **0004 (Dictation v2)** and **0005 (reading grader)** kept their roadmap items, trimmed to
  the task and its re-trigger, with the reasoning now in the ADR.
- **0002, 0003, 0006** left short pointers in place.

Nothing was lost: every ADR preserves the original wording, and the pre-split text is one
`git show` away. Where the original recorded no rationale (0003), the record says so rather
than inventing one.

## 4a. Verification performed

- `pnpm test` — 113 tests across 7 files, all passing.
- Repo-wide relative Markdown link check across every tracked `.md` — no broken links.
- `bash scripts/context-pack.sh -p product` — regenerates successfully; the decision records,
  changelog and access model appear in the output.
- `git diff --name-only` across the migration — **only `docs/` and Markdown files, plus
  `scripts/context-pack.sh`**. No application code was touched, so no externally observable
  behaviour changed.

---

## 5. Recommendations that decline part of the brief

**D-1 — Do not create `docs/derived/`, and do not add `docs:generate` / `docs:check`.**
Committing generated documentation creates a drift class that must then be policed by a CI job.
`scripts/context-pack.sh` avoids the class entirely by generating on demand into a gitignored
directory (F-1). Adopting the template here would add a generator, a checked-in artifact, a CI
job, and a new failure mode, to reach a state strictly worse than the current one. The brief's
own instruction — *"If deterministic generation is not practical in this pass, document the
candidate and reason instead of creating a fragile solution"* — is satisfied by this entry.

**D-2 — Do not create `docs/contract/` as a directory in this pass.** At this repository's
size, `README.md` plus `docs/architecture.md` plus `AGENTS.md` already carry stable intent, and
the brief forbids creating directories with no immediate purpose. Revisit if product-principle
material accumulates — Mapdown's arrival makes that plausible, since `docs/roadmap.md`'s
one-paragraph product-direction statement is now doing work for two products.

**D-3 — Do not introduce CI in this pass.** Mechanical enforcement (Phase 8) has nothing to
attach to (F-7). Introducing CI is a workflow change and a separate, gated decision that should
be judged on its own merits — the strongest candidates being `typecheck`, `test`, and a real
`lint` (currently a stub), none of which are documentation concerns.

**D-4 — Do not archive anything until supersession is confirmed.** Three documents look
historical but cannot be verified from repository state alone (§3). The brief forbids deleting
or demoting information on inference.

---

## 6. What this audit does not establish

Resolved by the owner on 2026-08-01 and acted on:

- ~~Whether `reading-shell-refactor-plan.md` was executed.~~ Executed (dated 2026-03-20).
  Archived.
- ~~Whether `english-studio-ia-design.md` (v1) is fully superseded by v2.~~ Superseded.
  Archived, with a banner pointing at v2.
- ~~Whether `tool-shell-audit.md` is superseded by `tool-shell-pattern.md`.~~ Executed
  (dated 2026-03-20). Archived.

Still open:

- Whether the per-tool docs in `docs/tools/` match current implemented behaviour — the audit
  read documentation, not code, and the brief forbids treating code as product intent.
- Any statement about product behaviour. **No code was read or changed for this audit.**
