# Markdown Format Specification

## 1. Purpose

Markdown is the portable semantic format for the mind map. The application MUST support a clearly defined subset rather than claiming compatibility with every Markdown dialect.

The core mapping is:

- one level-1 heading represents the root node;
- unordered-list items represent all descendants;
- indentation represents parent-child hierarchy;
- list order represents semantic sibling order;
- optional YAML front matter stores document-level settings.

## 2. Canonical exported form

A canonical document looks like:

```markdown
---
mindmap:
  version: 1
  layout: two-sided
  shape: soft-branches
  palette: soft-spectrum
---

# Root topic

- First branch
  - Child A
  - Child B
- Second branch
  - Child C
```

Canonical export rules:

1. UTF-8 encoding without BOM is preferred.
2. Line endings SHOULD be `LF`.
3. Front matter is optional but emitted when application settings differ from defaults or when configured to always include it.
4. Exactly one blank line appears after front matter.
5. Exactly one `# ` heading represents the root.
6. Exactly one blank line appears between root heading and first list item.
7. Unordered-list marker is `-`.
8. Each nesting level uses two spaces.
9. Node labels are exported as single logical lines.
10. The file ends with one newline.

## 3. Root representation

### 3.1 Required root

The imported document MUST resolve to exactly one root label.

Accepted root sources, in priority order:

1. The first level-1 heading (`# Root`).
2. If no heading exists, a single top-level list item may be promoted to root only when all other content is nested beneath it.
3. If neither rule yields one unambiguous root, import fails with an actionable error.

Canonical export always uses a level-1 heading.

### 3.2 Multiple headings

If multiple level-1 headings exist:

- the parser MUST NOT silently create multiple roots;
- recommended behavior is to use the first as root and report the later headings as unsupported content requiring user confirmation;
- strict mode may reject the file.

MVP default SHOULD reject ambiguity and show line numbers.

### 3.3 Empty root heading

`#` with no text yields an empty root label. This is valid but SHOULD display an “Untitled” placeholder in the editor.

## 4. List hierarchy

### 4.1 Supported markers

Import MAY accept `-`, `*`, or `+` unordered-list markers, but canonical export MUST use `-`.

Ordered-list markers MAY be imported as ordinary sibling nodes with numbering removed, accompanied by a warning. Canonical export remains unordered.

### 4.2 Indentation

Canonical export uses two spaces per level.

Import SHOULD accept:

- two-space indentation;
- four-space indentation;
- tabs where parser behavior is unambiguous.

The importer MUST normalize the parsed hierarchy rather than preserve raw indentation.

Mixed indentation that changes semantic interpretation MUST produce a warning or error.

### 4.3 Invalid depth jumps

Example:

```markdown
- A
      - B
```

If indentation appears to jump more than one logical level without an intermediate parent, the parser SHOULD normalize B as a child of A if the Markdown parser already resolves it that way. It MUST not invent unnamed intermediate nodes.

### 4.4 Continuation lines

MVP node labels are single-line plain text.

For imported list items with continuation paragraphs:

- concatenate textual continuation lines using a single space;
- strip unsupported block structure;
- record a warning.

Nested lists remain child nodes and are not concatenated.

## 5. Inline Markdown

Nodes support plain text only. Imported inline syntax is normalized to readable text.

Recommended normalization:

| Input | Node text |
|---|---|
| `**bold**` | `bold` |
| `*italic*` | `italic` |
| `` `code` `` | `code` |
| `[label](https://example.com)` | `label` |
| `~~strike~~` | `strike` |
| escaped punctuation | decoded literal punctuation |
| inline HTML | text content where safe, otherwise removed with warning |

The exporter SHOULD escape characters only as necessary to preserve a single list item and heading.

The editor does not render inline formatting in MVP.

## 6. Special characters and escaping

### 6.1 Heading text

Root text beginning or ending with `#` must be escaped or represented so it remains heading content.

### 6.2 List-item text

A node beginning with list-like syntax, for example `- item`, must be escaped or encoded to remain one node label.

### 6.3 Backslashes

Canonical serialization MUST be reversible for ordinary Markdown-significant punctuation.

A tested escaping utility should cover:

- backslash;
- leading `#`;
- leading list markers followed by space;
- leading ordered-list pattern such as `1. `;
- bracket/link punctuation where parsing may transform content;
- HTML-significant sequences if raw HTML is enabled by the parser.

### 6.4 Whitespace

Canonical export trims leading and trailing node whitespace.

Internal spaces remain as text. Hard tabs in labels SHOULD become spaces.

## 7. Front matter

### 7.1 Supported schema

```yaml
mindmap:
  version: 1
  layout: right | two-sided
  shape: <shape-id>
  palette: <palette-id>
  branchColors: single | by-first-level-branch
```

The theme is two orthogonal axes (D-24): `shape` (shape language + canvas appearance + role
tokens + type scale) and `palette` (the branch colour band). Both are written to front matter;
the legacy single `theme: <theme-id>` key is still read and maps onto
`(shape: <theme-id>, palette: <that shape's default>)`, and an explicit `shape` / `palette`
key wins its own axis when both forms are present. Export never emits the legacy `theme` key.

MVP MAY add:

```yaml
title: Optional document title
```

Only documented keys affect behavior.

### 7.2 Unknown keys

Unknown top-level or `mindmap` keys MUST be preserved only if the importer/exporter explicitly supports round-trip preservation. Otherwise:

- do not interpret them;
- warn that they may be lost on export;
- never execute embedded code or unsafe directives.

Recommended MVP behavior: preserve the original front-matter map in local snapshot and merge known updates when exporting, provided safe YAML parsing is used.

### 7.3 Invalid values

Invalid `layout`, `shape`, `palette`, or version values:

- fall back to defaults;
- show a nonblocking warning;
- do not block content import unless version indicates an incompatible future format.

### 7.4 Versioning

`mindmap.version` refers to the Markdown profile, not application release.

The app MUST reject or safely degrade future versions it cannot interpret.

## 8. What standard Markdown does not preserve

Standard export does not guarantee preservation of:

- node IDs;
- collapse state;
- viewport pan/zoom;
- current selection;
- undo history;
- exact measured coordinates;
- temporary branch animations;
- file-system handles;
- creation timestamps per node.

### 8.1 Side assignments

Two-sided branch side is important for visual continuity but has no standard Markdown representation.

MVP policy:

- standard Markdown export does not store per-branch side;
- reimport assigns sides deterministically using the balancing policy;
- local snapshots preserve side losslessly.

A future lossless profile may use comments or a structured side list in front matter.

### 8.2 Collapse state

Collapse is view state and is omitted from standard Markdown.

Reimport opens all branches unless local snapshot metadata is associated with the same document.

## 9. Optional future lossless profile

A future `.mind.md` profile MAY preserve view metadata while remaining readable.

Example concept, not part of MVP:

```markdown
- Branch A <!-- mindmap:id=n_123 side=left collapsed=true -->
```

Alternative front matter:

```yaml
mindmap:
  nodes:
    n_123:
      path: [0]
      side: left
      collapsed: true
```

No implementation should add such syntax before the profile is separately specified and versioned.

## 10. Import parsing pipeline

Recommended deterministic pipeline:

1. Decode file as UTF-8; detect common BOM.
2. Normalize line endings.
3. Parse YAML front matter using a safe parser.
4. Parse Markdown into an AST using a documented CommonMark-compatible parser.
5. Locate root heading.
6. Locate the descendant list associated with the root.
7. Convert list items recursively to normalized nodes.
8. Convert inline content to plain text.
9. Validate tree invariants.
10. Apply document settings and fallbacks.
11. Assign node IDs.
12. Assign first-level branch sides deterministically.
13. Produce warnings with line/range references.
14. Commit import as one transaction only after validation succeeds.

The existing open document remains untouched until step 14.

## 11. Import warnings

Warnings should be collected and shown as a summary, not as one dialog per issue.

Warning categories:

- unsupported inline formatting removed;
- links converted to labels;
- ordered lists converted;
- continuation paragraphs merged;
- additional headings ignored/rejected;
- unknown front-matter keys;
- unsupported theme fallback;
- mixed indentation normalized;
- hard line breaks combined;
- HTML removed.

A warning should include:

- category;
- line or source range when available;
- brief description;
- whether content was changed or ignored.

## 12. Import failure conditions

Import MUST fail without replacing the active document when:

- file cannot be decoded safely;
- no unambiguous root can be determined;
- hierarchy is cyclic due to a parser/plugin defect;
- resource limits are exceeded;
- front matter is malicious or cannot be parsed safely and blocks body detection;
- resulting tree violates required invariants.

The user should be able to dismiss the error and continue editing the prior document.

## 13. Resource limits

To protect the static application, import SHOULD enforce configurable limits, for example:

- maximum file size;
- maximum nodes;
- maximum depth;
- maximum node-label length.

Initial practical defaults may be:

- 5 MB Markdown file;
- 10,000 nodes;
- depth 100;
- 10,000 Unicode code points per node.

These values are safety limits, not normal usability targets, and can be refined.

## 14. Export behavior

### 14.1 Complete content

Every node reachable from root MUST be exported, regardless of collapse or viewport visibility.

### 14.2 Ordering

Export traverses semantic `childIds` order using pre-order depth-first serialization.

### 14.3 Empty labels

An empty root MUST export as a bare heading marker:

```markdown
#
```

An empty ordinary node MUST export as a bare list marker with no label and no trailing whitespace:

```markdown
-
```

No placeholder text is substituted, and no sentinel is emitted. An empty node is empty in the exported file exactly as it is in the document.

Because a bare list marker is the one construct in this format whose round trip depends on the chosen Markdown parser, parser tests MUST confirm that `Import(Export(document))` returns an empty label for both cases, against the parser the implementation actually ships. This is a required test, not a recommendation — see §17.

The editor displays `emptyPlaceholderText` (`theme.md` §6) for an empty node. That placeholder is a rendering affordance and MUST NOT be written to the exported file.

> **Amendment (2026-08-01).** This section previously presented three candidate approaches and rejected two of them in prose, leaving the operative rule inside the discussion. The rule is unchanged; only its statement was made unambiguous. The rejected alternatives, kept because the reasoning bears on any future revision: exporting `- Untitled` was rejected for silently inventing content and changing document semantics, and a sentinel such as `- <!-- empty -->` was rejected for polluting the file and breaking portability to editors outside this application. See `../decisions.md` D-09.

### 14.4 Atomic download

The exporter builds the complete string before initiating download. A failure does not modify local state.

## 15. Round-trip guarantees

For documents containing only supported content, this invariant MUST hold:

```text
Normalize(Import(Export(document)))
  is semantically equivalent to
Normalize(document content + supported document settings)
```

Semantic equivalence includes:

- root text;
- every node text;
- hierarchy;
- sibling order;
- supported layout mode;
- supported shape/palette selection and its fallback behavior.

It excludes IDs, collapse state, viewport, and history in standard Markdown mode.

## 16. Example documents

### 16.1 Minimal

```markdown
# Root
```

### 16.2 Basic tree

```markdown
# Product plan

- Problem
  - User pain
  - Existing alternatives
- Solution
  - Core workflow
  - Differentiation
```

### 16.3 With metadata

```markdown
---
mindmap:
  version: 1
  layout: right
  shape: business
  palette: corporate
  branchColors: single
---

# Interview preparation

- Product sense
- Technical knowledge
- Behavioral stories
```

### 16.4 Escaped content

```markdown
# \# Not another heading

- \- Not another list
- \[Text\] only
```

## 17. Required parser tests

Tests MUST cover:

- Chinese and mixed-language Unicode;
- emoji and combining characters;
- empty root and empty node;
- two-space and four-space indentation;
- tabs and mixed indentation warnings;
- inline formatting stripping;
- links;
- escaped leading markers;
- front-matter defaults and invalid values;
- 100-level depth within limits;
- collapsed local document exporting all descendants;
- exact sibling-order round trip;
- malformed input preserving the active document.
