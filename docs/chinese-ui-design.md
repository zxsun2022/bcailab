# Chinese UI — design

**Document role:** design. The owner raised the requirement and confirmed D1–D3 on 2026-09-22;
[ADR 0011](decisions/0011-chinese-ui-same-url-feedback-follows-interface.md) records the
decisions, and `docs/roadmap.md` carries the scope and acceptance criteria. This file holds the
mechanism, the coverage list and the reasoning, so neither of those has to.

## 1. Why now, and what already exists

[ADR 0003](decisions/0003-defer-chinese-ui.md) deferred a Chinese UI on 2026-07-15 and recorded
no reasoning. Two things changed:

- **The first cohort is Chinese-speaking learners.** The product has never named a target
  audience. Naming one makes an English-only interface a first-run barrier rather than a
  deferred nicety: a learner who needs the product cannot read the page that explains it.
- **There are no testers.** The owner cannot recruit users to observe. A Chinese interface makes
  the owner the one available proxy for the target learner — able to walk the first-run path as
  that learner would. This is a real benefit and a weak one: it produces judgement, not the
  usage evidence that [ADR 0002](decisions/0002-translate-stays-inside-english-studio.md) and
  [ADR 0009](decisions/0009-ielts-is-a-material-family-not-a-second-product.md) name as their
  revisit triggers. Nothing in this item produces that evidence.

Half of the Chinese capability already exists and is easy to miss:

| Surface | Today |
| --- | --- |
| Reading evaluation | English or Chinese output, per a shared preference (`esl-reading-eval.server.ts`) |
| Writing feedback | English or Chinese output, same preference (`writing-eval.server.ts`) |
| Dictation feedback | **English only. No language option at all.** |
| The preference itself | `bcailab-feedback-language` in `localStorage`, default `en`, set inside Reading's and Writing's own settings pages |
| Interface chrome | English only. `<html lang="en">` is hard-coded; there is no catalogue, no switcher, no locale in the URL |
| Fonts | `--font-display` and `--font-body` already fall back to `Noto Serif SC` / `Songti SC`; `--font-mono` does not |

So the work is the interface, the discoverability and defaults of the existing feedback
preference, and Dictation's missing half — not a from-scratch bilingual product.

## 2. Decisions

- **D1 — Scope is the whole of English Studio.** Every learner-facing surface of the studio,
  including the homepage that leads with it. Mapdown, Posts and `/about` are out (§4).
- **D2 — One URL per page; the locale comes from a cookie, negotiated from `Accept-Language` on
  a first visit, with an explicit switcher.** No `/zh` route prefix, no redirect.
- **D3 — Feedback language follows the interface by default, and Dictation gains Chinese.** The
  existing per-learner setting survives as an explicit override.
- **D4 — Simplified Chinese only.** `zh-TW` / `zh-HK` negotiate to the same catalogue. Traditional
  Chinese is a later decision, not a silent omission (§8).
- **D5 — Nothing stored is retranslated.** Feedback already in the database renders in the
  language it was written in. No migration, no schema change.

D4 and D5 are recommendations the owner has not separately confirmed; they are cheap to reverse
before implementation and expensive after, so they are stated here rather than assumed silently.

## 3. Mechanism

### 3.1 Locale negotiation

A pure module, `apps/web/app/i18n/locale.ts`:

```
resolveLocale({ cookie, acceptLanguage }) -> "en" | "zh"
```

Precedence is fixed: a valid cookie wins; otherwise the highest-weighted `Accept-Language` tag
that matches `zh*` before any `en*` tag wins; otherwise `en`. `zh`, `zh-CN`, `zh-Hans`, `zh-SG`,
`zh-TW`, `zh-HK` all resolve to `zh` (D4). Unknown or malformed headers resolve to `en` rather
than throwing — a bad header must never fail a page.

The negotiation is pure and unit-tested because it is the one piece whose failure is invisible:
a wrong locale renders a perfectly valid page in the wrong language.

### 3.2 Cookie and switcher

`bcailab_locale`, `Path=/`, `Max-Age` one year, `SameSite=Lax`, `HttpOnly`. It carries no
personal data and never gates access.

The switcher is a form posting to a `POST /locale` resource route, which sets the cookie and
redirects back to the submitted path. Consequences of that shape: it works without JavaScript,
it cannot be set by third-party script, and switching is a normal navigation rather than a
client-side re-render. A post whose `Origin` names another host is ignored, so a foreign page
cannot change a visitor's language. The comparison is against the `Host` header, not
`request.url`: Remix's Vite dev adapter builds the request URL *from* `Origin`, which made any
origin look like our own during implementation.

**No automatic redirect.** The negotiated locale changes the rendered language of the same URL;
it never moves the visitor to a different URL. A visitor who switches to English stays in
English, because the cookie now outranks the header.

### 3.3 Catalogues

`apps/web/app/i18n/messages/en.ts` and `zh.ts`. `en.ts` is the source of truth for keys, and
`zh.ts` is typed as `Record<keyof typeof en, string>`, so **a missing Chinese string is a
type error, not a runtime fallback to English**. There is no silent-fallback path to hide an
untranslated screen behind.

Interpolation is `{name}` placeholders resolved by a small local helper. Counts use explicit
keys (`dictation.replayOne` / `dictation.replayMany`) rather than an ICU dependency: English
needs two forms, Chinese needs one, and two forms is the whole requirement. A test asserts every
Chinese message uses exactly the placeholders its English source does, because a translation
that drops `{count}` renders a sentence with the number silently missing. Where word order puts
an element (a `<strong>` name) in a different place, `RichMessage` substitutes React nodes for
placeholders.

Both catalogues are statically imported and selected at render time. At two locales and this
volume the bundle cost is smaller than the complexity of splitting them, and it keeps client
navigation free of a catalogue fetch. Revisit if a third locale appears.

### 3.4 Rendering

- The root loader resolves the locale and returns it. `Document` renders `<html lang={locale}>`,
  falling back to `en` when loader data is unavailable (the error boundary renders the same
  component).
- A `LocaleProvider` wraps the document body — header, outlet and footer — and exposes `useT()`.
  It is deliberately **not** folded into the existing `<Outlet context={{ user }} />`, because
  that type is consumed by many routes and widening it would touch every one of them for no
  benefit.
- Loaders and actions that return learner-facing text (validation and quota errors) word it with
  `getRequestTranslator(request)`. Loaders otherwise return structured data and let the page
  word it, so nothing server-built is stuck in one language.
- Route `meta` exports read the locale from the root match and pick a localized title and
  description through one helper, so page titles and search snippets are translated too.
- Server-rendered in the negotiated language. There is no client-side language swap after
  hydration and therefore no flash of English.

### 3.5 Caching

Because one URL serves two languages, any HTML caching must vary on the cookie. Remix documents
on Pages Functions are not cached by default, and on top of that every document response
(`entry.server.tsx`) and the root loader's data response send `Vary: Cookie, Accept-Language`,
so a cache that does sit in between keys on what decides the language. Static assets are
unaffected.

## 4. Coverage

**Translated** — the English Studio surface:

- Homepage (`_index`), studio landing (`english`), Home (`english_.home`), Progress
  (`english_.progress`).
- Dictation: library, session, summary, feedback panel, quota gate.
- Reading: library, passage, attempt and evaluation views, settings, progress, trial.
- Writing: library, prompt pages, session, rounds, dashboard, sessions, settings, progress, trial.
- Translate, including the saved-translation workspaces; Speech, including history and settings.
- Shared chrome: `Header`, `StudioShell`, the nav rails, `StudioPage`, the error boundary, the
  login popup's own copy, `login` / `logout` / `profile`.
- Every page title and meta description on the routes above; form validation and error strings;
  empty states; `aria-label`s and other assistive text.

**Not translated, deliberately:**

- **Learning material.** Passages, sentences, writing prompts, their titles and TTS audio stay
  English. It is the thing being learned.
- **Model output other than feedback.** Translate's translations are the product of the user's
  own request.
- **Mapdown** (a separate app with its own copy and build), **Posts** (internal), **`/about`**
  (the lab's own page), and the OAuth bridge documents, which are machinery a visitor sees for
  under a second.
- **Legacy redirect routes** (`/esl/*`, `/text/*`, `/tts/*`) carry no copy — they are loaders
  that redirect.

## 5. Feedback language

Today the preference is a two-value `localStorage` key read by Reading and Writing, defaulting
to English and reachable only from inside those two tools' settings pages. After this work:

- The setting becomes three-valued: **follow the interface** (new default), English, Chinese.
- An existing explicit `en` or `zh` value migrates to an explicit override, not to "follow".
  Someone who has already chosen must not have that choice silently changed — the existing
  migration helper in `feedback-language.ts` establishes the pattern.
  **As built (stage 3):** a stored `zh` stays explicit, but a stored `en` becomes "follow". The
  earlier code wrote `en` on first read whenever nothing was stored, so an `en` is as likely a
  default as a choice, and keeping it explicit would pin every earlier visitor to English feedback
  in the Chinese interface. The only person this misreads chose English feedback *and* uses the
  Chinese interface, which did not exist when those values were written; the setting shows the
  new state and one click restores English. The preference moved to a new key so that every value
  under it is known to be a choice. This departs from the letter of acceptance criterion (g) and
  is reported to the owner.
- **Dictation feedback gains the same language directive** as the other two graders, passed with
  the completing request and used by `dictation-feedback.server.ts`. The learner brief that
  `learner-context.ts` renders into the prompt stays English and stays untouched: it is context
  for the model, not learner-facing text, and it belongs to the open "Learner context for
  graders" item.
- Trial paths honour the same preference, as Reading's and Writing's trials already do.
- Dictation feedback remains **signed-in only**. A signed-out Chinese visitor therefore still
  finishes a dictation with no explanation of why anything was wrong. That is a known hole in the
  entry path, recorded in §8 rather than fixed here.

## 6. Chinese typography

The visual system is Latin-editorial and parts of it do not survive translation:

- **Mono labels.** Kickers, badges and section labels use `--font-mono` with
  `text-transform: uppercase` and positive `letter-spacing`. Uppercasing is a no-op on Chinese,
  the letter-spacing reads as broken spacing, and `--font-mono` has no CJK fallback at all. These
  styles need a locale-aware variant.
- **Italics.** The homepage hero sets a phrase in `<em>`. Synthesised oblique Chinese is a
  typographic error, not an emphasis. Chinese emphasis needs a different device.
- **Line height and length.** Chinese at the same size reads denser; headline and body
  `line-height` and any width caps expressed in `ch` need checking.
- **Fit.** Chinese labels are usually shorter than their English source and headlines longer
  once wrapped. Buttons, cards, rails and the mobile drawer need a pass at both widths.
- **Fonts stay as they are.** No CJK webfont is added — a Chinese webfont is megabytes, and the
  existing serif fallbacks are adequate. `--font-mono` gains a CJK fallback.

Whatever is settled here is written into `docs/design-system.md` in the same change, because it
becomes a rule for every future surface, not a one-off fix.

## 7. Phasing

Three independently shippable, independently verifiable stages. The order follows what a Chinese
visitor meets first, so the earliest stage is also the most useful one if work stops.

1. **Mechanism and the first-contact path.** Negotiation, cookie, switcher, provider, meta
   helper, typography rules; homepage, `/english`, the header, the login popup, and Dictation end
   to end including the summary.
2. **The remaining practice tools.** Reading, Writing, Translate, Speech, and their trials,
   settings and progress surfaces.
3. **Home, Progress and the feedback language.** The signed-in surfaces, the three-valued
   preference, and Dictation's Chinese feedback.

## 8. Known limitations

- **Search engines will index English.** One URL per page means the crawler sees whatever its own
  `Accept-Language` produces, which is English in practice. This buys simplicity at the cost of
  Chinese organic discovery; moving to `/zh` later is a route restructure, not a setting.
- **No usage evidence.** This item cannot tell anyone whether Chinese learners arrive, return, or
  convert. The product still has no product analytics.
- **The signed-out entry path still has no explanation.** Chinese feedback reaches signed-in
  learners only, because Dictation feedback does. Whether an anonymous visitor's first attempt
  should get one feedback call is a separate, unanswered product decision.
- **Traditional Chinese readers get Simplified.** Negotiating `zh-TW` to Simplified is better
  than English, and worse than the truth.
- **Two languages of copy to maintain.** Every future user-facing string is now two strings. The
  type-level guarantee in §3.3 makes that enforced rather than optional.

## 9. Coverage checklist

Criterion (d) requires the coverage to be checked surface by surface and recorded. Each stage
appends its section; "checked" means the surface was read in Chinese on the dev server, not only
typechecked.

### Stage 1 — mechanism and first contact (2026-09-22)

| Surface | Status |
| --- | --- |
| Document: `<html lang>`, root meta description, footer | Checked |
| Site header: language switch, Sign in, avatar menu (profile, theme, log out), `/english` breadcrumb | Checked signed out; signed-in menu strings translated but not seen |
| Error boundary (404 and generic) | Translated; not triggered in the browser |
| Homepage `/`: hero, access line, module grid, other projects, lab | Checked, desktop and 375 px |
| `/english`: hero, tagline, module list with detail and tags, account note | Checked |
| Studio rail: module links, Home/Progress, group labels, collapse, mobile drawer, switch, sign-in row | Checked expanded, collapsed and as a 375 px drawer; signed-in account menu translated but not seen |
| Dictation library: header, bands, rows, empty state | Checked; "Recent practice" is signed-in only — translated but not seen |
| Dictation session: controls, answer label and placeholder, check result, progress | Checked through a full 11-sentence passage |
| Dictation summary: score, per-sentence rows, blank answers, sign-in prompt | Checked signed out; the coach-feedback panel and the Reading handoff are signed-in only — translated but not seen |
| Dictation quota gate and action errors | Translated, worded server-side per request; not triggered |
| Sign-in popup `/login`: every mode, validation and code errors | Checked the default mode in dark theme; code/password/reset modes translated but not walked |

**Deliberately English on a Chinese page:** passage titles, topics and sentences, the learner's
answer, the reference and diff tokens (all `lang="en"`); coach feedback patterns (stage 3);
product and brand names; a status text or message body a server sends with an error.

**Known gaps left for later stages:** the sign-in *email* (subject and body) is still English;
Reading, Writing, Translate, Speech, Home and Progress still render English inside the now
Chinese rail — stage 2 and stage 3 translate them.

### Stage 2 — the remaining tools (2026-09-22)

Checked signed in on the isolated fixture (`pnpm test:browser:fixture`: in-memory D1, synthetic
users, fake model) with an in-page detector that lists visible text and assistive labels with
English words outside `lang="en"` regions, and signed out over HTTP for the trials.

| Surface | Status |
| --- | --- |
| Translate: page, saved list, saved detail, language names, request/stream/save errors | Checked; the saved detail's delete dialog translated but not opened |
| Speech: generate, history, settings, voice genders, validation errors | Checked; the fixture has no TTS credentials, so only the voice-list error state was seen (its provider message is shown as sent) |
| Reading: catalogue, own texts, new passage, passage page, recorder, progress, settings | Checked; evaluation card, highlight kinds and retry states translated but not seen (no evaluated attempt in the fixture) |
| Reading trial | Checked signed out over HTTP |
| Writing: hub, three libraries, new session with the writing guide open, assignment page, sessions, progress, settings, a session with a failed round | Checked, including 375 px |
| Writing feedback panel (annotations, delta, counts, band label) | Translated and unit-tested through `writing-agent-copy`; the fixture's synthetic feedback has no annotations, so the full panel was not seen |
| Writing trial | Checked signed out over HTTP |
| Profile | Checked |
| Shared: confirm dialog, progress tabs, breadcrumbs, audio player, dates | Checked where they appear above |

The English interface was re-checked over HTTP on the same eighteen routes: no Chinese appears
beyond the switch and the pre-existing 日本語 autonym, and every page title is unchanged.

**Found and fixed during the check:** dates rendered in the browser's language ("Sep 22, 2026")
on a Chinese page — `LocalDateTime` now formats with the interface language; a "Back to Reading"
link split across lines had escaped the source scan; assignment titles in breadcrumbs and the
topic inside the assignment description were not marked `lang="en"`.

**Deliberately English:** assignment titles, prompt text, topics, task material and chart data;
passage titles and text; every model output (Reading evaluation, Writing feedback text, the
assessment value itself); Speech language autonyms and voice names; the email address.

**Left for stage 3 or later:** Home and Progress overview; the three-valued feedback language
setting (Reading and Writing settings still show the two-value control, now in Chinese);
Dictation's Chinese feedback; the sign-in email; the fallback title "Passage" shown only when a
practised passage has since been removed; `WritingRevisionRail`, which nothing renders and so was
not translated.

### Stage 3 — signed-in surfaces and feedback language (2026-09-22)

Checked on the isolated fixture as three synthetic learners — one with a recommendation, one with
history and a resumable dictation, one cold — with the same in-page detector.

| Surface | Status |
| --- | --- |
| Home: header, greeting, cold start, level picker, Continue (dictation and writing), coach recommendation with its reason and swaps, basis line, recent practice | Checked in all three states; the only flagged text is the synthetic users' names |
| Progress overview: level, attempts, basis note, coverage, empty state, keep-going links | Checked with and without data; the accuracy trend and feature-mastery lists are translated but were not populated in the fixture |
| Feedback language setting on Reading and Writing settings | Checked: three options, the pressed state follows the choice |
| Migration of earlier preferences | Checked in the browser: an earlier `en` becomes Follow interface and the old key is removed; an earlier Writing `zh` stays Chinese |
| What forms post | Checked: Reading posts `zh` under Follow in the Chinese interface; Writing posts `en` after choosing English; Dictation's completing request posts `zh` |
| Dictation feedback in Chinese | Prompt proven by fixtures (English byte-identical to the pre-change prompt; Chinese adds only the directive). The fixture's fake model returns no patterns, so a Chinese feedback panel was not seen |

**Known gaps after all three stages:** the sign-in email; the "Passage" fallback title; Writing
feedback text and Reading evaluation text written before this change stay in the language they
were written in; a learner's typed Writing text is never translated.

