# 0008 — Schema migrations precede deploys, and D1 commands are version- and target-explicit

**Status:** Accepted · **Date:** 2026-08-18 · **Origin:** the `/profile` production outage during
the account-passwords iteration (`docs/changelog.md`, 2026-08-18)

## Context

Adding an optional account password introduced migration `0018_user_password.sql`, a nullable
`users.password_hash` column, plus code that reads it on every `/profile` load. The code reached
production before the migration did, so the page failed for every visitor until the column was
created. Nothing in the change was wrong; the *order* was.

Three separate things made that outcome easy to reach, and each would have caused it alone:

1. **Cloudflare Pages deploys on push.** There is no gate between merging to `main` and live
   code serving traffic, so "deploy, then migrate" is not a sequence with a short gap — it is a
   guaranteed window in which live code queries a column that does not exist.

2. **`docs/workflow.md` contradicted itself.** Its numbered, copy-pasteable commands pushed first
   and migrated second; a footnote below them recommended the opposite. The commands are what
   gets followed. A prose caveat under an executable block is not guidance, it is decoration.

3. **The documented command silently targeted the wrong database.** Under wrangler 4.x,
   `wrangler d1 migrations apply bcailab-db` without `--remote` operates on the *local*
   database and exits successfully. Following the documentation exactly would leave production
   unmigrated while printing every sign of success. A later `--remote` invocation also failed
   with `[code: 7403] not authorized`, which turned out to be neither an account nor a permission
   fault: the machine had four wrangler versions installed and the shell resolved to a global one
   whose OAuth token predated a scope change, while the repo-pinned version worked.

The common thread is that each failure *looked like success* — a green command, a merged PR, an
authoritative-sounding doc — so none of them surfaced until a user hit the page.

## Decision

**A schema migration is applied to an environment before code that reads the new schema is
deployed to it.** This holds for local, preview, and production alike. Additive, backward-
compatible changes (a nullable column, a new table) are safe to apply ahead of the deploy,
because the currently running code simply ignores them. That safety is what makes "migrate
first" universally available rather than a judgement call.

Two mechanical rules make the above executable rather than aspirational:

- **Every remote D1 command carries an explicit target** — `--remote` for production,
  `--preview` for staging, `--local` for local. No D1 command in the docs relies on the default.
- **Every D1 command in the docs is invoked through `pnpm exec`**, so it runs the version pinned
  in `package.json` rather than whatever the machine happens to have on `PATH`.

Applying the migration is followed by a verification read (`migrations list --remote` reporting
nothing pending) before the push, because the failure mode being guarded against is a command
that reports success without doing the work.

## Alternatives considered

**Automate migrations inside the deploy pipeline.** The obvious fix: have the build apply
pending migrations, so ordering cannot be got wrong by hand. Rejected for now — Pages builds run
per-commit and concurrently, giving several builders a shared mutable database and no clear
owner for a failed or partially applied migration. Automation here needs an advisory lock and a
rollback story, which is a project rather than a correction. This ADR constrains the manual
sequence; it does not argue the sequence should stay manual forever.

**Make the code tolerate a missing column.** Defensive reads, or a feature flag gating anything
that touches new schema. Rejected as a general rule: it spreads schema uncertainty through
application code permanently to avoid a one-time ordering discipline, and the degraded path is
almost never exercised, so it rots. It stays available as a deliberate choice for a specific
high-risk change, not as the default posture.

**Replace deploy-on-push with a manual promote step.** Would remove the window entirely by
decoupling merge from release. Rejected as disproportionate: deploy-on-push is a deliberate
property of this project's velocity, and the outage came from documentation that contradicted
itself, not from continuous deployment as such.

## Consequences

- The deploy sequence in `docs/workflow.md` §正式环境上线 and §Cloudflare 测试环境验证 is
  migrate → verify → push. `docs/infra-cloudflare.md` matches.
- A change whose migration is *not* backward-compatible (dropping or renaming a column, adding a
  `NOT NULL` without a default) cannot use this sequence, because applying it early breaks the
  running code. Such a change must be split into backward-compatible steps — add, backfill,
  switch reads, then remove in a later deploy — rather than sequenced as one risky release. This
  ADR does not authorize a "brief" incompatible window; there is no brief window under
  deploy-on-push.
- A command that reports success is not evidence that it did anything. Where a command has a
  destination (a database, an environment, an account), the destination is stated explicitly and
  the result is read back.
- Documentation that carries executable commands owns their correctness. When prose and the
  command block disagree, the command block is the bug — fixing the prose is not a fix.

## Scope

This binds any change that ships schema and code together, in this repo or Mapdown, and any
future runtime whose deploys are triggered by push. It does not prescribe a migration tool or
forbid manual application; it constrains ordering, target explicitness, and verification.

Related: [0006](0006-learner-surface-invariants.md) records invariants that outlived their
originating iteration in the same way this one does.
