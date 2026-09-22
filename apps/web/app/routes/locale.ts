import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";
import { isLocale, safeReturnPath, serializeLocaleCookie } from "~/i18n/locale";

/**
 * `POST /locale` — the interface language switcher (ADR 0011, design §3.2).
 *
 * A plain form post rather than client state, so it works without JavaScript and the whole
 * document — `<html lang>` included — re-renders server-side in the new language. The
 * visitor is sent back to the page they were on; `safeReturnPath` keeps that on this site.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  const form = await request.formData();
  const returnTo = safeReturnPath(form.get("returnTo"));
  const requested = form.get("locale");

  // A cross-site form cannot change someone's language: a browser names the posting page's
  // origin, and a foreign one is ignored rather than honoured. Compared against `Host`, not
  // `request.url` — Remix's Vite dev adapter builds the request URL *from* `Origin`, which
  // would make any origin look like our own.
  const origin = request.headers.get("Origin");
  const host = request.headers.get("Host") ?? url.host;
  let foreign = false;
  if (origin !== null && origin !== "null") {
    try {
      foreign = new URL(origin).host !== host;
    } catch {
      foreign = true;
    }
  }

  if (!isLocale(requested) || foreign) {
    return redirect(returnTo, { status: 303 });
  }

  return redirect(returnTo, {
    status: 303,
    headers: { "Set-Cookie": serializeLocaleCookie(requested, url.hostname) }
  });
};

/** Switching is a state change, so a plain visit only goes home. */
export const loader = () => redirect("/");
