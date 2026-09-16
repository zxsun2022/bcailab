# Learner context — Writing and Dictation verification

Date: 2026-09-15. Status: **in_review**. Scope: roadmap Stage 1, Writing step and the
previously outstanding signed-in Dictation model-path smoke test.

## Deterministic checks

- `pnpm test`: 720 tests pass. New tests cover the Writing projection, exclusion before the
  six-session bound, listening-only provenance, rendering bounds and prompt insertion.
- Four SHA-256 fixtures captured from `e61cf74` prove General/IELTS Task 2 trial prompts in both
  languages remain byte-identical, with either omitted or empty context.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm --filter mapdown build` pass. Lint reports
  nine existing warnings, zero errors. Mapdown's build also runs its app and functions typechecks.

## Real runtime and model checks

Used the existing Vite/Remix Cloudflare dev proxy with **`persist: false` and
`remoteBindings: false`**, applied every repository migration to real workerd D1, and seeded
only synthetic data. No owner's local or remote learning records were used. The application
session helper signed a synthetic session with a verification-only secret; no OAuth login or
production session was needed. HTTP requests exercised real route actions via Remix `_data`
requests. Background tasks were awaited before reading results. Model calls used the existing
local model configuration and synthetic text only.

Seeded two users, one current Writing session, seven eligible historical sessions, a deleted
session retaining its revision, a foreign-user session, and a failed newer revision. Checked:

- The Writing assembler issues exactly two reads, touching neither saved translations nor
  dictation attempts; it returns six *other* sessions and excludes current/deleted/foreign/failed
  feedback markers. Profile tags include article/final-s weaknesses and an unrelated th weakness;
  only the relevant listening evidence reaches Writing. The rendered section stays below 1,800
  characters.
- Anonymous access to `/writing/new` redirects; signed-in access renders.
- A first draft with article, agreement and past-tense mistakes gets completed real-model
  feedback. A revised draft gets completed feedback with a non-null round delta. Retrying its
  feedback completes with `feedback_generation = 2`.
- The signed-in Dictation action completes a synthetic passage with omitted articles and a
  missing past-tense ending. Background feedback is populated by a real model; stored accuracy
  equals the deterministic action result. Feedback identifies dropped articles and the missed
  past-tense ending. Assembly logs show three tags and Writing context reaching this call.

The Writing run passed 12 checks. A separate Dictation run passed 10 checks (including seven
shared scope/page checks). Initial verification-driver errors in Remix request formatting and
Dictation's `_intent` field were corrected; they were not application failures.

## Limits

These checks establish transport, data scope and successful model integration. They do not
establish improved teaching quality, statistically unbiased scoring, browser interaction quality,
or owner acceptance. Reading's new brief is still gated on the registered recording experiment.
No deployment or push was performed.
