import { isPublishedRequest, notFoundPage, publicHeaders } from "../../_shared/public-page";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  if (!isPublishedRequest(context.request, context.env)) return notFoundPage();
  const publicId = typeof context.params.publicId === "string" ? context.params.publicId : "";
  const publication = await context.env.DB.prepare(`
    SELECT png_key FROM mapdown_publications
    WHERE public_id = ? AND revoked_at IS NULL
    LIMIT 1
  `).bind(publicId).first<{ png_key: string | null }>();
  if (!publication?.png_key) return notFoundPage();
  const object = await context.env.R2.get(publication.png_key);
  if (!object) return notFoundPage();
  return new Response(object.body, { headers: publicHeaders("image/png") });
};
