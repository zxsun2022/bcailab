# Architecture Overview

bcailab is a small tools platform running on Cloudflare. A shared auth system gives users a consistent login experience across tools while each tool can keep isolated data and logic.

## Components
- **Remix app** (`apps/web`): Landing page, auth flows, tool UIs.
- **Shared packages** (`packages/*`): UI primitives, auth helpers, D1 access helpers.
- **D1**: Primary relational store for users, sessions, and tool data.
- **R2**: Private binary storage for generated tool assets (currently Speech MP3 files).

## Design System
See [design-system.md](./design-system.md) for visual design guidelines including:
- Color palette, typography, spacing
- Border radius system (coordinated with serif fonts)
- Component patterns and usage examples

## Key Flows
- Google OAuth handled in the Remix app; sessions are stored in D1 and referenced by a secure cookie.
- Tools are protected behind login; public pages are selectively accessible (e.g. published post pages).

## Routing
- `/` landing page
- `/about` about page
- `/auth/google`, `/auth/callback`, `/logout` auth endpoints
- `/posts` posts tool (compose)
- `/posts/list` user's posts list
- `/posts/:id` public post view
- `/posts/:id/edit` edit UI (route file uses `_` to escape nesting: `posts.$id_.edit.tsx`)
- `/tts` speech tool (generate)
- `/tts/history` user's speech generation history
- `/tts/audio/:id` authenticated audio stream/download endpoint
- `/esl` ESL tool home
- `/esl/reading` ESL reading/recitation passage list + creation
- `/esl/reading/:id` ESL reading/recitation practice page
- `/esl/audio/:id` authenticated ESL attempt audio stream/download endpoint
- Legacy compatibility: `/text/*` redirects to the corresponding `/posts/*` route
