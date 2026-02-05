# Text Tool

A lightweight publishing tool that accepts Markdown input and publishes a shareable page.

## Features
- Markdown input (no live preview)
- Publish generates a public URL: `/text/:id`
- Authenticated users can edit or delete their posts
- Max length: 20,000 characters
- Autosize textarea: min-height 120px, max-height 60vh (scrolls internally beyond that)
- Inline character counter and Markdown hint

## Page Structure & UX Rules

| Page | Route | Key behaviour |
|------|-------|---------------|
| Compose | `/text` | Write + Publish. Shows "Your posts" link with count. |
| Posts list | `/text/posts` | View / Edit / Delete per post. Delete requires `confirm()`. |
| Post view | `/text/:id` | Public read. "Copy link" button (with "Copied!" feedback). Edit button visible to owner only. |
| Edit | `/text/:id/edit` | Save changes + Cancel (back to post view). **No Delete button here** — delete lives on the posts list only. |

## Markdown Rendering

- Pipeline: `remark-parse` → `remark-gfm` → `remark-rehype` → `rehype-sanitize` → `rehype-stringify`
- **CRLF normalisation**: input is stripped of `\r` before parsing (`\r\n` → `\n`, `\r` → `\n`). This prevents issues when content is pasted from Windows editors or tools like Obsidian.
- Rendering follows **CommonMark**, not Obsidian-flavoured Markdown. One practical difference: an ordered-list item whose number is not `1` cannot interrupt a paragraph. A blank line before the list is required in that case. Example:

  ```markdown
  <!-- works everywhere -->
  Heading

  8. item eight
  9. item nine

  <!-- breaks in CommonMark (no blank line, number ≠ 1) -->
  Heading
  8. item eight   ← rendered as plain text, not a list
  ```

- Deletion is soft-delete (sets `deleted_at`).
