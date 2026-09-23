# bcailab Design System (Editorial Craft)

This document defines the current visual system for bcailab.

## Design Direction

Style: Editorial Craft (journal + workshop)

- Serif-first typography and restrained color usage
- Square edges and low-noise interaction feedback
- Deep red and copper as accents
- Shared visual language across home and all tool pages

## Theme Policy

Users can choose between `System` (auto), `Light`, and `Dark` modes.

- Preference is stored in `localStorage` under `"bcailab-theme-preference"`
- On page load, a blocking `<script>` in `<head>` reads the stored preference, resolves it (system → media query), and sets `data-themePreference` / `data-resolvedTheme` on `<html>` to prevent FOUC
- Tool pages (which hide the global header) apply the theme via `useThemePreference()` hook
- Settings pages expose a three-button grid (Auto / Light / Dark) for selection

## Typography

Fonts are self-hosted in `apps/web/public/fonts`.

- Display: `Playfair Display`
- Body: `Source Serif 4`
- Mono/meta: `DM Mono`

Fallbacks:

- serif: Georgia, Noto Serif SC, Songti SC, serif
- mono: Menlo, Consolas, PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans SC, monospace
  (DM Mono has no CJK glyphs; Chinese labels fall back to a Chinese sans, not to the platform's
  arbitrary "monospace")

No CJK webfont is shipped. A Chinese webfont is megabytes; the system fallbacks above are the
Chinese type.

### Chinese interface

The interface renders in English or Simplified Chinese on the same URL
([ADR 0011](decisions/0011-chinese-ui-same-url-feedback-follows-interface.md)). The visual system
is Latin-editorial, and three of its habits do not survive translation. The rules below live at
the end of `global.css`, keyed on `:lang(zh)`, and bind every surface — new components inherit
them rather than restating them:

- **Chinese is set solid.** Letter-spacing is tuned for Latin type (tracked uppercase labels,
  tightened display headlines); every element whose own language is Chinese resets it to
  `normal`. Uppercasing is a no-op on Chinese and needs no rule.
- **Chinese has no italic.** Every Chinese element renders `font-style: normal`, whether the
  italic came from `<em>` or a class. Emphasis in the chrome must therefore carry colour or
  weight, never slant alone.
- **Headings get more leading** (`h1`–`h3` at 1.35) and short paragraphs use
  `text-wrap: pretty`, which removes the one-character last line that is Chinese's widow.

**Mark English material with `lang="en"`.** Passage titles and topics, sentences, a learner's
typed answer, reference text and diff tokens stay English in the Chinese interface, because they
are what is being learned. Marking them keeps the Latin rules above (their italics and tracking),
and lets a screen reader pronounce them as English inside a Chinese page. Interface copy is never
written inline: it comes from the catalogues in `apps/web/app/i18n/messages/`.

**Dates follow the interface.** `LocalDateTime` formats with `zh-CN` in the Chinese interface
and with the browser's own conventions in the English one, so a Chinese page never shows
"Sep 22, 2026".

The language switch names the other language in that language ("中文" / "English") so it is
findable by someone who cannot read the current one. It sits beside Sign in on the public site
header only. Inside English Studio the interface language is set on `/settings`, reached from the
account menu, and the rail carries no language control: the choice is made once, and
`Accept-Language` has usually made it already (owner decision, 2026-09-22).

## Color Tokens

Colour is assigned by meaning, not by a pigment name. Components must consume these
semantic contracts rather than hard-coded status colours:

| Meaning | Light | Dark | Use |
|---|---|---|---|
| `--color-brand` | `#b52a1c` | `#d85a3f` | Product identity only |
| `--color-action` | `#b52a1c` | `#d85a3f` | Primary actions, active navigation, links and focus |
| `--color-danger` | `#9f2735` | `#f07685` | Errors, destructive actions, failed/critical states |
| `--color-warning` | `#80551f` | `#d6a354` | Caution, pending work and approaching limits |
| `--color-success` | `#39724f` | `#71b48a` | Completed, resolved, playing and positive movement |

Action and feedback families also provide `-hover`, `-surface` and `-border` variants
where the state needs a filled control or a quiet container. `--color-on-action` is the
foreground for a solid action. Brand and action intentionally share a hue today, but they
are separate tokens so product identity can change without rewriting interaction states.

Rules:

- Never use `--color-action` to render an error or destructive affordance.
- Never use `--color-danger` merely for emphasis or branding.
- Use the matching `-surface` and `-border` tokens instead of hand-authored translucent
  versions of a state colour.
- Copper remains a decorative/material accent, not a feedback state.

Neutral light-mode tokens:

- `--bg: #f6f2eb`
- `--bg-alt: #eee8dd`
- `--bg-card: #f6f2eb`
- `--bg-card-hover: rgba(181,42,28,0.03)`
- `--text: #2a2420`
- `--text-muted: #6d645c`
- `--text-faint: #70665c`
- `--border: #d8d0c4`

Neutral dark-mode tokens:

- `--bg: #0f0e0c`
- `--bg-alt: #1a1917`
- `--bg-card: #1a1917`
- `--bg-card-hover: #201f1c`
- `--text: #e8e2d8`
- `--text-muted: #b5ad9f`
- `--text-faint: #a59d90`
- `--border: rgba(232,226,216,0.08)`

Readability roles (iteration 6):

- `--text-muted` is necessary supporting copy; `--text-faint` is lower-emphasis labels and
  placeholders, not permission to render unreadable information. Both clear 4.5:1 against
  the page, alternate and card backgrounds in light, automatic-dark and explicit-dark modes.
- `--border` remains a decorative separator. Writing/Dictation inputs and the Writing coach
  selector use `--border-control`; check its alpha-composited dark value against both sides.
- Studio keyboard focus uses a 2px `--text` outline with a 3px gap; forced colors uses
  the system Highlight color. Keep the gap so filled action colors do not touch the outline.
- Preserve native disabled semantics; disabled controls are not a model for normal text contrast.
  Token-pair tests are a regression guard, not a complete accessibility audit.

Dark extras:

- low-opacity grain overlay
- copper gradient center divider for home hero

## Spacing

Core spacing tokens:

- `--space-xs: 4px`
- `--space-sm: 8px`
- `--space-md: 16px`
- `--space-lg: 24px`
- `--space-xl: 32px`
- `--space-2xl: 48px`
- `--space-3xl: 64px`
- `--space-4xl: 80px`

## Layout Rules

- Main container: centered, responsive fixed-max width (`--container-width: 1400px`).
  Studio page widths use `standard` / `wide` / `workspace` tokens (780 / 1120 / 1400px);
  [global.css](../apps/web/app/styles/global.css) owns the actual values. See
  [Studio shell](studio-app-shell.md) for the page-frame contract.
- Home: two-column hero on desktop, single-column <= 768px
- Footer: reserved for the landing/about pages; tool surfaces do not render the global footer
- Tool pages: same typography and card/field primitives

### Tool Shell Pattern

Tool pages (Writing, Reading, Speech) use a full-viewport shell that hides the global header and footer. The shell follows a three-zone layout:

```
┌─────────────────────────────────────────────────────┐
│ .tool-body (100dvh, overflow: hidden)               │
│ ┌──────────┬────────────────────────────────────────┐│
│ │ Nav Rail │ .tool-main                             ││
│ │ (aside)  │ ┌──────────────────────────────────┐   ││
│ │ 248px    │ │ .canvas (max-width, margin:auto) │   ││
│ │ ↕ 52px   │ │    [route content]               │   ││
│ │          │ │    [optional aside panel]         │   ││
│ │          │ └──────────────────────────────────┘   ││
│ └──────────┴────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

**Key principles:**
- The **canvas** constrains content width and centers it horizontally. Sub-pages may apply narrower inner max-widths (e.g. 720px for editors, 600px for settings).
- The **nav rail** is collapsible (persisted in localStorage). On mobile (<1024px), it renders as a drawer overlay.
- Every rail destination leads with a line icon (`apps/web/app/components/NavRailIcons.tsx`): one
  family, 24-unit grid, 1.5 stroke, round caps, no fills, drawn in `currentColor` so it takes the
  row's muted, hover and current colours. The collapsed rail shows the icon alone. The icons are
  the same in both interface languages. A new rail destination needs an icon from the same family.
- Optional **aside panels** (e.g. revision timeline) sit inside the canvas alongside the main content, not at the shell level.
- The canvas stays centered regardless of nav rail collapse state or screen width.

### Responsive Breakpoints (Tool Pages)

| Breakpoint | Nav Rail | Canvas | Aside Panel |
|------------|---------|--------|-------------|
| < 1024px | Drawer overlay | Full width | Hidden |
| 1024–1279px | Persistent sidebar | Centered, max-width constrained | Compact (if applicable) |
| ≥ 1280px | Persistent sidebar | Centered, max-width constrained | Full width (if applicable) |

## Header and Auth Constraints

Header stays behavior-compatible with current product logic:

- Left: logo + breadcrumb
- Right: the language switch, then Google login button (signed out) OR aligned 36px
  avatar/menu controls (signed in)
- No `about/x/tools` nav links in header

## Component Rules

### Buttons

- Mono uppercase labels
- Square corners
- Primary/ghost/danger variants with subtle lift on hover

### Inputs/Textareas

- Square edges
- Neutral border, accent border on focus
- Body font for content

### Cards

- 1px border, no rounded corners
- Light hover background shift

### Tags and Meta

- DM Mono, uppercase, compact tracking
- Copper-tinted tag borders

### Tool/Post Cards

- Left 3px accent bar appears on hover (`scaleY` reveal)
- Arrow shifts right slightly on hover

## Responsive Breakpoints

- `<= 1024px`: reduced hero spacing
- `<= 768px`: stacked header, one-column home hero, stacked form/list actions
- `<= 480px`: tighter section/card paddings

## Implementation Files

- Global styles: `apps/web/app/styles/global.css`
- Header behavior/UI: `apps/web/app/components/Header.tsx`
- Home page structure: `apps/web/app/routes/_index.tsx`
- Interface copy and locale: `apps/web/app/i18n/` (catalogues in `messages/`)
- Language switch: `apps/web/app/components/LanguageSwitcher.tsx`
- Settings (interface language, feedback language, theme): `apps/web/app/routes/settings.tsx`
