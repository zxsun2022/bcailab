import type { EntryContext } from "@remix-run/cloudflare";
import { RemixServer } from "@remix-run/react";
import { renderToReadableStream } from "react-dom/server";
import { LOCALE_VARY } from "~/i18n/locale.server";

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext
) {
  const body = await renderToReadableStream(
    <RemixServer context={remixContext} url={request.url} />,
    {
      signal: request.signal
    }
  );

  responseHeaders.set("Content-Type", "text/html; charset=utf-8");
  // Every document renders in the visitor's interface language, which the cookie and
  // `Accept-Language` decide (ADR 0011). A cache that ignored them would serve one visitor's
  // language to the next.
  responseHeaders.append("Vary", LOCALE_VARY);
  return new Response(body, {
    status: responseStatusCode,
    headers: responseHeaders
  });
}
