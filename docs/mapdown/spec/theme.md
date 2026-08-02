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
interface MindMapTheme {
  id: string;
  name: string;
  appearance: 'light' | 'dark';
  canvas: CanvasTokens;
  typography: TypographyTokens;
  nodes: NodeLevelTokens;
  connectors: ConnectorTokens;
  branches: BranchPaletteTokens;
  controls: ControlTokens;
  interaction: InteractionTokens;
  layout: ThemeLayoutTokens;
}
```

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
interface BranchPaletteTokens {
  colors: string[];
  assignment: 'cyclic-by-semantic-first-level-order';
  descendantTintPolicy: 'same' | 'same-with-opacity';
}
```

### 8.1 Assignment

Colors are assigned deterministically by first-level semantic order, not by current left/right visual partition.

Therefore moving a branch from left to right does not change its color.

### 8.2 Palette size

A palette SHOULD include 6–10 distinguishable colors. After exhaustion, colors repeat cyclically.

Repeated colors are acceptable because colors are decorative and not unique identifiers.

### 8.3 Contrast

Branch colors must remain distinguishable from the canvas and node borders.

For text, the theme should use high-contrast text colors rather than placing arbitrary saturated branch colors behind text unless contrast is guaranteed.

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
- interaction tokens are excluded from normal image export.

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

## 12. Required presets

### 12.1 Minimal Light

Intent:

- content-first;
- neutral white/light canvas;
- restrained gray borders/connectors;
- subtle or no shadows;
- one accent for selection;
- suitable for study and printing.

Suggested visual characteristics:

- root: dark text with stronger border/fill;
- level 1: lightly filled or underlined;
- deeper nodes: white/transparent with fine border;
- branch colors optional or muted.

### 12.2 Soft Branch Colors

Intent:

- friendly and immediately recognizable as a mind map;
- each first-level branch receives a soft distinct color;
- descendants inherit connector color;
- node fills remain pale to preserve text contrast.

### 12.3 Business

Intent:

- formal reports and product planning;
- restrained blue/gray palette;
- rectangular or moderately rounded nodes;
- minimal shadow;
- uniform connector color or limited branch hues;
- good export on white background.

### 12.4 Dark

Intent:

- comfortable dark-environment editing;
- dark neutral canvas;
- elevated node surfaces;
- bright but controlled branch colors;
- high-contrast selection/focus;
- exports can use dark background or optional transparent background.

## 13. Border-style presets

The original product concept includes line colors and border styles. MVP exposes them through themes rather than independent controls.

Allowed preset variation:

- rounded filled cards;
- outlined rounded cards;
- minimal underline/branch-label style;
- moderately squared business cards.

A theme MUST use one coherent border language across the map, with root/level distinctions allowed.

## 14. Theme selector behavior

The toolbar theme selector SHOULD:

- show theme names and small previews;
- apply preview immediately on hover only if it can revert safely, otherwise on click;
- keep the selected node and viewport context;
- create one undoable presentation command;
- autosave the chosen theme;
- announce the chosen theme accessibly.

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
- Dark theme avoids pure black/white extremes where they create glare, while preserving contrast.
- Theme previews include names, not color swatches only.

## 19. Theme validation

Each theme MUST pass:

1. root/level/deeper text contrast checks;
2. selection and focus visibility on every node role;
3. collapse badge readability;
4. connector visibility on canvas;
5. long-label wrapping;
6. Chinese glyph availability;
7. SVG export visual regression;
8. PNG export at 1× and 2×;
9. grayscale structural legibility;
10. reduced-motion interaction independence.
