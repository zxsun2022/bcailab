# Speech Tool

Speech is an authenticated text-to-speech utility built on Google Cloud TTS Neural2 voices.

## Features
- Input text and generate MP3 audio (`/tts`)
- Default input mode is **Markdown cleanup** (with optional **Plain text** mode)
- Language + Neural2 voice selection
- Generated audio is immediately playable and downloadable
- Generation history page (`/tts/history`) with play/download/delete actions
- Generated MP3 files are stored privately in Cloudflare R2

## Routes
| Page | Route | Key behaviour |
|------|-------|---------------|
| Generate | `/tts` | Auth required. Generate Neural2 MP3 and show synced transcript. |
| History | `/tts/history` | Auth required. Lists only current user's generations. |
| Audio stream/download | `/tts/audio/:id` | Auth required. Owner-only playback/download endpoint. |

## Input Modes
- `markdown`: Parses Markdown and strips formatting syntax before synthesis.
- `plain`: Sends raw text to Neural2 (symbols are read as-is when applicable).

## Time-Synced Highlighting
- Timing is derived from SSML `<mark>` timepoints (`SSML_MARK`), not automatic word timestamps.
- Generated text is tokenized before synthesis:
  - English/French/Spanish: word-level
  - Japanese: character-level
- During playback, transcript highlighting uses continuous progress interpolation in one line.

## Data & Deletion
- D1 table: `tts_generations`
- R2 key pattern: `tts/{userId}/{yyyy}/{mm}/{id}.mp3`
- Delete action performs:
  1. Delete R2 object
  2. Soft-delete D1 row (`deleted_at`)

## Constraints
- Neural2 voices only (no automatic fallback to other voice families)
- Single-request SSML payload limit is enforced in app-side validation
