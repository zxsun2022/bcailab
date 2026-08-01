# Data Model and Command Architecture

## 1. Design goals

The runtime model must support:

- a normalized ordered tree;
- stable node identity;
- fast hierarchy operations;
- deterministic serialization;
- automatic layout;
- undo/redo;
- transient selection and editing state;
- local persistence and recovery;
- future outline view without changing semantic content.

The model should separate **content**, **document presentation**, **ephemeral interface state**, and **derived layout**.

## 2. Core entities

### 2.1 MindMapDocument

Conceptual schema:

```ts
interface MindMapDocument {
  schemaVersion: number;
  id: string;
  title: string;
  rootId: NodeId;
  nodes: Record<NodeId, MindMapNode>;
  layout: DocumentLayoutSettings;
  theme: ThemeSelection;
  metadata: DocumentMetadata;
  revision: number;
}
```

Requirements:

- `schemaVersion` MUST support future migrations.
- `id` MUST be unique within local storage.
- `rootId` MUST reference an existing root node.
- `nodes` MUST contain no unreachable nodes after transaction commit.
- `revision` SHOULD increment for semantic/document-presentation transactions.

### 2.2 MindMapNode

```ts
interface MindMapNode {
  id: NodeId;
  text: string;
  parentId: NodeId | null;
  childIds: NodeId[];
  collapsed: boolean;
  side: BranchSide | null;
  createdAt?: string;
  updatedAt?: string;
}

type BranchSide = 'left' | 'right';
```

Normative constraints:

- The root has `parentId: null`.
- Every nonroot node has one valid `parentId`.
- `childIds` define semantic sibling order.
- A child’s `parentId` MUST match the parent that lists it.
- Only first-level nodes may persist a non-null `side`.
- Descendants derive rendering side from their first-level ancestor.
- The root MUST have `side: null` and `collapsed: false`.
- Node IDs MUST remain stable across edits, layout changes, theme changes, autosaves, and ordinary Markdown export/reimport only when the selected extended format preserves them. Standard Markdown reimport may generate new IDs.

### 2.3 DocumentLayoutSettings

```ts
interface DocumentLayoutSettings {
  mode: 'right' | 'two-sided';
  horizontalGap: number;
  verticalGap: number;
  subtreeGap: number;
  maxNodeWidth: number;
  connectorStyle: 'curve';
  compactness: 'comfortable';
}
```

MVP may expose only `mode` to users. Other values may come from theme/layout defaults but should be explicit in the normalized model or layout input.

### 2.4 ThemeSelection

```ts
interface ThemeSelection {
  themeId: string;
  branchColorMode: 'single' | 'by-first-level-branch';
}
```

MVP does not store arbitrary user CSS or per-node overrides.

### 2.5 DocumentMetadata

```ts
interface DocumentMetadata {
  createdAt: string;
  updatedAt: string;
  importedFrom?: {
    filename?: string;
    format: 'markdown';
  };
}
```

Metadata must not be required for rendering semantic content.

## 3. Ephemeral editor state

Ephemeral state is not part of standard Markdown export.

```ts
interface EditorState {
  activeDocumentId: string;
  selectedNodeId: NodeId | null;
  interactionMode: InteractionMode;
  editing: EditingState | null;
  hoveredNodeId: NodeId | null;
  drag: DragState | null;
  contextMenu: ContextMenuState | null;
  viewport: ViewportState;
  helpOpen: boolean;
  exportDialogOpen: boolean;
  lastInputMethod: 'keyboard' | 'pointer' | 'touch';
}
```

### 3.1 InteractionMode

```ts
type InteractionMode =
  | 'idle'
  | 'node-selected'
  | 'node-editing'
  | 'canvas-panning'
  | 'node-dragging'
  | 'modal';
```

A node’s collapse status is not an interaction mode.

### 3.2 EditingState

```ts
interface EditingState {
  nodeId: NodeId;
  originalText: string;
  isNewNode: boolean;
  creationAnchorId: NodeId | null;
  selectionIntent: 'caret' | 'select-all' | 'replace-on-input';
  compositionActive: boolean;
  historyGroupId: string;
}
```

### 3.3 ViewportState

```ts
interface ViewportState {
  scale: number;
  offsetX: number;
  offsetY: number;
  userModified: boolean;
}
```

Viewport state MAY be persisted locally per document but SHOULD NOT be placed in standard Markdown export.

### 3.4 DragState

```ts
interface DragState {
  sourceNodeId: NodeId;
  pointerId: number;
  startPoint: Point;
  currentPoint: Point;
  target: DropTarget | null;
  thresholdPassed: boolean;
}

type DropTarget =
  | { kind: 'before'; referenceNodeId: NodeId }
  | { kind: 'after'; referenceNodeId: NodeId }
  | { kind: 'child'; parentNodeId: NodeId }
  | { kind: 'side'; side: BranchSide };
```

The target resolver MUST reject cycles and invalid root operations before commit.

## 4. Derived layout model

Layout output is derived and should not be serialized as semantic content.

```ts
interface LayoutResult {
  documentRevision: number;
  nodeBoxes: Record<NodeId, NodeBox>;
  connectors: ConnectorGeometry[];
  visibleNodeIds: NodeId[];
  bounds: Rect;
}

interface NodeBox {
  nodeId: NodeId;
  x: number;
  y: number;
  width: number;
  height: number;
  side: 'root' | BranchSide;
  depth: number;
  outwardEdgeX: number;
  inwardEdgeX: number;
}
```

The layout result MUST not become the source of sibling order or hierarchy.

## 5. Tree invariants

Every committed document state MUST satisfy:

1. Exactly one root exists.
2. The root’s parent is null.
3. Every nonroot node is reachable from the root exactly once.
4. No cycle exists.
5. Every child relationship is bidirectionally consistent.
6. Sibling IDs are unique within each `childIds` list.
7. All IDs in `childIds` exist.
8. Only first-level nodes have a side.
9. Root is not collapsed.
10. Text values are valid normalized strings.

A development build SHOULD assert these invariants after each structural command.

## 6. Commands

All semantic modifications MUST occur through explicit commands or transactions, not ad hoc mutation from UI components.

Conceptual command set:

```ts
type Command =
  | RenameNode
  | CreateSibling
  | CreateChild
  | DeleteSubtree
  | PromoteNode
  | ReorderNode
  | ReparentNode
  | MoveFirstLevelBranchSide
  | SetCollapsed
  | SetLayoutMode
  | SetTheme
  | ReplaceDocumentFromImport;
```

Each command MUST define:

- preconditions;
- deterministic apply behavior;
- inverse or snapshot needed for undo;
- selection result;
- layout invalidation scope;
- whether it is semantic, presentation, or transient.

## 7. Command details

### 7.1 RenameNode

Input:

```ts
{ nodeId, previousText, nextText, historyGroupId }
```

Rules:

- normalize text before commit;
- preserve node ID and structure;
- trigger node measurement and ancestor-subtree layout recalculation;
- coalesce sequential text edits in the same editing session.

### 7.2 CreateSibling

Input:

```ts
{ anchorId, newNodeId, initialText }
```

Rules:

- if anchor is root, parent is root and insertion index is end of root children;
- otherwise parent equals anchor parent and insertion index is anchor index + 1;
- first-level side uses side-assignment policy;
- selection becomes new node;
- new node enters editing.

### 7.3 CreateChild

Input:

```ts
{ parentId, newNodeId, initialText }
```

Rules:

- append to parent children;
- expand parent if collapsed;
- descendants inherit branch side;
- selection becomes new node.

### 7.4 DeleteSubtree

Input:

```ts
{ nodeId }
```

Undo payload MUST contain:

- full subtree node records;
- original parent ID;
- insertion index;
- previous selection;
- any first-level side values.

### 7.5 PromoteNode

For node `N` with parent `P` and grandparent `G`:

- remove `N` from `P.childIds`;
- insert `N` after `P` in `G.childIds`;
- set `N.parentId = G.id`;
- if `G` is root, assign `N.side` based on `P.side` by default;
- if `G` is not root, set `N.side = null`.

### 7.6 ReparentNode

Rules:

- reject target equal to source;
- reject target inside source subtree;
- remove source from current parent;
- append or insert at requested target index;
- update `parentId`;
- normalize first-level side ownership;
- preserve subtree content and internal order.

### 7.7 SetCollapsed

Rules:

- root cannot collapse;
- leaf nodes normalize to `collapsed: false`;
- command may enter history as a presentation operation;
- nested descendant collapse states remain unchanged.

## 8. History model

### 8.1 History entry

```ts
interface HistoryEntry {
  id: string;
  label: string;
  timestamp: number;
  forward: CommandBatch;
  inverse: CommandBatch;
  beforeSelection: NodeId | null;
  afterSelection: NodeId | null;
  category: 'content' | 'structure' | 'presentation';
}
```

### 8.2 Coalescing text edits

All text input during one continuous editing session SHOULD become one undo entry.

A new group begins when:

- editing starts on another node;
- a structural command executes;
- a modal command executes;
- a pause threshold is exceeded and implementation chooses time-based grouping;
- IME composition is committed and followed by a distinct editing action.

Undo of a rename SHOULD restore the text at editing-session entry, not remove one character at a time.

### 8.3 Creation plus typing

Creating a node and typing its initial text SHOULD be one history entry where practical.

Undo should remove the newly created node, rather than first clearing its text and requiring a second undo.

### 8.4 Creation plus cancellation

Creating an empty node and cancelling it SHOULD produce no lasting history entry.

### 8.5 Viewport exclusion

Pan, zoom, hover, help open/close, and selection-only changes do not belong in semantic history.

## 9. Visibility derivation

A node is visible when:

- it is the root; or
- every ancestor between it and root is expanded.

Definitions:

- **Expanded:** node has children and `collapsed` is false.
- **Collapsed:** node has children and `collapsed` is true.
- **Hidden by ancestor:** at least one ancestor is collapsed.
- **Leaf:** no children; collapse state normalizes false.

Hidden nodes remain in the document and Markdown export.

## 10. Side derivation

For any nonroot node:

1. find its first-level ancestor;
2. in right-only mode, render side as right;
3. in two-sided mode, render using the first-level ancestor’s stored side;
4. if a legacy/imported first-level node has no side, assign one deterministically and persist it on next document normalization.

## 11. Serialization layers

The application has three relevant serialization layers:

1. **Standard Markdown export**
   - portable content;
   - document-level supported metadata;
   - no required node IDs or collapse state.
2. **Local application snapshot**
   - complete document model;
   - node IDs;
   - collapse state;
   - side assignments;
   - theme/layout settings;
   - optional viewport.
3. **Extended lossless Markdown profile** (future/optional)
   - may preserve node IDs and view metadata through comments or structured front matter.

MVP MUST implement layers 1 and 2.

## 12. Migration

Every local snapshot MUST carry a schema version.

Migration rules:

- migrations run before document activation;
- migrations MUST be deterministic;
- original stored data SHOULD be retained until successful rewrite;
- failure SHOULD open a recovery flow rather than silently discarding the document;
- tests MUST include migration from every previously released schema version.
