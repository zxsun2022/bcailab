# Posts Tool

A lightweight publishing tool that accepts Markdown input and publishes a shareable page.

## Features
- Markdown input (no live preview)
- Publish generates a public URL: `/posts/:id`
- Authenticated users can edit or delete their posts from the main `/posts` workspace
- Max length: 50,000 characters
- Workspace editor uses a taller autosize textarea sized for long-form writing
- Inline character counter and Markdown hint

## Page Structure & UX Rules

| Page | Route | Key behaviour |
|------|-------|---------------|
| Workspace | `/posts` | Write + Publish, plus a left-side history rail. Selecting a history item switches the right pane into in-place editing mode. |
| Post view | `/posts/:id` | Public read. Shows created + last edited dates. "Copy link" button (with "Copied!" feedback). Edit button visible to owner only and returns to `/posts?editing=:id`. |
| Legacy list | `/posts/list` | Redirects to `/posts` for compatibility. |
| Legacy edit | `/posts/:id/edit` | Redirects to `/posts?editing=:id` for compatibility. |

## Legacy Routes

- `/text/*` is preserved for compatibility and redirects to `/posts/*`.

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
