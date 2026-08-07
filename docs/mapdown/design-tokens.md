# Mapdown — Token Layering

Companion to `spec/theme.md`. That document specifies what a **document theme** contains;
this one specifies the boundary between a document theme and the application's own chrome, and
records the constraints and amendments that follow from drawing it. Decision: `decisions.md`
D-05, D-06.

Read before writing any styling, theme, or export code.

## 1. Two layers, deliberately not unified

| | **Layer A — app chrome** | **Layer B — document theme** |
|---|---|---|
| Covers | toolbar, dialogs, Help centre, status area, menus | canvas, nodes, connectors, branch palette, collapse badge |
| Chosen by | the user, once, as an app preference | the document; one of four shapes × one of ten palettes |
| Lifetime | the browser profile | travels with the document |
| Persisted in | local preferences | the document model, and `shape:` / `palette:` in Markdown front matter |
| Appears in exports | **never** | **always** |
| Source of truth | `apps/mapdown/src/styles/` | `spec/theme.md` §3 schema |

They differ in lifetime, in who chooses them, and — decisively — in whether they must
serialise. Layer B values are written into an exported SVG that is required to carry no
external dependency of any kind (`spec/storage-export.md` §12.3, §12.6). They must therefore
resolve to literal values at export time. Layer A never leaves the browser and can be ordinary
CSS custom properties.

This is also why Mapdown does not reuse `@bcailab/ui`: a browser-runtime custom-property system
is the wrong shape for Layer B, and Layer A wants to be quiet and neutral rather than branded
(`spec/product-specification.md` §2.1).

Layer A is greys, white, and one accent. It should be nearly invisible in a screenshot of the
product — the map is the figure, the application is the ground.

## 2. The seam: interaction tokens

`spec/theme.md` §9 `InteractionTokens` — hover outline, selection outline, focus ring, editing
outline, drop indicators — sit between the layers and are the one genuine hybrid.

They belong to **Layer B** because they must maintain contrast against the document theme's
canvas and node fills, which vary per theme. But they are **excluded from export** like Layer A
(`spec/theme.md` §9, `spec/storage-export.md` §12.2).

Rule: interaction tokens are defined per document theme, and the exporter drops them. Do not
move them into chrome to "simplify" — a focus ring tuned for the light chrome will disappear on
the Dark theme's canvas.

## 3. C-01 — The chrome accent must not collide with the branch palette

**Constraint.** The Layer A accent hue and the Layer B branch palette must be distinguishable,
or selection becomes ambiguous.

**Failure it prevents.** `spec/theme.md` §8 assigns branch colours cyclically from a 6–10 colour
palette. If the chrome accent is the same blue as a branch colour, a user cannot tell "this node
is selected" from "this branch happens to be blue" — and under Soft Branch Colors, where every
first-level branch is coloured, this is not an edge case.

**Resolution, in order of preference.**

1. **Do not encode selection in colour at all.** Use an outline ring plus elevation. This is
   already required for a different reason — `spec/theme.md` §9 states selection "does not rely
   solely on fill color" and §18 requires hierarchy to survive greyscale — so satisfying C-01
   this way costs nothing and satisfies accessibility at the same time.
2. If an accent hue is used for selection, reserve it: exclude that hue from every branch
   palette across all four presets.

Do not resolve it by desaturating the branch palette. Branch colour is a product feature; chrome
accent is decoration, and decoration yields.

## 4. C-02 — Chrome appearance and document theme are independent controls

**Constraint.** Choosing the **Dark document theme** must not darken the application chrome, and
switching chrome to dark must not change the document's theme.

`spec/theme.md` §16 already states the second half ("Switching the surrounding application
chrome between light/dark MUST not silently change the document theme"). This constraint records
the first half, which the specification does not cover, and makes the independence explicit in
both directions.

**Failure it prevents.** A user picks the Dark theme because they want a dark-background image
to drop into a slide deck — and the whole editor goes black. Conversely, someone who works in
dark chrome by habit is not thereby asking every map they export to have a black background.
Document theme is a property of the artifact; chrome appearance is a property of the workspace.

**Resolution.** Two independent settings. Chrome follows the OS preference by default with a
manual override, persisted in local preferences and never in the document. Document theme is
explicit, persistent, part of the document, and undoable as a presentation command
(`spec/theme.md` §14). A future "System Adaptive" *document* theme is the one sanctioned
coupling, and `spec/theme.md` §16 already requires it to define both token sets and its export
behaviour before it can exist.

## 5. A-01 — Applied amendment: `ControlTokens` split

**Status: applied 2026-08-01** (`decisions.md` D-08). `spec/theme.md` §10 no longer declares the
toolbar tokens, and its new §10.1 states the rule directly. This section is retained as the
reasoning behind that change.

**Finding.** `spec/theme.md` §10 `ControlTokens` bundled two things that this document's layering
separates:

```ts
collapseBackground, collapseText, collapseBorder,     // Layer B — appears in exports
collapseHoverBackground, collapseSize, collapseFontSize,
toolbarBackground, toolbarText, toolbarBorder          // Layer A — never exported
```

The collapse badge is part of the map: `spec/storage-export.md` §12.2 requires the collapsed
count badge to **remain in exported images**, because it communicates hidden structure. The
toolbar is chrome and is excluded from every export.

**Resolution.** The collapse tokens stay in the document theme; `toolbarBackground`,
`toolbarText` and `toolbarBorder` were removed from `MindMapTheme` and belong to Layer A. A
document theme cannot restyle the toolbar; if it could, exporting a Business-themed map would
imply something about the application frame, which is meaningless.

## 6. Implementation notes

- Layer A lives in `apps/mapdown/src/styles/`. Layer B is data — a typed record per preset,
  imported by both the renderer and the exporter, so a theme cannot render one way on canvas and
  another way in an export (`spec/theme.md` §2.7: "Export uses the same tokens as the editor").
- The exporter reads Layer B values directly. If a Layer B token is ever authored as a CSS
  custom property, SVG export breaks silently or produces an unstyled file — `spec/theme.md`
  §19.7 requires an SVG export visual regression check per theme, which is the test that catches
  this.
- Fonts are Layer B and must be a system stack (`spec/theme.md` §5). No web font: it would be
  either an external dependency in the exported SVG, which is forbidden, or an embedding-and-
  licensing problem.
- The production toolbar exposes seven top-level controls. Its popovers, spacing, focus
  treatment, status indicator and responsive rules are Layer A. Theme preview swatches may read
  Layer B literals, but changing the document theme must not let those values style the chrome.
- Selection is drawn as a separate outer ring with a transparent gap. It does not replace the
  node’s own border, alter box dimensions or enter image export.
- The editing textarea is a Layer B overlay: its fill, text, corner radius and typography come
  from the covered node's role tokens (`spec/theme.md` §9), so dark chrome can never bleed into
  a light map. Only its highlight ring is the theme's `editingOutline`, drawn outside the box
  so it never consumes content width or changes the node's dimensions.
- Layout measurement consumes the active theme’s root, level-1 and default font/padding metrics.
  Fallback SVG/PNG layout uses the same mapping, so a rendered type hierarchy cannot overflow a
  box measured with the old default typography.
