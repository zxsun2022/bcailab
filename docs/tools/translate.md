# Translate Tool

DeepL-style translation page driven by the Gemini API. Lives inside the English Studio product
(`/english` landing page) but is served at the top-level canonical route `/translate`, consistent
with the other tool routes.

## Live Routes
| Page | Route | Key behaviour |
|------|-------|---------------|
| Translate | `/translate` | Auth required. Two-pane UI: source text left, translation right. Renders under the global site header (same pattern as Posts). |

## Behaviour
- **Languages**: English, Chinese (Simplified/Traditional), Japanese, Korean, French, German,
  Spanish, Portuguese, Italian, Russian. The shared list lives in
  `apps/web/app/utils/translate-languages.ts` (client-safe module).
- **Auto-detect**: default source is `Detect language`; the model returns the detected source
  code, shown in the source select and the output pane footer.
- **Swap**: swaps source/target and moves the translation into the source pane. Disabled until a
  detection or explicit source language exists.
- **Submit**: button or ⌘/Ctrl+Enter. Requests go through a Remix `action` via `useFetcher`.
- **Limits**: 5,000 characters per request (`TRANSLATE_MAX_CHARS`).
- **Copy / Clear**: output pane has a copy button; input pane has a clear button.

## Server
- `apps/web/app/utils/translate.server.ts` calls Gemini `generateContent`
  (`GEMINI_MODEL` or default `gemini-flash-latest`) with `responseMimeType: application/json`
  and expects `{"translation": string, "detected_source_language": string}`.
- Uses the existing `GEMINI_API_KEY` / `GEMINI_MODEL` env vars — no new infrastructure.
- Translation requests are stateless: nothing is persisted to D1/R2.

## Client/Server Split
Route components must not import `*.server.ts` modules for values used in the component body
(Vite raises "Server-only module referenced by client" and hydration fails). Shared constants
(language list, max chars) therefore live in `translate-languages.ts`, and the route imports
only `translateText` from `translate.server.ts` inside the `action`.
