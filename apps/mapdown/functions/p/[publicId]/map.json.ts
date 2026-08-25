import { isPublishedRequest, notFoundPage, publicHeaders } from "../../_shared/public-page";

/**
 * The public view snapshot behind the live viewer (D-32).
 *
 * D1 remains the serving authority, exactly as it is for the SVG: the row is checked first, so
 * unpublish revokes this asset in the same request that revokes the page, and an orphaned R2
 * object cannot keep serving a map that was taken down. `publicHeaders` carries `no-store`, so
 * there is no cache to outlive the revocation.
 *
 * A publication frozen before this column existed has no `view_key` and returns 404 here. That
 * is not an error path — the page reads it as "no live view available" and keeps the frozen
 * image it was already showing.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  if (!isPublishedRequest(context.request, context.env)) return notFoundPage();
  const publicId = typeof context.params.publicId === "string" ? context.params.publicId : "";
  const publication = await context.env.DB.prepare(`
    SELECT view_key FROM mapdown_publications
    WHERE public_id = ? AND revoked_at IS NULL
    LIMIT 1
  `).bind(publicId).first<{ view_key: string | null }>();
  if (!publication?.view_key) return notFoundPage();
  const object = await context.env.R2.get(publication.view_key);
  if (!object) return notFoundPage();
  return new Response(object.body, { headers: publicHeaders("application/json; charset=utf-8") });
};
