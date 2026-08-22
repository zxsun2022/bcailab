import { isPublishedRequest, notFoundPage, publicHeaders } from "../../_shared/public-page";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  if (!isPublishedRequest(context.request, context.env)) return notFoundPage();
  const publicId = typeof context.params.publicId === "string" ? context.params.publicId : "";
  const publication = await context.env.DB.prepare(`
    SELECT svg_key FROM mapdown_publications
    WHERE public_id = ? AND revoked_at IS NULL
    LIMIT 1
  `).bind(publicId).first<{ svg_key: string }>();
  if (!publication) return notFoundPage();
  const object = await context.env.R2.get(publication.svg_key);
  if (!object) return notFoundPage();
  const headers = publicHeaders("image/svg+xml; charset=utf-8");
  headers.set("Content-Security-Policy", "default-src 'none'; style-src 'none'; sandbox");
  return new Response(object.body, { headers });
};
