# Access Model — What Works Without an Account

How a signed-out visitor experiences the studio. This is cross-cutting product behaviour: it
spans the homepage, `/english`, and every tool, and it is the mechanism behind the product
strategy that Translate and Dictation are acquisition funnels
([ADR 0002](decisions/0002-translate-stays-inside-english-studio.md)).

Moved out of `AGENTS.md` on 2026-08-01 — it describes feature behaviour rather than a working
rule, and a hand-maintained list of which modules are public is exactly the kind of fact that
goes stale inside an operating contract. **The registry in `english.tsx` is authoritative**;
the module names below are illustrative of the shape, not a specification of the list.

## Three access tiers

Every module declares its tier in the shared registry (`english-modules.ts`, surfaced as the
`access: public | trial | auth` field). The three behave differently for a signed-out visitor:

**`public`** — currently Translate and Dictation. Cards link straight into the tool. No popup.
Translate's `/translate/saved` and `/translate/saved/:id` subroutes are authenticated private
workspaces; only the translation surface itself remains public.
The tool handles anonymous users itself via daily quotas. **These are the acquisition funnels;
do not gate them behind the popup.**

**`trial`** — currently Reading and Writing, which declare a `trialSlug`. Signed-out visitors go
to an anonymous trial route instead of the popup. Trial routes:

- escape their tool's auth-required layout using the `_` route-name prefix
  (`reading_.trial.tsx`, `writing_.trial.tsx`);
- persist **nothing**;
- enforce their own daily quota via `feature-quota.server.ts`.

The login popup appears from *inside* the trial, once that quota is spent. A signed-in user who
hits a trial route is redirected to the real tool.

**`auth`** — clicking the card when signed out opens the Google OAuth popup **directly**. It
does not navigate to the tool page first. This applies to auth-required module cards on
`/english` and to auth-required product cards on the homepage, such as Posts.

## Surfaces

The homepage is a studio page: product cards link to landing pages. `/english` is public and
serves as the product landing page for signed-out visitors; signed-in visitors are redirected
to `/english/home`.

## OAuth flow

Popup-based, with no standalone login page:

`window.open("/auth/google", …)` → callback posts a message → parent reloads.

The popup helper lives in `apps/web/app/utils/login-popup.ts`, and it is the same popup the
Header login button uses.

## Mapdown

Mapdown's editor and local document library remain fully usable without an account or network.
Opening the library and signing in do not upload map content. **Save online** is an explicit
per-document action; **Publish** is explicit, requires an account and first saves the selected
document online. Public frozen snapshots are readable without an account at unlisted
`share.bcailab.com` URLs.

Mapdown does not receive `bcailab_session`. Its popup returns a 60-second, audience-bound,
single-use handoff from the signed-in Web app, which Mapdown exchanges for an independent
Host-only `mapdown_session`. Signing out of Mapdown removes that session but leaves every local
IndexedDB document unchanged.

## Related

- `docs/roadmap.md` — "Free entry points made explicit" is the presentation half of this
  model: making visible to a visitor what is usable without an account.
- `docs/tools/` — per-tool quota numbers and trial behaviour.
