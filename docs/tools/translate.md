# Translate Tool

DeepL-style translation page driven by the Gemini API. Lives inside the English Studio product
(`/english` landing page) but is served at the top-level canonical route `/translate`, consistent
with the other tool routes. Translate is the free acquisition funnel: anonymous users can use it
without an account, within daily quotas.

## Live Routes
| Page | Route | Key behaviour |
|------|-------|---------------|
| Translate | `/translate` | Public. Two-pane UI: source text left, translation right. Renders under the global site header (same pattern as Posts). Its `action` is the no-JS fallback only. |
| Translate stream | `/translate/stream` | Public resource route (POST). SSE endpoint the page uses whenever JavaScript is available. |

## Quotas & Tiers
Defined in `apps/web/app/utils/translate-quota.server.ts`; counters live in the D1
`translate_usage` table (one row per subject per UTC day).

| Tier | Identified by | Max chars/request | Requests/day | Model task |
|------|---------------|-------------------|--------------|------------|
| Anonymous | `bcailab_anon` cookie **and** client IP (both counted; the higher count wins) | 5,000 | 8 | `translate_anonymous` (flash-lite) |
| Signed-in ("free") | user id | 20,000 | 200 (invisible abuse cap) | `translate` (flash / `GEMINI_MODEL`) |

- Quota is checked before the LLM call and recorded only after a successful translation.
- Anonymous UI shows a banner with remaining translations and a sign-in CTA; hitting the
  limit returns HTTP 429 with a sign-in prompt.
- The tier table has an `anonymous/free` shape so a future `paid` tier slots in without
  schema changes.

## Behaviour
- **Languages**: English, Chinese (Simplified/Traditional), Japanese, Korean, French, German,
  Spanish, Portuguese, Italian, Russian. The shared list lives in
  `apps/web/app/utils/translate-languages.ts` (client-safe module).
- **Auto-detect**: default source is `Detect language`; the model returns the detected source
  code, shown in the source select and the output pane footer.
- **Swap**: swaps source/target and moves the translation into the source pane. Disabled until a
  detection or explicit source language exists.
- **Submit**: button or ⌘/Ctrl+Enter. With JavaScript the page POSTs to `/translate/stream` and
  renders the translation as it arrives; without it, the form posts normally to the `/translate`
  action and the whole translation appears at once.
- **Streaming output**: translated text appears incrementally, with a blinking caret while the
  stream is open. Submitting again aborts the in-flight stream. A stream that ends without a
  terminator renders "Translation was interrupted."
- **Limits**: per-tier — see "Quotas & Tiers" above. The char counter and submit button use
  the tier limit returned by the loader.
- **Copy / Clear**: output pane has a copy button; input pane has a clear button.
- **Stable layout**: the translate workspace has a fixed responsive width, so adding or removing
  translation output does not resize the two-pane container.
- **Provider failures**: model or upstream failures render the inline retry message rather than
  an error page. Both paths deliberately answer with a normal 200 body because Cloudflare may
  replace HTTP 502 bodies with an HTML gateway page, which would otherwise trigger Remix's
  page-level error boundary.

## Server
- `apps/web/app/utils/translate.server.ts` builds the prompt and delegates the model call to
  the unified LLM layer (`llm.server.ts`) with a per-tier task (`translate` /
  `translate_anonymous`). Two shapes:
  - Non-streaming (`translateText` → `callGemini`): expects
    `{"translation": string, "detected_source_language": string}`.
  - Streaming (`streamTranslateText` → `streamGemini`): JSON is unusable mid-stream, so the
    model emits `#lang: <code>` as line 1 and the translation from line 2. `splitLangHeader`
    strips that header server-side and never forwards it to the client.
- `translate-request.server.ts` holds the validation + quota gate both entry points share, so
  limits and counters cannot drift between the streaming and fallback paths.
- Both paths record usage only after a successful translation; a stream that fails part-way
  does not consume the day's allowance.

### `/translate/stream` wire format
Server-Sent Events, one JSON object per `data:` line. Always HTTP 200 — errors travel in-band,
both because a stream's status is committed before the model produces anything and for the
Cloudflare reason under "Provider failures" above.

| Event | Payload | Notes |
|-------|---------|-------|
| `detected` | `{"language": "zh-Hans"\|null}` | At most once, before any delta. |
| `delta` | `{"text": "…"}` | Translation text in arrival order; concatenate. |
| `done` | `{"remainingToday": n}` | Success terminator. |
| `error` | `{"error": "…", "code"?: "quota_exceeded"\|"too_long"}` | Terminal; may arrive first. |

- Uses the existing `GEMINI_API_KEY` / `GEMINI_MODEL` env vars — no new infrastructure.
- Translation text is never persisted; only daily usage counters (request count + char count)
  are stored in `translate_usage`.

## Client/Server Split
Route components must not import `*.server.ts` modules for values used in the component body
(Vite raises "Server-only module referenced by client" and hydration fails). Shared constants
(language list, max chars) therefore live in `translate-languages.ts`, and the route imports
only `translateText` from `translate.server.ts` inside the `action`.
