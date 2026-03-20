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
- mono: Menlo, Consolas, monospace

## Color Tokens

Shared accents:

- `--red: #b52a1c`
- `--copper: #c4956a`
- `--copper-dim: rgba(196,149,106,0.15)`

Light mode:

- `--bg: #f6f2eb`
- `--bg-alt: #eee8dd`
- `--bg-card: #f6f2eb`
- `--bg-card-hover: rgba(181,42,28,0.03)`
- `--text: #2a2420`
- `--text-muted: #8a8078`
- `--text-faint: #b0a89e`
- `--accent: #b52a1c`
- `--border: #d8d0c4`

Dark mode:

- `--bg: #0f0e0c`
- `--bg-alt: #1a1917`
- `--bg-card: #1a1917`
- `--bg-card-hover: #201f1c`
- `--text: #e8e2d8`
- `--text-muted: #8a8478`
- `--text-faint: #5a5650`
- `--accent: #c23a22`
- `--border: rgba(232,226,216,0.08)`

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

- Main container: centered, responsive fixed-max width (`--container-width: 1220px`)
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
- Right: Google login button (signed out) OR aligned 36px avatar/menu controls (signed in)
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
