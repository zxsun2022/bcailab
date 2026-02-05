# Architecture Overview

bcailab is a small tools platform running on Cloudflare. A shared auth system gives users a consistent login experience across tools while each tool can keep isolated data and logic.

## Components
- **Remix app** (`apps/web`): Landing page, auth flows, tool UIs.
- **Shared packages** (`packages/*`): UI primitives, auth helpers, D1 access helpers.
- **D1**: Primary relational store for users, sessions, and tool data.
- **R2**: Reserved for future asset storage.

## Design System
See [design-system.md](./design-system.md) for visual design guidelines including:
- Color palette, typography, spacing
- Border radius system (coordinated with serif fonts)
- Component patterns and usage examples

## Key Flows
- Google OAuth handled in the Remix app; sessions are stored in D1 and referenced by a secure cookie.
- Tools are protected behind login; public pages are selectively accessible (e.g. published text pages).

## Routing
- `/` landing page
- `/about` about page
- `/auth/google`, `/auth/callback`, `/logout` auth endpoints
- `/text` text tool (compose)
- `/text/posts` user's posts list
- `/text/:id` public text view
- `/text/:id/edit` edit UI (route file uses `_` to escape nesting: `text.$id_.edit.tsx`)
