# Dictation v1 — Technical Design

Status: **in progress** (owner confirmed scope 2026-07-20). §11 steps 1–3 are done
(migration 0011, `@bcailab/db` helpers, `feature-quota.server.ts`, `dictation-diff.ts`,
seed scripts, and 20 published passages in production D1/R2); routes, quota wiring,
LLM feedback, and doc sync remain.
Scope source: `docs/roadmap.md` → Now iteration (started 2026-07-20).
Intended reader: the AI agent (or human) implementing this feature. Follow this doc;
where it delegates a decision, it says so explicitly.

## 1. Scope

A "daily dictation"-style listening tool: the user listens to a short passage sentence
by sentence, types what they hear, and gets deterministic scoring plus (signed-in only)
LLM feedback on error patterns.

**In scope (v1):**

- Pre-generated global material library: LLM-written passages at fixed CEFR bands
  (A2, B1, B2, C1), per-sentence MP3 audio via the existing Google TTS pipeline.
- Dictation workspace at `/dictation`: sentence stepper, replay, speed control,
  per-sentence instant diff, end-of-passage summary.
- Deterministic diff-based scoring (shared pure util, client + server).
- Signed-in: attempts persisted; LLM error-pattern feedback.
- Anonymous: daily passage quota via the quota-infrastructure pattern (30/day, see §9;
  revised by owner 2026-07-20); results are session-only (nothing persisted); sign-in
  CTA on the summary screen.

**Non-goals (v1) — do not build these:**

- Dynamic per-user material generation (that is Dictation v2; see §10).
- Word-level audio/text sync highlighting (Chirp3 provides no word timepoints).
- Updating `esl_learner_profiles` from dictation results (v2 concern; v1 only *stores*
  attempt data in a shape v2 can aggregate).
- Multiple synthesized speeds (client `playbackRate` covers this) or non-en-US audio.
- Admin UI for content management (library is seeded by an offline script).

## 2. System overview

```
offline (scripts/dictation-seed/)          runtime (Remix on CF Pages)
────────────────────────────────           ─────────────────────────────────────
Gemini: generate passages     ──review──►  D1: dictation_passages / _sentences
Google TTS: per-sentence MP3  ──upload──►  R2: dictation/{passageId}/{idx}.mp3
                                           /dictation        library + workspace
                                           /dictation/$passageId   session page
                                           /dictation/audio/$sentenceId  MP3
                                           feature_usage     anon/abuse quotas
                                           dictation_attempts (signed-in only)
```

Content is **global** (no `user_id` on passages/sentences) — unlike Speech/ESL assets,
the library is app content, not user data. That drives two decisions: audio is served
publicly with long cache headers (§6), and generation runs offline (§3), not in-app.

## 3. Content pipeline (offline seed script)

Location: `scripts/dictation-seed/` (Node + `tsx`, standalone — it must not import
from `apps/web/app/**` because of Remix path aliases; it duplicates a ~30-line Gemini
call and reimplements the service-account TTS auth, mirroring
`apps/web/app/utils/google-tts.server.ts`). Reads `GEMINI_API_KEY` and
`GOOGLE_TTS_SERVICE_ACCOUNT_JSON` from the environment (same values as `.dev.vars`).

Workflow decision (owner, 2026-07-20): **static library batches are generated
manually in a Claude Code session** (any capable LLM following the constraints in
`generate.ts`), so the owner reviews every passage before publishing; `generate.ts`
remains the scripted Gemini alternative. See `scripts/dictation-seed/README.md`.
(v2 grows this library to several hundred passages — §10 — at which point per-passage
human review gives way to LLM cross-checking plus human spot-checks; that scaling
decision is still open.)

Two-phase, so text quality is reviewable before spending TTS calls:

1. **Generate** (`pnpm tsx scripts/dictation-seed/generate.ts --band B1 --count 5`):
   calls Gemini (model: `gemini-flash-latest`, mirroring the `dictation_generate`
   entry added to the routing table in §8) and writes one JSON file per passage to
   `scripts/dictation-seed/out/`:

   ```json
   {
     "id": "<uuid>", "band": "B1", "topic": "daily life",
     "title": "...", "sentences": ["...", "..."]
   }
   ```

   **The LLM outputs the sentence array directly** — never generate prose and segment
   it afterwards; sentence segmentation code is a bug farm and the LLM boundary is
   authoritative. Prompt constraints: 8–12 sentences; each sentence ≤ 110 characters;
   vocabulary/grammar appropriate to the CEFR band; self-contained everyday topics;
   no proper nouns that are ambiguous to spell; digits written as words (scoring
   normalizes text, but "25" vs "twenty-five" must not cost the learner points).

2. **Publish** (`pnpm tsx scripts/dictation-seed/publish.ts out/<file>.json`): for each
   sentence, one Google TTS call (`input.type: "text"`, MP3, Chirp3 en-US voice —
   reuse the preference chain from `esl-passage-reference.server.ts`
   `pickReferenceVoice`; alternate MALE/FEMALE per passage for variety; store the
   chosen voice on the passage row). Then upload MP3s with
   `wrangler r2 object put bcailab-assets/dictation/{passageId}/{idx}.mp3` and insert
   D1 rows with `wrangler d1 execute bcailab-db --remote`. Idempotency: skip a passage
   whose id already exists in D1; the script must be safe to re-run.

Per-sentence text is far below the 5,000-byte TTS input limit — no chunking needed.
Cost ballpark: ~800 chars/passage ≈ $0.02–0.03 of Chirp3 TTS; the initial library
(5 passages × 4 bands = 20) costs under $1.

Initial library: 20 passages as above. Topics: delegate to the implementer — pick ~5
everyday domains (e.g. daily routines, travel, work, food, weather).

## 4. Data model (migration `migrations/0011_dictation.sql`)

Follow existing conventions: TEXT uuid ids, `created_at TEXT DEFAULT (datetime('now'))`,
soft delete via `deleted_at`, snake_case. Query helpers go in `packages/db/src/index.ts`
like every other table.

```sql
CREATE TABLE dictation_passages (
  id TEXT PRIMARY KEY,
  band TEXT NOT NULL,              -- 'A2' | 'B1' | 'B2' | 'C1'
  topic TEXT NOT NULL,
  title TEXT NOT NULL,
  voice_name TEXT NOT NULL,        -- Chirp3 voice used for all its sentences
  sentence_count INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',   -- future: 'draft'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX dictation_passages_band_idx ON dictation_passages(band, status);

CREATE TABLE dictation_sentences (
  id TEXT PRIMARY KEY,
  passage_id TEXT NOT NULL REFERENCES dictation_passages(id),
  idx INTEGER NOT NULL,            -- 0-based order within the passage
  text TEXT NOT NULL,              -- reference transcript (scoring ground truth)
  r2_key TEXT NOT NULL,            -- dictation/{passageId}/{idx}.mp3
  audio_bytes INTEGER NOT NULL,
  UNIQUE (passage_id, idx)
);

CREATE TABLE dictation_attempts (   -- signed-in users only
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  passage_id TEXT NOT NULL REFERENCES dictation_passages(id),
  accuracy REAL NOT NULL,          -- 0..1, server-computed
  sentence_results TEXT NOT NULL,  -- JSON, shape defined in §7 (v2 aggregation input)
  feedback_json TEXT,              -- LLM error-pattern feedback, nullable
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX dictation_attempts_user_idx ON dictation_attempts(user_id, created_at);

-- Generic per-feature daily counters; same subject scheme as translate_usage
-- ("user:<id>" / "anon:<cookie-id>" / "ip:<addr>"). New features use this table;
-- translate_usage stays as-is (consolidation is a Later engineering item, not v1).
CREATE TABLE feature_usage (
  feature TEXT NOT NULL,           -- 'dictation' | 'reading_trial' | 'writing_trial'
  subject TEXT NOT NULL,
  day TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  units INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (feature, subject, day)
);
```

## 5. Routes & UI

Remix flat-file routes (see AGENTS.md routing conventions):

| Route file | Path | Behaviour |
|---|---|---|
| `dictation.tsx` | layout | Tool shell (see below). |
| `dictation._index.tsx` | `/dictation` | Library: passages grouped by band; per-band progress for signed-in users; "start" CTA. Public (no `requireUser`). |
| `dictation.$passageId.tsx` | `/dictation/:passageId` | The dictation session (stepper + summary). Public but start-gated by quota (§9). |
| `dictation.audio.$sentenceId.ts` | `/dictation/audio/:sentenceId` | MP3 stream, public, cacheable (§6). |

Shell: follow the tool-shell pattern (`docs/tool-shell-pattern.md`) the way **Speech**
does — shared left rail (library nav + signed-in attempt history), single center stage,
no right rail (`docs/tool-shell-audit.md` reasoning applies: dictation has one primary
workspace state). Add the Dictation module card to `/english` (`english.tsx`); unlike
Reading/Writing cards it links straight to `/dictation` without the login popup, since
the tool is anonymous-friendly (same acquisition role as Translate).

Session page states:

1. **Stepper** (one sentence at a time): audio player (autoplay on advance; replay
   button; speed toggle 0.75×/1.0× via `playbackRate`), free-text input, "check"
   action → instant client-side diff rendered as colored tokens (correct / wrong /
   missing / extra), then "next". Unlimited replays; count replays per sentence.
2. **Summary** (after last sentence): overall accuracy, per-sentence diff review,
   signed-in → persisted attempt + LLM feedback panel (§8); anonymous → sign-in CTA
   ("save your progress and get coach feedback").

User context comes from the root outlet (`useOutletContext`), per AGENTS.md — do not
add per-route user loaders.

## 6. Audio serving

`/dictation/audio/:sentenceId`: look up the sentence (join passage; 404 if passage
deleted/unpublished), stream the R2 object with `Content-Type: audio/mpeg` and
`Cache-Control: public, max-age=31536000, immutable` (content is global, id-addressed,
never rewritten — if a passage is regenerated it gets a new id). **No auth check** —
this is deliberately different from `/speech/audio/:id` and `/esl/audio/:id`, which
serve private user data. Sentence clips are a few seconds long; Range support is not
required in v1 (it stays on the Later engineering list).

## 7. Scoring (deterministic)

New shared pure module `apps/web/app/utils/dictation-diff.ts` — **no server or DOM
dependencies**, imported by both the session page (instant feedback) and the completion
action (authoritative score). This is exactly the kind of LLM-free parser logic the
roadmap wants vitest coverage for — add unit tests if the test harness exists by then;
otherwise keep the module pure so tests can be added later.

- Normalize: lowercase; trim; collapse whitespace; strip punctuation except intra-word
  apostrophes and hyphens ("don't", "twenty-five").
- Tokenize on spaces; align user tokens to reference tokens with token-level
  Levenshtein + backtrace, producing ops: `match | substitute | delete | insert`
  (delete = word the user missed; insert = extra word the user typed).
- `accuracy = matches / referenceTokenCount` per sentence; passage accuracy is
  reference-token-weighted across sentences.
- Flooding guard (owner, 2026-07-20): extra words (`insert` ops) cost nothing while the
  user's token count stays under 2× the reference token count; beyond that each
  overflow token cancels one match
  (`overflow = max(0, userTokens − 2·referenceTokens)`,
  `accuracy = max(0, matches − overflow) / referenceTokenCount`).

Completion flow: the client POSTs `{ passageId, answers: string[] (one per sentence,
raw user text), replays: number[] }` to the session route action. The server **recomputes**
the diff from stored reference text (never trusts client scores) and, for signed-in
users, inserts `dictation_attempts` with `sentence_results` JSON:

```json
[{ "idx": 0, "userText": "...", "accuracy": 0.9, "replays": 2,
   "ops": [{ "op": "substitute", "ref": "their", "got": "there" }] }]
```

Only non-`match` ops are stored (keeps rows small; matches are recoverable from the
reference text). This shape is the v2 aggregation contract — see §10.

## 8. LLM integration

Add to `TASK_MODELS` in `apps/web/app/utils/llm.server.ts`:

- `dictation_generate: { model: DEFAULT_MODEL }` — documents the routing decision;
  v1's offline script mirrors it (the script cannot import app code, §3). When v2
  moves generation into the runtime, this entry is already the control point.
- `dictation_feedback: { model: DEFAULT_MODEL, envModelOverride: true }` — runtime.

Feedback runs in the completion action for signed-in users only, via
`context.ctx.waitUntil` with a `feedback_json` null→filled pattern (the summary page
polls or revalidates, same spirit as the ESL reference-TTS status flow). Input: the
non-match ops + band; output (JSON via `parseJsonFromText`): 2–4 error patterns, each
`{ pattern, evidence, tip }` — e.g. homophones, dropped articles, verb endings.
Feedback failure must not fail the attempt: store the attempt, leave `feedback_json`
null, render the summary without the panel.

## 9. Quotas & anonymous trial

Generalize the translate-quota pattern into `apps/web/app/utils/feature-quota.server.ts`
(new `feature_usage` helpers in `@bcailab/db`; reuse `ensureAnonId`, `readAnonId`,
`getClientIp`, and the `subjectsFor` subject scheme from `translate-quota.server.ts` —
export/share them rather than copying).

- Feature `dictation`: anonymous **30 passages/day** (counted against `anon:` and `ip:`
  subjects, increment on session **start**, i.e. first sentence-check POST or an
  explicit start action — not on page view); signed-in **100/day** invisible abuse cap.
  (Revised by owner 2026-07-20 from 1/30: v1 sessions consume no LLM tokens — audio is
  pre-generated and feedback is signed-in only — so the caps only bound scripted abuse.
  Revisit if v2 changes the runtime cost profile.)
- Quota exceeded (anonymous): the session page renders a friendly gate with the
  sign-in CTA, mirroring the translate quota banner.
- Audio endpoints are not quota-gated (public content; the LLM/TTS spend already
  happened offline). The quota bounds LLM feedback spend and shapes the funnel.

## 10. Forward-compatibility with Dictation v2 (do not build v2 now)

v2 (roadmap Later) introduces a shared learner-model layer and, **revised 2026-07-20
(owner confirmed)**, a material *matching* service rather than a runtime generation
service: the library stays pre-generated and dimensionally tagged, and v2 retrieves
from it. See the roadmap entry for the full rationale — in short, a fixed item bank
can be empirically calibrated from real accuracy data, TTS cost amortizes across all
users instead of recurring per session, retrieval is a D1 query rather than a
multi-second round trip, and per-passage human review stays in the loop.

v1's obligations to that future:

1. `sentence_results` ops JSON (§7) is the stable observation format v2 aggregates —
   changing it later means migrating attempt rows, so keep it minimal and factual
   (raw ops, no interpretations). Deterministic diff data is also the *measurement*
   input for level assessment; the LLM interprets patterns, it does not measure.
2. Generation prompts/constraints live in the seed script as plain exported constants,
   so v2's library-expansion tooling can reuse them without archaeology.
3. Do **not** read or write `esl_learner_profiles` from dictation code in v1.
4. Passage/sentence rows carry no per-user data (§2), so the same row can serve many
   learners and accumulate the accuracy statistics calibration depends on. v2 adds
   tag columns/tables alongside them; do not add user scope to this content.

## 11. Implementation order

1. Migration 0011 + `@bcailab/db` helpers (passages/sentences/attempts/feature_usage).
2. `dictation-diff.ts` (pure) — the only algorithmically fiddly piece; do it first.
3. Seed script (generate → review output by eye → publish 20 passages).
4. Routes: audio endpoint → library page → session page (stepper, then summary).
5. Quota wiring (feature-quota util + gates) and `/english` module card.
6. LLM feedback (waitUntil + summary panel).
7. Docs sync (§12) + roadmap Done entry, same PR.

## 12. Documentation sync (same PR as implementation)

- `docs/architecture.md`: add `/dictation*` routes to the route map; note the R2
  `dictation/` prefix and that it is public content (unlike other R2 prefixes).
- New `docs/tools/dictation.md` following the `docs/tools/*.md` format (features,
  routes, data & deletion, constraints).
- `docs/infra-cloudflare.md` / `docs/workflow.md`: no new env vars expected; state
  `Docs impact: none` for them if that holds.

---

# Appendix A — Try-before-sign-in for Reading/Writing (the other Now item)

Small extension; checklist-level guidance (implementer decides details within this):

- **Quota**: features `reading_trial` / `writing_trial` in `feature_usage`, anonymous
  5/day (anon + ip subjects; revised by owner 2026-07-20 from 1/day so a mis-click
  doesn't burn the whole trial), via the same `feature-quota.server.ts` from §9. Build
  §9's util first if this item is picked up first.
- **Writing**: `writing._index.tsx` currently calls `requireUser`. Anonymous path:
  accept one essay submission, run the normal evaluation, render the result
  **ephemerally — persist nothing** (no D1 rows, no history). Banner on the result:
  sign in to save history and track progress.
- **Reading**: the ESL flow records attempt audio to R2 before evaluation. Anonymous
  path: one fixed, pre-seeded sample passage (global, like dictation content);
  evaluate the recording and discard it — prefer passing audio bytes straight to the
  eval call without an R2 write; if the pipeline can't avoid the write, use a
  `trial/` R2 prefix and delete via `waitUntil` after evaluation. No attempt rows.
- **Entry**: `/english` module cards for Reading/Writing currently open the login
  popup for anonymous users (AGENTS.md, Unauthenticated Interaction). Change them to
  link into the tool's trial path; keep the popup for a second use once the trial
  quota is spent.
- **Docs sync**: update `docs/tools/esl.md`, `docs/tools/writing.md`, and the
  AGENTS.md "Unauthenticated Interaction" section in the same PR.
