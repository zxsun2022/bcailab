import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { handleOAuthCallback } from "@bcailab/auth";
import { getAuthEnv } from "~/utils/auth-env.server";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderHtml = (message: string, origin: string, ok: boolean) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>bcailab auth</title>
    <style>
      body { font-family: 'Crimson Pro', serif; padding: 32px; background: #fafafa; color: #1a1a1a; }
      .card { background: #fff; border-radius: 18px; padding: 24px; box-shadow: 0 18px 40px -24px rgba(15,23,42,0.2); }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>${ok ? "Signed in" : "Auth error"}</h2>
      <p>${escapeHtml(message)}</p>
      <p>You can close this window.</p>
    </div>
    <script>
      (function() {
        try {
          if (window.opener) {
            window.opener.postMessage({ type: 'bcailab-auth', ok: ${ok} }, '${origin}');
          }
        } catch (err) {
          console.error(err);
        }
        window.close();
      })();
    </script>
  </body>
</html>`;

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const authEnv = getAuthEnv(context.env);
  const result = await handleOAuthCallback(request, authEnv, context.env.DB);
  const origin = new URL(request.url).origin;

  const html = result.ok
    ? renderHtml("Welcome back to bcailab.", origin, true)
    : renderHtml(result.error ?? "Authentication failed.", origin, false);

  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8"
  });

  if (result.headers) {
    for (const [key, value] of result.headers.entries()) {
      headers.append(key, value);
    }
  }

  return new Response(html, { headers, status: result.ok ? 200 : 400 });
};
