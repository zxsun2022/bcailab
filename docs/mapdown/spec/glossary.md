# Glossary

## Active document

The document currently loaded into the editor and receiving commands.

## Ancestor

Any node on the path from a node’s parent toward the root.

## Branch

A first-level node and its complete descendant subtree. In casual UI text, “branch” may also refer to any node with descendants, but specifications should state which meaning applies.

## Branch side

The left or right assignment stored on a first-level node for two-sided layout.

## Canvas

The visual viewport containing the rendered mind map. It is not a free-position drawing canvas.

## Canonical Markdown

The normalized Markdown form emitted by the application: one level-1 root heading, unordered lists, two-space indentation, and supported front matter.

## Child

A node directly beneath another node in the hierarchy.

## Collapse

Hide all descendants of a node from the current visual layout while preserving their content.

## Collapse control

The outward-edge button showing minus when expanded or direct-child count when collapsed.

## Command

A centralized, validated operation that changes document or presentation state and can participate in undo/redo.

## Command Center

The searchable in-app interface for discovering and executing commands and viewing shortcuts.

## Committed node

A node that is part of the stable document state rather than a cancellable newly created empty node.

## Descendant

Any child, grandchild, or deeper node below a node.

## Direct child count

The number of immediate children, excluding deeper descendants. This is the number displayed on a collapsed badge.

## Document order

The semantic order defined by each parent’s ordered child list. It is independent of the current visual side.

## Editing state

The state in which a node text input has a caret or text selection and text-editing semantics apply.

## Expanded

A node with children whose descendants are eligible to be visible because its own collapse flag is false.

## First-level node

A direct child of the root. In two-sided layout it owns a left/right side assignment.

## Hidden by ancestor

A node omitted from the visible map because at least one ancestor is collapsed.

## History entry

One undoable transaction, such as creating and initially typing a node, deleting a subtree, or moving a branch.

## IME

Input Method Editor, used for composition-based input such as Chinese Pinyin. Structural shortcuts must not fire while composition is active.

## Inward edge/direction

The node side or keyboard direction pointing toward the root.

## Layout mode

The document presentation structure: right-only or two-sided.

## Leaf

A node with no children.

## Local-first

A model in which core editing and persistence work on the user’s device without requiring an account or server.

## Local snapshot

A lossless browser-stored representation of the document, including IDs, branch sides, collapse state, and settings.

## Markdown-native

The hierarchy’s semantic content can be represented and exported as a documented Markdown structure; Markdown is not merely a decorative import/export option.

## Mind map

The visual projection of the rooted ordered tree.

## Node

One plain-text topic in the tree.

## Node body

The visible shape containing a node label, excluding connectors and optional outward collapse control lane.

## Node selected state

A visible node is the target of structural keyboard commands but has no text caret.

## Normalization

Conversion into a valid canonical model or text form, including text cleanup, hierarchy validation, and default settings.

## Outward edge/direction

The node side or keyboard direction pointing away from the root and toward descendants.

## Parent

The single node directly above another node.

## Presentation state

Document-level or view-level choices such as theme, layout mode, and collapse. Some are persisted locally but not all are standard Markdown semantics.

## Reorder

Change a node’s position within the same parent’s child list.

## Reparent

Move a node and its subtree under a different parent.

## Right-only layout

A layout in which every branch renders to the right of the root while stored two-sided assignments remain preserved.

## Root

The unique top node of the document. It has no parent and cannot be deleted, moved, promoted, or collapsed in MVP.

## Selected node

The one visible node currently targeted by structural commands.

## Semantic content

Root/node text, hierarchy, and sibling order. This is the portion guaranteed by standard Markdown round trip.

## Side assignment

See Branch side.

## Sibling

Nodes sharing the same parent.

## Stable layout

A policy that avoids unnecessary side changes, reordering, and distant movement when content changes.

## Static site

An application deployable as static assets without a required server-side runtime. Client-side editing and browser storage remain dynamic.

## Subtree

A node plus every descendant beneath it.

## Theme

A document-level structured token set controlling colors, typography, node shapes, connectors, and related layout metrics.

## Transaction

One atomic command or batch that either produces a valid committed state or no state change.

## Two-sided layout

A layout in which first-level branches render on stable left or right sides of the root.

## Viewport

The visible window onto document coordinates, controlled by pan and zoom.

## Visible projection

The tree containing root and all nodes not hidden by a collapsed ancestor, used as layout input.

## WYSIWYG

“What you see is what you get”: node text is edited directly in its rendered location rather than in a separate source editor.
