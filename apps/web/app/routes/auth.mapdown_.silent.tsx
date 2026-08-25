import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getOptionalUser } from "~/utils/auth.server";
import { requireEnv } from "~/utils/env.server";
import { allowedMapdownOrigin, createMapdownHandoff } from "~/utils/mapdown-handoff.server";

const scriptValue = (value: string | null): string => JSON.stringify(value).replace(/</g, "\\u003c");

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const audience = allowedMapdownOrigin(
    url.searchParams.get("origin"),
    context.env.MAPDOWN_PREVIEW_ORIGIN
  );
  if (!audience) return new Response("Invalid Mapdown origin.", { status: 400 });

  const user = await getOptionalUser(request, context);
  let token: string | null = null;
  if (user) {
    const handoff = await createMapdownHandoff({
      secret: requireEnv(context.env, "MAPDOWN_HANDOFF_SECRET"),
      userId: user.id,
      audience,
      previewOrigin: context.env.MAPDOWN_PREVIEW_ORIGIN
    });
    const now = Date.now();
    await context.env.DB.prepare(`
      INSERT INTO mapdown_handoff_nonces
        (nonce_hash, user_id, audience, created_at, expires_at, consumed_at)
      VALUES (?, ?, ?, ?, ?, NULL)
    `).bind(handoff.nonceHash, user.id, audience, now, handoff.expiresAt).run();
    token = handoff.token;
  }

  const scriptNonce = crypto.randomUUID().replace(/-/g, "");
  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><meta name="referrer" content="no-referrer" /><title>Mapdown sign-in check</title></head>
  <body>
    <script nonce="${scriptNonce}">
      window.parent.postMessage(
        { type: "mapdown-silent-auth", token: ${scriptValue(token)} },
        ${scriptValue(audience)}
      );
    </script>
  </body>
</html>`;
  return new Response(html, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${scriptNonce}'; style-src 'none'; base-uri 'none'; frame-ancestors ${audience}`,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff"
    }
  });
};
