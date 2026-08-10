# Translate Tool

DeepL-style translation page driven by the Gemini API. Lives inside the English Studio product
(`/english` landing page) but is served at the top-level canonical route `/translate`, consistent
with the other tool routes. Translate is the free acquisition funnel: anonymous users can use it
without an account, within daily quotas.

## Live Routes
| Page | Route | Key behaviour |
|------|-------|---------------|
| Translate | `/translate` | Public. Responsive workspace inside the English Studio shell. Its `action` is the no-JS fallback only. |
| Translate stream | `/translate/stream` | Public resource route (POST). SSE endpoint the page uses whenever JavaScript is available. |
| Saved translations | `/translate/saved` | Auth required. Private, keyset-paginated list of explicitly saved results. The route action verifies completion proof before creating a row. |
| Saved translation | `/translate/saved/:id` | Auth required. Owner-scoped full source/result, Copy, and confirmed permanent delete. |

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
- **Accessible status**: the output is not a token-by-token live region. A separate polite status
  announces only start, completion, and failure.
- **Limits**: per-tier — see "Quotas & Tiers" above. The char counter and submit button use
  the tier limit returned by the loader.
- **Copy / Clear**: output pane has a copy button; input pane has a clear button.
- **Explicit Save**: completion alone writes no translation text. A completed result receives a
  short-lived server-signed proof and exposes Save. Signed-out Save opens the existing login
  popup; the in-memory result and anonymous proof remain available after authentication.
- **Immutable completion snapshot**: editing the source after completion does not mutate the
  displayed result. The page labels that state, and Save keeps the exact displayed
  source/language/result snapshot.
- **Stable layout**: the translate workspace has a fixed responsive width, so adding or removing
  translation output does not resize the two-pane container.
- **Mobile order**: source language → source input → Translate action → output. The input gives
  page scrolling back after roughly 40dvh; output avoids a short nested scroll. On completion,
  the output scrolls into view only when it is off-screen and respects reduced motion.
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
- Both successful paths expose the same HMAC completion proof only after the translation and
  quota write finish. The token is domain-separated as `bcailab:translate-save:v1`, expires
  after 15 minutes, and contains version/timestamps/completion id/subject/SHA-256 digest only —
  never source or translated text. Save accepts either the current signed-in subject or the
  same anonymous cookie subject after popup authentication, then recomputes the digest before
  any D1 write. Partial, interrupted, expired, tampered, or cross-subject results cannot save.

### `/translate/stream` wire format
Server-Sent Events, one JSON object per `data:` line. Always HTTP 200 — errors travel in-band,
both because a stream's status is committed before the model produces anything and for the
Cloudflare reason under "Provider failures" above.

| Event | Payload | Notes |
|-------|---------|-------|
| `detected` | `{"language": "zh-Hans"\|null}` | At most once, before any delta. |
| `delta` | `{"text": "…"}` | Translation text in arrival order; concatenate. |
| `done` | `{"remainingToday": n, "proof": "…"}` | Success terminator. Proof binds the completed snapshot without containing its text. |
| `error` | `{"error": "…", "code"?: "quota_exceeded"\|"too_long"}` | Terminal; may arrive first. |

- Uses the existing `GEMINI_API_KEY` / `GEMINI_MODEL` env vars — no new infrastructure.
- Translation text is not persisted by translating. Daily usage counters are stored in
  `translate_usage`; full text enters `saved_translations` only after an authenticated,
  explicit, proof-verified Save.

## Saved translations

Migration `0017_saved_translations.sql` creates the private durable surface:

- one row per `(user_id, completion_id)`, which makes double-click and transport retry
  idempotent while rejecting the same completion id with different text;
- source/requested/detected/target language metadata, source text, translated text, and
  timestamps;
- SQL length limits of 20,000 source and 40,000 translated characters, mirrored by server
  validation;
- keyset index `(user_id, created_at DESC, id DESC)`; list queries return at most 25 rows plus
  one lookahead and only a 160-character source preview;
- all list/detail/create/delete helpers require `userId` and include it in SQL. Missing and
  foreign ids both return the same 404;
- delete is a confirmed hard delete because translation text may be sensitive. Saved route
  responses use `Cache-Control: private, no-store`.

## Client/Server Split
Route components must not import `*.server.ts` modules for values used in the component body
(Vite raises "Server-only module referenced by client" and hydration fails). Shared constants
(language list, max chars) therefore live in `translate-languages.ts`, and the route imports
only `translateText` from `translate.server.ts` inside the `action`.
