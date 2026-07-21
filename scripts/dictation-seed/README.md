# Dictation seed pipeline

Offline content pipeline for the Dictation v1 material library
(design: `docs/dictation-v1-design.md` §3). Two phases, so text quality is
reviewable before spending TTS money.

## Workflow (owner decision, 2026-07-20)

**Static library batches are generated manually, in a Claude Code session, so the
owner reviews every passage before it is published.**

Dictation v2 keeps this pre-generated model — it *matches* learners to library
material rather than generating per request (see the roadmap entry and design §10).
That means the library grows to several hundred passages, and at that scale
per-passage human review gives way to LLM cross-checking plus human spot-checks.
How exactly that scales is still an open decision; until it is settled, every
published passage is reviewed.

1. **Generate** — either path produces the same reviewable artifact,
   one JSON file per passage in `out/`:
   - *Manual (default for library batches):* ask the AI session to write passages
     following the constraints in `generate.ts` (`buildDictationPrompt`,
     `DICTATION_SENTENCE_*`), validating: 8–12 sentences, ≤110 chars each, no
     digits (numbers as words), no ambiguous proper nouns, CEFR-band-appropriate
     language.
   - *Scripted:* `pnpm tsx scripts/dictation-seed/generate.ts --band B1 --count 5`
     (Gemini, needs `GEMINI_API_KEY`; mirrors the `dictation_generate` routing entry).
2. **Review** — the owner reads `out/*.json` by eye. Nothing publishes without this.
3. **Publish** — `pnpm tsx scripts/dictation-seed/publish.ts --all` (or specific
   files). Per passage: Chirp3 en-US TTS per sentence (voice gender alternates by
   uuid parity), upload to R2 `dictation/{passageId}/{idx}.mp3`, insert D1 rows.
   Needs `GOOGLE_TTS_SERVICE_ACCOUNT_JSON` (env or root `.dev.vars`) and a
   logged-in wrangler.

## Properties

- **Idempotent**: a passage already in D1 is skipped; safe to re-run after failures.
- **Resumable without re-spend**: synthesized MP3s are cached in `out/audio/`
  (gitignored); re-runs upload from cache instead of calling TTS again.
- **D1 insert is last**, so "exists in D1" means "fully published".
- `--local` targets local D1/R2 for plumbing tests (TTS still runs for real).
- `out/*.json` files are committed as provenance for what was published.

## Cost

~800 chars/passage ≈ $0.02–0.03 of Chirp3 TTS; a 20-passage batch is under $1.
