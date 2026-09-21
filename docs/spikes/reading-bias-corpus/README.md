# Reading bias corpus kit

Status: **kit ready; no recordings made, no ground truth, no experiment run.** Added 2026-09-18.

This is the practical half of the [Reading context bias protocol](../reading-context-bias-protocol.md):
what to record, how to annotate it, and how to turn it into the registered manifest that
`scripts/grader-bias.ts` runs. The protocol and roadmap criterion (d) own the design and the
thresholds; nothing here changes them or enables Reading's brief.

Files:

- `draft.template.json`: the recording slate, the two passages, and the synthetic learner claims.
  Copy it to `draft.json` and fill in the `TODO` fields.
- `scripts/grader-bias/prepare.ts`: turns `draft.json` into `manifest.json`. It hashes the audio,
  computes error offsets from quotes, renders the candidate brief with the production
  learner-context code, and runs the registered validator. It refuses a draft that still contains
  `TODO`.
- `audio/`: your recordings. Git ignores this directory: the committed manifest pins each file by
  SHA-256, and the audio is never published.

## 0. What you need

Nothing is deployed and nothing touches production. The experiment runs from a checkout on your
own machine, sends each recording straight to the model API, and writes its report into
`docs/spikes/`. It reads no learner data and writes nothing to D1, R2 or Pages.

- **This repository**, with `pnpm install` already run.
- **`GEMINI_API_KEY`** in `.dev.vars` at the repo root (the same file local development uses), or
  exported in the shell. `GEMINI_BASE_URL` is optional and only needed to route through the AI
  Gateway. The validation step needs no key at all.
- **A way to record audio.** A phone voice-memo app is enough: quiet room, `.m4a`/`.mp3`/`.wav`,
  a few seconds to a minute per file, under 20 MiB. No studio, no editing software — splicing is
  not allowed anyway.
- **Two speakers** reading the same two passages. Any two people; they are recorded under
  pseudonyms.
- **A listener** to check each recording against its script. Ideally not the speaker.
- **Time and cost.** Roughly an hour to record and annotate eight files. The full run is 120
  model calls, each one short clip plus the Reading prompt, and takes a few minutes.

## 1. Decide before recording (owner)

These two choices are fixed by the committed manifest. Changing either one afterwards means a new
registered experiment.

- **The model.** Production Reading evaluation uses `reading_eval`. Its code default is
  `gemini-3.6-flash`, but that task honours the `GEMINI_MODEL` override. Check the Pages
  **Production** environment. If `GEMINI_MODEL` is set, the manifest must name that exact model.
  Do not use a floating alias such as `-latest`: the experiment would test a model that later
  changes underneath it.
- **The shape of the brief.** `prepare.ts` renders the heading, the shared usage rules,
  `Level: not established`, and one tag line, for example: "the 'th' sound: 55% over 24
  occurrences — may include AI judgement (Reading)". The proposal's Reading share (§4.3) also
  names **reading notes from other passages**. The shared renderer has no section for those yet,
  and Reading's projection is deliberately not implemented. Under the protocol, a pass authorises
  only the shape that was tested. So either:
  - **(recommended)** accept this tags-only brief as Reading's first rollout shape, with reading
    notes added later behind their own re-run, the same way Stage 2 (e) handles Dictation notes;
    or
  - build reading-notes rendering first, then extend `prepare.ts` to include them before freezing
    the draft.

The claims in the template are 55% over 24 occurrences for both tags. The legacy phrase states
the same weakness in the legacy `persistent_issues` form. Keep the brief and the legacy phrase
equivalent: the tool cannot check that they mean the same thing.

## 2. The slate: eight recordings, two speakers

| Recording | Speaker | Passage | Tested tag | Weakness | Scripted error outside the tag |
|---|---|---|---|---|---|
| `a-th-present` | A | th | `th_sound` | present | mispronounce **warm** (as "worm") |
| `a-th-absent` | A | th | `th_sound` | absent | — |
| `b-th-present` | B | th | `th_sound` | present | — |
| `b-th-absent` | B | th | `th_sound` | absent | wrong stress on **enjoyed** ("EN-joyed") |
| `a-link-present` | A | link | `linking` | present | — |
| `a-link-absent` | A | link | `linking` | absent | mispronounce **shelf** (as "self") |
| `b-link-present` | B | link | `linking` | present | wrong stress on **extra** ("ex-TRA") |
| `b-link-absent` | B | link | `linking` | absent | — |

This is the smallest set the validator accepts. It has two present and two absent recordings for
each tag, both speakers on every cell, and known errors outside the tested tag in four recordings,
spread across both tags, both speakers and both conditions. It costs **120 model calls**
(8 × 5 × 3). You can add more recordings, but never duplicate one audio file under two labels.

Every reading of a passage uses the identical text, so present and absent recordings differ only
in the reading. Speakers are pseudonymous (`speaker-a`, `speaker-b`). Get each speaker's consent
for the recording to be sent to the model provider.

## 3. The passages

Both passages are in the template. Their exposure is computed by the same tag code production
uses, and `prepare.ts --passages draft.json` prints it again:

- **th** (43 words): 23 `th_sound` words, and only 1 linking boundary.
- **link** (43 words): 25 linking boundaries, and only 1 `th_sound` word.

Library passages are acceptable instead. Do not edit a passage after anyone has recorded it: the
offsets and the audio must describe the same text.

## 4. Recording and ground truth

General rules for every file:

- Use a quiet room and one continuous take, at a natural reading pace. Do not splice.
- Save `.m4a`, `.mp3` or `.wav`, at most 20 MiB, named exactly as in the slate.
- Script only what the slate lists. Read everything else as naturally as you can.
- Freeze the ground truth **before** any grader has heard the file. That includes the
  `grader-variance.ts` preliminary screen.

**`th_sound`, present.** Replace th with t or d on these eight words, clearly and every time:
*Thursday → "Tursday", three → "tree", brothers → "broders", their → "deir",
thought → "tought", weather → "wedder", thick → "tick", nothing → "nutting"*. Say every other
th word correctly.

**`th_sound`, absent.** Say every th word correctly, including *the, they, them, with, both,
something, north, worth, clothes, mother, father*.

**`linking`, present.** Make a clear break, with a short pause or a glottal restart, at every one
of these boundaries: *pick | it | up, put | it | on, in | an | office, an | apple,
or | an | orange, turn | off | all | of, at | eight, lock | up, ask | a, if | an | extra*.
(Every one of these is a boundary the production tagger counts as linking, a consonant letter
followed by a vowel letter. *take | an* is deliberately absent, because *take* ends in a vowel
letter.) Keep everything else fluent.

**`linking`, absent.** Link all of those boundaries smoothly. Use no break except at the
punctuation.

**Listen-check.** A listener goes through every target word or boundary. Ideally this is someone
other than the speaker, and it is required when a recording is ambiguous.

- A **present** recording must contain every scripted error.
- An **absent** recording must contain none, anywhere in the tested tag.
- If anything is ambiguous, **re-record rather than argue**. The absent recordings measure false
  positives, so a stray th error or a choppy boundary in one of them corrupts exactly the number
  the gate depends on.
- Unscripted slips outside the tested tag are acceptable. Note them.

Write `groundTruth` as one line in this shape:

```text
Method: scripted (th→t/d on 8 listed words). Listen-check: <listener pseudonym>, <date>: all 8
present, no other th errors. Unscripted: none. Scripted outside tag: "warm" as "worm".
```

**Known errors outside the tag (`otherErrors`).** List only the scripted ones from the slate, by
`kind` and `quote`. When the same quote appears more than once, add `occurrence` (it defaults to
the first). `prepare.ts` computes the offsets. The kinds and their limits:

- `mispronunciation`: a single word. On a `th_sound` recording, never quote a word containing
  "th".
- `stress`: the stressed word.
- `intonation`: available, but not used in this slate.
- `pause`: counts against linking, so **never** use it on a `linking` recording.

The validator rejects any error that would count against the tested tag.

## 5. Freeze, commit, run

```bash
cp docs/spikes/reading-bias-corpus/draft.template.json docs/spikes/reading-bias-corpus/draft.json
```

Fill in `draft.json`: the model, `briefDate`, and each recording's `durationSeconds` and
`groundTruth`. Put the audio in `audio/`. Then run these in order:

```bash
pnpm exec tsx scripts/grader-bias/prepare.ts --draft docs/spikes/reading-bias-corpus/draft.json
```

```bash
pnpm exec tsx scripts/grader-bias.ts --manifest docs/spikes/reading-bias-corpus/manifest.json
```

The second command validates only; it makes no model call. Commit `draft.json` and
`manifest.json`, but not the audio. That commit is the pre-registration. Then run the
experiment, which refuses to run if the manifest or the experiment code differs from `HEAD`:

```bash
pnpm exec tsx scripts/grader-bias.ts --manifest docs/spikes/reading-bias-corpus/manifest.json --run
```

Report both comparisons to the owner, whatever the result (protocol, "Metrics and limits").

## Alternative: constructed audio

The proposal also allows ground truth **by construction**:

- a TTS reading of the passage as an absent recording;
- a TTS reading of respelled text ("tree tin brodders") as a scripted th-present recording;
- SSML breaks at the listed boundaries as a linking-present recording.

Two distinct voices count as two speakers. This is faster and its ground truth is exact, but a
grader may treat synthetic voices differently from learners. Listen-check constructed files as
well, and record `Method: constructed (TTS voice …)` in `groundTruth`. A mix of both methods is
fine, as long as each cell of the slate still has both speakers.
