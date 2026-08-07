# Theme and Visual Token Specification

## 1. Purpose

Themes provide coherent document-level appearance without introducing arbitrary per-node formatting.

A theme is a structured token set, not a loose stylesheet. Theme tokens must cover screen rendering and export consistently.

## 2. Theme principles

1. Content remains legible without manual adjustment.
2. Theme changes do not modify hierarchy or text.
3. Selection, hover, focus, and editing remain distinguishable in every theme.
4. Branch colors remain accessible and do not carry semantic meaning alone.
5. Themes should be visually distinct, not minor color variants.
6. Layout metrics may differ modestly but should not radically change map structure.
7. Export uses the same tokens as the editor, excluding interaction state.

## 3. Theme schema

Conceptual schema:

```ts
interface ShapeTokens {
  id: string;
  name: string;
  appearance: 'light' | 'dark';
  canvas: CanvasTokens;
  typography: TypographyTokens;
  nodes: NodeLevelTokens;
  connectors: ConnectorTokens;
  controls: ControlTokens;
  interaction: InteractionTokens;
  layout: ThemeLayoutTokens;
  defaultPaletteId: string;
}

interface PaletteTokens {
  id: string;
  name: string;
  description: string;
  entries: Array<{ fill: string; text: string }>;
}

/** One shape + one palette, resolved for rendering and export (D-24). */
interface MindMapTheme extends Omit<ShapeTokens, 'defaultPaletteId'> {
  branches: PaletteTokens;
}
```

The theme is two orthogonal axes, both persisted in Markdown front matter (`shape:` /
`palette:`). A shape is the shape language + canvas appearance + role base tokens + type
scale; a palette is the branch colour band. `presets.ts` resolves the pair into the
`MindMapTheme` the renderer, exporter and editing overlay share.

## 4. Canvas tokens

```ts
interface CanvasTokens {
  background: string;
  subtleGrid?: string;
  exportBackground: string;
  selectionMarquee?: string;
}
```

MVP SHOULD use a flat background. Grid/dot patterns are optional and MUST be excluded or controllable in export.

## 5. Typography tokens

```ts
interface TypographyTokens {
  fontFamily: string;
  rootFontSize: number;
  rootFontWeight: number;
  level1FontSize: number;
  level1FontWeight: number;
  nodeFontSize: number;
  nodeFontWeight: number;
  lineHeight: number;
  letterSpacing?: number;
}
```

Requirements:

- support Chinese and Latin glyphs;
- prefer system fonts to avoid network dependency and export mismatch;
- preserve legibility at common zoom levels;
- avoid extremely light weights;
- font fallback must have compatible metrics where possible.

Recommended system stack concept:

```text
-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
"Hiragino Sans GB", "Microsoft YaHei", sans-serif
```

The final implementation may adapt per platform.

## 6. Node tokens

Node styles are defined by role rather than arbitrary depth for most levels.

```ts
interface NodeStyleTokens {
  background: string;
  text: string;
  border: string;
  borderWidth: number;
  borderStyle: 'solid' | 'none';
  radius: number;
  shadow: string;
  paddingX: number;
  paddingY: number;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
}

interface NodeLevelTokens {
  root: NodeStyleTokens;
  level1: NodeStyleTokens;
  default: NodeStyleTokens;
  emptyPlaceholderText: string;
}
```

MVP SHOULD distinguish root, first-level nodes, and deeper nodes. It SHOULD NOT require unique styling for every depth.

The type hierarchy is fixed at exactly three tiers: root > first level > every deeper node.
Node type size MUST NOT keep decreasing with depth beyond the default tier (depth is
unbounded, so a per-depth step makes deep outlines unreadable), and the smallest tier MUST
stay legible for CJK at common zoom levels — the shipped presets floor it at 13px (D-21).

## 7. Connector tokens

```ts
interface ConnectorTokens {
  width: number;
  opacity: number;
  rootWidth?: number;
  curveTension: number;
  defaultColor: string;
}
```

Requirements:

- visible against canvas background;
- not visually heavier than node labels;
- remain clear at 50% zoom;
- branch-color inheritance supported;
- disabled/hidden connectors are not represented through low contrast alone.

## 8. Branch palette

```ts
interface PaletteEntry {
  /** The fill colour for a first-level branch in by-first-level-branch mode. */
  fill: string;
  /** The designed text colour on that fill — authored data, never computed at runtime. */
  text: string;
}

interface PaletteTokens {
  id: string;
  name: string;
  /** One-line personality (cool/warm/high-saturation/monochrome...), for the picker. */
  description: string;
  entries: PaletteEntry[];
}
```

### 8.0 The theme is a shape × palette pair (D-24)

Step 3 splits the single theme id into two orthogonal fields. Both are written into the
Markdown front matter (`shape:` / `palette:`), and a document written with the legacy single
`theme:` key still opens: it maps onto `(shape: X, palette: X's default palette)` and renders
with the same tokens as today. The picker presents the two axes separately — a shape group and
a palette group — never a shape × palette product list.

### 8.1 Assignment

Colors are assigned deterministically by first-level semantic order, not by current left/right visual partition.

Therefore moving a branch from left to right does not change its color.

### 8.2 Palette size

A palette SHOULD include 6–10 distinguishable designed pairs. After exhaustion, fills repeat cyclically.

Repeated colors are acceptable because colors are decorative and not unique identifiers.

### 8.3 Text colour is designed data, not a runtime computation

In `by-first-level-branch` mode the branch fill drives the first-level node **fill** and its
**authored text colour**. Three contracts follow:

1. **Every `{ fill, text }` pair clears WCAG AA 4.5:1** — asserted for every entry in every
   palette by `theme.test.ts`, so an out-of-range pair fails the build. There is no runtime
   "pick the better of white / near-black" path; that silent degradation is exactly what let
   the old Minimal Light palette (all six colours inside the 3.67–4.85 luminance band) flip
   text black/white per branch in the same map.
2. **One text colour per palette.** All entries in a palette share a single text colour so a
   map reads as one object rather than a patchwork. This is also asserted, not left to
   authors' discipline.
3. **Branch colour fills only the first level (XMind model, D-24).** Deeper nodes return to
   the role base tokens; only the connector carries the branch colour below the first level.
   Hierarchy below level 1 is expressed by the shape layer (finer borders, paler ground).
   There is no descendant fill tint, because blending a fill would break the authored
   `{ fill, text }` pair.

Branch colours must remain distinguishable from the canvas, node base borders, and the
selection ring (C-01).

## 9. Interaction tokens

```ts
interface InteractionTokens {
  hoverOutline: string;
  selectedOutline: string;
  selectedOutlineWidth: number;
  keyboardFocusRing: string;
  editingOutline: string;
  dropIndicator: string;
  invalidDropIndicator: string;
  dragPreviewBackground: string;
  modalBackdrop: string;
}
```

Requirements:

- selection does not rely solely on fill color;
- keyboard focus ring is visible and meets accessibility contrast expectations;
- invalid drop differs through shape/icon/pattern as well as color where possible;
- interaction outlines do not alter node box dimensions;
- interaction tokens are excluded from normal image export;
- the editing control overlays the node it is editing: its fill and text MUST come from the
  covered node's role tokens (`background` / `text`), its corner radius from the same tokens'
  `radius`, and its typography from the same role (`theme.md` §5), so a node looks identical
  while being edited; the editing highlight ring is the only element drawn with
  `editingOutline`, and it is rendered outside the node box so node dimensions never change.

## 10. Collapse-control tokens

```ts
interface ControlTokens {
  collapseBackground: string;
  collapseText: string;
  collapseBorder: string;
  collapseHoverBackground: string;
  collapseSize: number;
  collapseFontSize: number;
}
```

The collapsed count badge must remain readable for two-digit direct-child counts. For very large counts, it MAY use compact text such as `99+`, while the accessible label states the exact count.

### 10.1 Toolbar tokens are not theme tokens

Application chrome — the toolbar, dialogs, Help centre, status area and menus — MUST NOT be styled from `MindMapTheme`.

A document theme is a property of the document: it is written into Markdown front matter, it travels with the file, and its values appear in every export. Application chrome is a workspace preference that never leaves the browser and is excluded from every export. A document theme that could restyle the toolbar would mean that exporting a Business-themed map implied something about the application frame, which is meaningless.

The collapse tokens above stay in the theme because the collapsed count badge is part of the map and is **required to appear in exported images** (`storage-export.md` §12.2).

Chrome tokens are owned by the implementation, outside the theme schema. See `../design-tokens.md`.

> **Amendment (2026-08-01).** This section previously declared `toolbarBackground`, `toolbarText` and `toolbarBorder` inside `ControlTokens`. They were removed and this rule added; see `../decisions.md` D-08.

## 11. Layout-related theme tokens

```ts
interface ThemeLayoutTokens {
  rootToFirstLevelGap: number;
  parentChildGap: number;
  siblingGap: number;
  subtreeGap: number;
  canvasPadding: number;
}
```

Themes may adjust density, but MVP presets SHOULD stay within a consistent ergonomic range. A theme should not make a 50-node document twice as large as another without explicit density controls.

## 12. Required shapes and palettes

The four required shapes ship by default, each with a `defaultPaletteId` (the palette a legacy
single-`themeId` document maps to). Ten palettes ship by default and may be paired with any
shape; the palette list is plain data, so adding one is a data change, not a code change
(D-24).

### 12.1 Minimal Light

Shape intent:

- content-first;
- neutral white/light canvas;
- restrained gray borders/connectors;
- subtle or no shadows;
- one accent for selection;
- suitable for study and printing.

Visual characteristics:

- root: dark text with stronger border/fill;
- level 1: lightly filled or underlined;
- deeper nodes: white/transparent with fine border;
- hairline-outlined rounded cards (the reference shape, D-22);
- default palette **Slate** — muted cool greys, deliberately darkened so every fill carries
  white text at AA (the old #6b7280 family sat in the 3.67–4.85 luminance band where neither
  white nor near-black cleared 4.5:1, flipping text per branch at runtime — that palette was
  replaced in D-24).

### 12.2 Soft Branch Colors

Shape intent:

- friendly and immediately recognizable as a mind map;
- each first-level branch receives a soft distinct color;
- descendants inherit connector colour only (D-24 XMind model);
- node fills remain pale to preserve text contrast;
- large-radius, soft-bordered, roomier cards (D-22);
- default palette **Soft Spectrum** — warm pastel midtones with near-black text.

### 12.3 Business

Shape intent:

- formal reports and product planning;
- restrained blue/gray palette;
- rectangular or moderately rounded nodes;
- minimal shadow;
- uniform connector color or limited branch hues;
- good export on white background;
- squared, heavier-border, denser cards (D-22);
- default palette **Corporate** — restrained blue-grey with white text.

### 12.4 Dark

Shape intent:

- comfortable dark-environment editing;
- dark neutral canvas;
- elevated node surfaces;
- bright but controlled branch colors;
- high-contrast selection/focus;
- exports can use dark background or optional transparent background;
- medium-radius, subtle-border cards on a dark canvas (D-22);
- default palette **Night Glow** — bright saturated spectrum with near-black text.

### 12.5 The ten shipped palettes

Each palette is named and has a personality, and every entry is an authored `{ fill, text }`
pair (see §8.3):

| Palette | Personality | Text |
|---|---|---|
| Slate | muted cool greys, quiet and content-first | white |
| Soft Spectrum | friendly warm pastel midtones | near-black |
| Corporate | restrained blue-grey for formal maps | white |
| Night Glow | bright saturated spectrum for dark canvases | near-black |
| Ember | warm ramp from burnt orange to rose | near-black |
| Glacier | deep cool blues and teals | white |
| Forest | deep greens for natural themes | white |
| Mono | grayscale gradient, prints cleanly | white |
| Vivid | high-saturation rainbow | white |
| Earth | ochre, clay and moss | white |

## 13. Border-style presets

The original product concept includes line colors and border styles. MVP exposes them through themes rather than independent controls.

Allowed preset variation:

- rounded filled cards;
- outlined rounded cards;
- minimal underline/branch-label style;
- moderately squared business cards.

A theme MUST use one coherent border language across the map, with root/level distinctions allowed.

The four shipped shapes map onto the allowed languages as follows (D-22): Minimal Light is
the hairline-outlined rounded-card reference; Soft Branch Colors is the large-radius,
soft-bordered, roomier card; Business is the moderately squared, heavier-border, denser card;
Dark is the medium-radius, subtle-border card on a dark canvas. Radius, border weight and
padding density may each vary per role, and every preset must stay distinguishable from every
other in a grayscale screenshot — asserted as a shape signature in `theme.test.ts`.

## 14. Theme selector behavior

The toolbar Style menu presents the two axes separately (D-24): a **Shape** group and a
**Palette** group, each with names and previews — a canvas swatch for a shape, a strip of its
designed fills for a palette. It SHOULD:

- show theme names and small previews;
- apply preview immediately on hover only if it can revert safely, otherwise on click;
- keep the selected node and viewport context;
- create one undoable presentation command per axis (`SetShape` / `SetPalette`);
- autosave the chosen selection;
- announce the chosen shape or palette accessibly.

## 15. User customization scope

MVP supports:

- selecting a preset theme;
- selecting layout mode separately;
- optional branch-color mode if included in UI.

MVP excludes:

- per-node styles;
- custom color picker;
- custom font upload;
- arbitrary CSS;
- per-depth manual formatting;
- custom connector routing;
- independent border controls.

Future customization should extend tokens, not bypass them.

## 16. Color-scheme behavior

The app MAY default to system appearance on first launch but document theme is explicit and persistent.

Switching the surrounding application chrome between light/dark MUST not silently change the document theme unless the theme is explicitly “System Adaptive.”

A future adaptive theme must define both light and dark token sets and export behavior.

## 17. Export behavior

### 17.1 SVG

SVG export SHOULD use:

- explicit fill/stroke values;
- system font family list;
- text rendered as text, not paths, unless an optional outline mode is added;
- theme canvas background rectangle unless transparent export selected;
- branch colors and connector widths exactly from theme tokens.

### 17.2 PNG

PNG rasterization uses the same theme and layout at requested scale.

Shadows must not be clipped; export bounds include their visual extent.

### 17.3 Printing

Minimal Light and Business SHOULD remain legible when printed. Soft branch colors should retain structure in grayscale through geometry and borders, not color alone.

## 18. Accessibility requirements

- Normal text should target WCAG AA contrast against node background.
- Large root text should remain clearly legible.
- Focus indicators should have at least a clearly perceptible contrast difference.
- Branch colors are decorative; hierarchy is conveyed by position and connectors.
- Palette text colour is designed data, not a runtime pick: every authored `{ fill, text }`
  pair clears AA 4.5:1 and one text colour is shared across each palette (§8.3).
- Dark theme avoids pure black/white extremes where they create glare, while preserving contrast.
- Theme previews include names, not color swatches only.

## 19. Theme validation

Each theme MUST pass:

1. root/level/deeper text contrast checks;
2. every palette entry's authored `{ fill, text }` pair ≥ 4.5:1, with one text colour per
   palette (build-time assertion, D-24);
3. selection and focus visibility on every node role;
4. collapse badge readability;
5. connector visibility on canvas;
6. long-label wrapping;
7. Chinese glyph availability;
8. SVG export visual regression;
9. PNG export at 1× and 2×;
10. grayscale structural legibility;
11. reduced-motion interaction independence.
