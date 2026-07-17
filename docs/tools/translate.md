# Translate Tool

DeepL-style translation page driven by the Gemini API. Lives inside the English Studio product
(`/english` landing page) but is served at the top-level canonical route `/translate`, consistent
with the other tool routes. Translate is the free acquisition funnel: anonymous users can use it
without an account, within daily quotas.

## Live Routes
| Page | Route | Key behaviour |
|------|-------|---------------|
| Translate | `/translate` | Public. Two-pane UI: source text left, translation right. Renders under the global site header (same pattern as Posts). |

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
- **Submit**: button or ⌘/Ctrl+Enter. Requests go through a Remix `action` via `useFetcher`.
- **Limits**: per-tier — see "Quotas & Tiers" above. The char counter and submit button use
  the tier limit returned by the loader.
- **Copy / Clear**: output pane has a copy button; input pane has a clear button.
- **Stable layout**: the translate workspace has a fixed responsive width, so adding or removing
  translation output does not resize the two-pane container.
- **Provider failures**: model or upstream failures stay inside the fetcher data path and render
  the inline retry message. They deliberately return a normal JSON response because Cloudflare
  may replace HTTP 502 bodies with an HTML gateway page, which would otherwise trigger Remix's
  page-level error boundary.

## Server
- `apps/web/app/utils/translate.server.ts` builds the prompt and delegates the model call to
  the unified LLM layer (`llm.server.ts`) with a per-tier task (`translate` /
  `translate_anonymous`); expects `{"translation": string, "detected_source_language": string}`.
- Uses the existing `GEMINI_API_KEY` / `GEMINI_MODEL` env vars — no new infrastructure.
- Translation text is never persisted; only daily usage counters (request count + char count)
  are stored in `translate_usage`.

## Client/Server Split
Route components must not import `*.server.ts` modules for values used in the component body
(Vite raises "Server-only module referenced by client" and hydration fails). Shared constants
(language list, max chars) therefore live in `translate-languages.ts`, and the route imports
only `translateText` from `translate.server.ts` inside the `action`.
