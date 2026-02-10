# Speech Tool

Speech is an authenticated text-to-speech utility built on Google Cloud TTS Chirp3 and Neural2 voices.

## Features
- Input text and generate MP3 audio (`/tts`)
- Input text is automatically rendered to clean plain text before synthesis
- Language + voice selection (Chirp3 preferred, Neural2 fallback)
- Generated audio is immediately playable and downloadable
- Generation history page (`/tts/history`) with play/download/delete actions
- Generated MP3 files are stored privately in Cloudflare R2

## Routes
| Page | Route | Key behaviour |
|------|-------|---------------|
| Generate | `/tts` | Auth required. Generate MP3 and show synced transcript when supported. |
| History | `/tts/history` | Auth required. Lists only current user's generations. |
| Audio stream/download | `/tts/audio/:id` | Auth required. Owner-only playback/download endpoint. |

## Text Preprocessing
- User input is parsed as Markdown and converted to plain readable text before synthesis.
- Markdown formatting symbols are removed automatically in preprocessing.

## Time-Synced Highlighting
- Timing is derived from SSML `<mark>` timepoints (`SSML_MARK`), not automatic word timestamps.
- Generated text is tokenized before synthesis:
  - English/French/Spanish: word-level
  - Japanese: character-level
- Neural2 generation supports playback highlighting with:
  - read text color progression
  - current line background highlight
  - current word accent highlight
- Chirp3 generation does not provide usable word timepoints, so playback is shown without highlighting.

## Data & Deletion
- D1 table: `tts_generations`
- R2 key pattern: `tts/{userId}/{yyyy}/{mm}/{id}.mp3`
- Delete action performs:
  1. Delete R2 object
  2. Soft-delete D1 row (`deleted_at`)

## Constraints
- Voice list is limited to Chirp3 and Neural2 families.
- Google TTS input limit is **5,000 bytes per request** (text/SSML); app-side validation enforces this on the final SSML payload.
