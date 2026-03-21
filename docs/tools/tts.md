# Speech Tool

Speech is an authenticated text-to-speech utility built on Google Cloud TTS Chirp3 voices.

## Features
- Input text and generate MP3 audio (`/speech`)
- Input text is automatically rendered to clean plain text before synthesis
- Language + voice selection (Chirp3 only in the Speech workspace)
- Generated audio is immediately playable and downloadable
- History is integrated on the same `/speech` page via the shared left rail shell
- Selected record is controlled by query param: `?record=<generationId>`
- “Copy text” action in the selected record toolbar with transient success/failure feedback
- Generated MP3 files are stored privately in Cloudflare R2

## Routes
| Page | Route | Key behaviour |
|------|-------|---------------|
| Speech workspace | `/speech` | Auth required. Generate, browse history, select record, play/download/delete. |
| Audio stream/download | `/speech/audio/:id` | Auth required. Owner-only playback/download endpoint. |
| Legacy compatibility | `/tts`, `/tts/history`, `/tts/*` | 301 redirect to `/speech*`. |

## Workspace Structure
- Desktop `/speech` follows the shared tool-shell pattern used by Writing and Reading:
  - shared left rail shell for history and settings access
  - a single `speech-center-stage` that owns the main page scroll
  - a constrained `speech-content-column` for the generator and selected-record views
- In the desktop compose state, the input card intentionally fills the available workspace height so the textarea remains the dominant surface and the generate controls stay anchored near the bottom edge.
- Speech intentionally does **not** introduce a right rail. History remains in the left rail only.
- Long-form controls such as the synced transcript may still keep local overflow when needed for playback-follow behavior, but the workspace-level scroll belongs to the center stage.

## Text Preprocessing
- User input is parsed as Markdown and converted to plain readable text before synthesis.
- Markdown formatting symbols are removed automatically in preprocessing.

## Playback View
- Speech currently exposes Chirp3 voices only.
- Chirp3 generation does not provide usable word timepoints, so playback is shown without word-level synchronized highlighting.

## Data & Deletion
- D1 table: `tts_generations`
- R2 key pattern: `tts/{userId}/{yyyy}/{mm}/{id}.mp3`
- Delete action performs:
  1. Delete R2 object
  2. Soft-delete D1 row (`deleted_at`)
  3. Reload selected history state from the remaining records

## Constraints
- Voice list in the Speech workspace is limited to the Chirp3 family.
- Google TTS input limit is **5,000 bytes per request** (text/SSML); app-side validation enforces this on the final SSML payload.
