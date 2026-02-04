# Text Tool

A lightweight publishing tool that accepts Markdown input and publishes a shareable page.

## Features
- Markdown input (no live preview)
- Publish generates a public URL: `/text/:id`
- Authenticated users can edit or delete their posts

## Notes
- Markdown rendering uses `remark` + `rehype` with sanitization.
- Deletion is soft-delete (sets `deleted_at`).
