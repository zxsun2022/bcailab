import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";
import { getOptionalUser } from "~/utils/auth.server";
import { requireEnv } from "~/utils/env.server";
import { allowedMapdownOrigin, createMapdownHandoff } from "~/utils/mapdown-handoff.server";

const escapeHtml = (value: string): string => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const scriptValue = (value: string): string => JSON.stringify(value).replace(/</g, "\\u003c");

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const audience = allowedMapdownOrigin(url.searchParams.get("origin"));
  if (!audience) return new Response("Invalid Mapdown origin.", { status: 400 });

  const user = await getOptionalUser(request, context);
  if (!user) {
    const login = new URL("/login", url.origin);
    login.searchParams.set("handoff", "mapdown");
    login.searchParams.set("origin", audience);
    throw redirect(`${login.pathname}${login.search}`);
  }

  const handoff = await createMapdownHandoff({
    secret: requireEnv(context.env, "MAPDOWN_HANDOFF_SECRET"),
    userId: user.id,
    audience
  });
  const now = Date.now();
  await context.env.DB.prepare(`
    INSERT INTO mapdown_handoff_nonces
      (nonce_hash, user_id, audience, created_at, expires_at, consumed_at)
    VALUES (?, ?, ?, ?, ?, NULL)
  `).bind(handoff.nonceHash, user.id, audience, now, handoff.expiresAt).run();

  const scriptNonce = crypto.randomUUID().replace(/-/g, "");
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="referrer" content="no-referrer" />
    <title>Connect Mapdown</title>
  </head>
  <body>
    <main>
      <h1>Connecting Mapdown</h1>
      <p>${escapeHtml(user.email ?? "Your account")} is signed in. This window will close automatically.</p>
    </main>
    <script nonce="${scriptNonce}">
      (() => {
        if (!window.opener) return;
        window.opener.postMessage(
          { type: "mapdown-auth", token: ${scriptValue(handoff.token)} },
          ${scriptValue(audience)}
        );
        window.close();
      })();
    </script>
  </body>
</html>`;
  return new Response(html, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${scriptNonce}'; style-src 'none'; base-uri 'none'; frame-ancestors 'none'`,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff"
    }
  });
};
