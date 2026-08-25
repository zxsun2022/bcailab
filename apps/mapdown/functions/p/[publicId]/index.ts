import { isPublishedRequest, notFoundPage, publicHeaders } from "../../_shared/public-page";
import { publishedPageHtml } from "../../_shared/published-page-html";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  if (!isPublishedRequest(context.request, context.env)) return notFoundPage();
  const publicId = typeof context.params.publicId === "string" ? context.params.publicId : "";
  const publication = await context.env.DB.prepare(`
    SELECT title, version, updated_at, png_key
    FROM mapdown_publications
    WHERE public_id = ? AND revoked_at IS NULL
    LIMIT 1
  `).bind(publicId).first<{ title: string; version: number; updated_at: number; png_key: string | null }>();
  if (!publication) return notFoundPage();

  const html = publishedPageHtml({
    publicId,
    title: publication.title,
    version: Number(publication.version),
    hasPngPreview: Boolean(publication.png_key),
    publishedOrigin: context.env.PUBLISHED_ORIGIN,
    mapdownOrigin: context.env.MAPDOWN_ORIGIN,
    pathname: new URL(context.request.url).pathname
  });
  return new Response(html, { headers: publicHeaders() });
};
