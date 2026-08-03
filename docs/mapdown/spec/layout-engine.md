# Automatic Layout Engine Specification

## 1. Purpose

The layout engine transforms a visible ordered tree into deterministic node rectangles and connector paths.

It must optimize for:

1. no overlap;
2. clear hierarchy;
3. stable spatial memory;
4. compact but readable use of space;
5. predictable branch ordering;
6. responsive local updates;
7. exportable deterministic geometry.

The user does not directly edit coordinates.

## 2. Inputs and outputs

### 2.1 Inputs

The engine receives:

- normalized document tree;
- visible/collapsed projection;
- layout mode;
- stored first-level branch sides;
- measured node dimensions;
- theme layout tokens;
- prior layout result, when available;
- optional selected/edited node for stability weighting.

### 2.2 Outputs

The engine returns:

- node positions and dimensions;
- rendered side and depth;
- subtree bounds;
- connector geometry;
- map bounds;
- visible-node navigation metadata;
- animation correspondence from prior geometry.

## 3. Coordinate system

The root center is the conceptual origin `(0, 0)` in document coordinates.

Recommended conventions:

- positive X extends right;
- negative X extends left;
- positive Y extends downward;
- node positions are represented by top-left coordinates plus width/height, or center coordinates consistently;
- viewport transforms map document coordinates to screen coordinates.

Pan and zoom do not alter layout coordinates.

## 4. Node measurement

### 4.1 Text measurement

Node size depends on:

- text content;
- font family;
- font size;
- font weight;
- line height;
- horizontal/vertical padding;
- border width;
- maximum width;
- root/depth-specific theme tokens.

The measurement system MUST use the same effective typography as rendering closely enough to prevent clipping.

### 4.2 Wrapping

Node text wraps automatically when its unwrapped width exceeds the applicable maximum width.

MVP has no manual line breaks.

Wrapping SHOULD occur at Unicode line-break opportunities and support Chinese text without requiring spaces.

A long unbreakable token SHOULD:

- use emergency word breaking;
- remain inside maximum width;
- not overflow connectors or controls.

### 4.3 Collapse-control reservation

The collapse badge/control appears on the outward edge without changing node width when hover changes.

The layout MUST reserve a small outward control lane or overlay it beyond the node body while including it in collision bounds where necessary.

### 4.4 Measurement caching

Measurements SHOULD be cached by a key including text and typography tokens.

A text edit invalidates the edited node’s measurement and affected ancestor subtree geometry, not all unrelated nodes.

## 5. Visible tree

Before layout, construct a visible projection:

- include root;
- include each child of an expanded visible node;
- exclude all descendants of a collapsed node;
- retain direct-child count metadata for collapsed badges.

Hidden nodes contribute no layout space.

## 6. Right-only layout

### 6.1 Horizontal placement

For a node at depth `d`:

- root is at X around zero;
- each child is placed to the right of its parent;
- horizontal distance equals parent half-width + child half-width + depth/connector gap tokens;
- exact X may be computed recursively to accommodate variable widths.

Recommended edge-based rule:

```text
child.left = parent.right + horizontalGap(depth)
```

### 6.2 Vertical placement

A leaf subtree height equals node height.

An expanded node’s children occupy:

```text
sum(childSubtreeHeights)
+ verticalSiblingGap × (childCount - 1)
```

The parent node is vertically centered over the span of its visible children, subject to stability constraints.

The subtree height is the maximum of:

- parent node height;
- children block height.

### 6.3 Sibling order

Top-to-bottom order equals semantic `childIds` order.

## 7. Two-sided layout

### 7.1 First-level partition

Root children are partitioned into left and right lists based on persisted side.

Descendants remain on their first-level ancestor’s side.

### 7.2 Stable side assignment

When a new first-level node has no side:

1. calculate current visible aggregate subtree heights for left and right;
2. choose the side with smaller aggregate height;
3. if equal, use deterministic alternation based on existing first-level count or a stored next-side preference;
4. persist the chosen side immediately;
5. never automatically move it later merely to rebalance.

Recommended deterministic tie-break:

- first branch goes right;
- second goes left;
- later ties alternate from the most recently assigned side.

### 7.3 Manual side changes

A user command may change a first-level node’s side.

The engine then reflows both side blocks but preserves all other side assignments and semantic order.

### 7.4 Left-side hierarchy

Left-side children extend toward negative X.

Edge rule:

```text
child.right = parent.left - horizontalGap(depth)
```

Connectors leave the parent’s left outward edge and enter the child’s right inward edge.

### 7.5 Top-to-bottom ordering on the left

Semantic order MUST remain understandable when serialized.

Normative rule:

> Within each side partition, first-level branches render top-to-bottom in their original semantic order filtered to that side. Descendant siblings also render top-to-bottom in semantic order on both sides.

Do not reverse left-side arrays merely because geometry extends leftward.

### 7.6 Root centering

The root Y position SHOULD align with the center of the combined visible left/right extents.

Each side’s first-level block is independently arranged around root center.

If one side is much taller, the other side should remain centered around root rather than anchored to the top.

## 8. Subtree layout algorithm

A tidy-tree or Reingold–Tilford-derived algorithm may be used, but it must support:

- variable node dimensions;
- two directions;
- collapsed nodes;
- stable ordering;
- local reflow;
- separate sibling and cousin/subtree gaps.

Conceptual two-pass process:

### Pass 1: measure

For each visible node bottom-up:

1. measure node box;
2. measure each child subtree;
3. calculate child block height;
4. calculate subtree height;
5. store relative child offsets.

### Pass 2: place

Top-down:

1. place root;
2. place each first-level side block;
3. place child boxes at direction-appropriate X;
4. assign Y from measured offsets;
5. compute connector endpoints;
6. compute global bounds.

A more advanced contour-based collision algorithm may reduce excess whitespace, but deterministic behavior is required.

## 9. Spacing tokens

The layout engine consumes theme-aware tokens with sensible constraints.

Suggested token categories:

```ts
interface LayoutTokens {
  rootToFirstLevelGap: number;
  parentChildGap: number;
  siblingGap: number;
  cousinGap: number;
  subtreeGap: number;
  canvasPadding: number;
  connectorControlOffset: number;
  collapseControlGap: number;
  maxNodeWidthRoot: number;
  maxNodeWidthLevel1: number;
  maxNodeWidthDefault: number;
}
```

Guidelines:

- root-to-first-level gap may exceed deeper parent-child gaps;
- sibling gap should be tighter than gap between distinct subtrees;
- spacing must remain large enough for selection outlines and collapse controls;
- theme differences may be modest to preserve predictable map scale.

## 10. Connectors

### 10.1 Connector model

MVP uses smooth curved connectors.

Recommended cubic Bézier path:

- start at parent outward-edge center;
- end at child inward-edge center;
- controls extend along branch direction by a proportion of horizontal gap;
- path remains monotonic in X where practical.

### 10.2 Root connectors

Each first-level branch receives its branch color according to theme.

Root connector origins MAY be distributed slightly along root edge if necessary, but should visually emerge from a coherent root area.

### 10.3 Deeper connectors

Deeper connectors inherit their first-level branch color when branch-color mode is enabled.

### 10.4 Hit testing

Connectors are not directly editable in MVP. Their pointer hit area SHOULD not block node selection or canvas pan.

### 10.5 Export

Connector geometry in SVG export must match on-screen layout excluding interaction overlays.

## 11. Stability policy

### 11.1 Core rule

A structural edit should disturb the smallest reasonable region.

### 11.2 Sticky side

First-level side assignment is never changed by ordinary content edits.

### 11.3 Sticky order

Sibling order changes only through explicit user action.

### 11.4 Anchor selection

When an edited/created node changes height, the engine SHOULD treat the selected node’s screen position as a soft anchor and adjust viewport offset to reduce perceived jumping.

This is viewport compensation, not coordinate persistence.

### 11.5 Local reflow

When a node changes:

- recompute its measurement;
- recompute ancestors’ subtree heights up to root;
- re-place affected side/subtrees;
- preserve unaffected side geometry where possible;
- update global bounds.

### 11.6 Avoid global recenter during typing

The root must not automatically recenter in the viewport after every keystroke.

The viewport remains user-controlled, with minimal reveal compensation only when selected content would leave the visible area.

### 11.7 Collapse stability

Collapsing a branch removes descendant space. The collapsed node SHOULD remain near its previous position when feasible, with neighboring nodes moving smoothly into freed space.

## 12. Layout mode switching

Switching right-only ↔ two-sided:

1. recompute side rendering;
2. preserve stored side assignments;
3. preserve selected node;
4. compute new fit only if current map would become largely invisible; otherwise retain viewport center around selected/root;
5. animate correspondence by stable node ID;
6. synchronize connectors.

No semantic hierarchy changes.

## 13. Navigation geometry

The layout output SHOULD provide efficient neighbor lookup.

For each visible node, derive:

- parent;
- first visible child;
- nearest above;
- nearest below;
- inward/outward directions;
- first-level side.

Geometric up/down navigation MUST be deterministic.

One scoring approach:

```text
score = verticalDistance
      + horizontalDistance × horizontalPenalty
      + crossSidePenalty
      + hierarchyPenalty
```

Only candidates in the requested vertical half-plane are considered.

The exact weights are implementation-specific but become part of behavior once shipped and should have regression tests.

## 14. View bounds and fitting

Map bounds include:

- all visible node rectangles;
- connectors;
- collapse badges;
- a small visual padding.

They exclude:

- selection outlines when calculating export bounds, unless necessary to avoid clipping node shadows;
- toolbar and viewport UI;
- hidden descendants.

Fit scale:

```text
min(
  availableWidth / boundsWidth,
  availableHeight / boundsHeight,
  maxFitScale
)
```

Use comfortable padding and clamp to supported zoom range.

## 15. Animation

### 15.1 Identity

Animations match old and new node positions by stable node ID.

### 15.2 Enter/exit

- New nodes may fade/scale subtly from parent/sibling origin.
- Deleted nodes may fade out before final removal if this does not delay command response.
- Collapsed descendants animate toward the collapsing node or fade, but should not create visual clutter.

### 15.3 Retargeting

If another edit occurs during animation:

- use current interpolated geometry as the next start; or
- cancel and snap to the new result.

Never queue many stale layout animations.

### 15.4 Reduced motion

With reduced motion:

- positions update immediately;
- opacity transitions are minimal or absent;
- focus/selection remains clear.

## 16. Performance strategy

### 16.1 Incremental invalidation

Track invalidation scopes:

- text/measurement change;
- subtree visibility change;
- structural move;
- side partition change;
- full theme metric change;
- viewport-only change.

### 16.2 Avoid DOM layout dependency loops

Prefer deterministic text measurement and explicit geometry over repeatedly reading and writing DOM layout in a loop.

If DOM measurement is required:

- batch reads;
- batch writes;
- cache results;
- avoid forced synchronous layout per keystroke.

### 16.3 Large maps

For large maps:

- rendering may cull offscreen nodes only if logical focus, export, and navigation remain correct;
- layout still accounts for all visible document nodes;
- collapse is a meaningful performance tool;
- expensive export may run in a worker where feasible.

## 17. Edge cases

### 17.1 One extremely tall branch

Do not move other first-level branches to the opposite side automatically. Maintain sticky side and allow manual move.

### 17.2 Empty node

Use placeholder measurement while empty so the node remains targetable.

### 17.3 Very long root

Root wraps within its root max width. Branch origins adapt to measured root edges.

### 17.4 Deep chain

A depth-100 chain should remain valid, although it may require zoom/pan. Connectors must not collapse to zero-length.

### 17.5 All branches one side in two-sided mode

Valid. Do not force movement unless a new unassigned branch is created.

### 17.6 Theme font load

Use fallback metrics initially and trigger one controlled remeasure/reflow after the font is ready. Avoid repeated layout flashing.

## 18. Required layout invariants

1. Visible node rectangles do not overlap.
2. Every visible nonroot node has one connector to its visible parent.
3. Hidden descendants have no rendered box or connector.
4. Sibling visual order follows semantic order within a side.
5. First-level side remains stable across text edits, collapse, theme, and reload.
6. Right-only mode renders every branch right without erasing stored side.
7. Collapse controls are on outward edges.
8. Geometry is deterministic for equal inputs.
9. Selection/hover visuals do not alter measured geometry.
10. Fit map includes all visible content.

## 19. Visual regression fixtures

The test suite SHOULD include reference maps:

- empty root;
- one child;
- balanced two-sided 10 branches;
- highly unbalanced two-sided map;
- mixed Chinese/English labels;
- very long labels;
- deep chain;
- wide 100-sibling root;
- nested collapsed branches;
- side switch and layout-mode switch;
- theme metric changes.
