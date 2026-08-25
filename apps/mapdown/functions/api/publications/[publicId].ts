import { ApiError, jsonResponse, stringParam, withApiErrors } from "../../_shared/http";

function missing(): ApiError {
  return new ApiError(404, "not_found", "This public map is not available.");
}

/**
 * The read side of **Make a copy** (D-33).
 *
 * It lives on the editor origin, not the published one, because the copy has to end up in the
 * reader's own browser and eventually — by their own explicit action — in their own account.
 * Giving `share.bcailab.com` any path that leads there would undo the reason D-29 put published
 * content on a cookie-free host.
 *
 * Unauthenticated and read-only by construction: it takes an exact public id, returns the same
 * frozen view snapshot the published page already serves, and exposes no author identity, no
 * document id and no publication list. A revoked publication and an id that never existed are
 * the same 404, so this cannot be used to probe which links once existed (D-30).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => withApiErrors(async () => {
  const publicId = stringParam(context.params.publicId);
  const publication = await context.env.DB.prepare(`
    SELECT title, view_key
    FROM mapdown_publications
    WHERE public_id = ? AND revoked_at IS NULL
    LIMIT 1
  `).bind(publicId).first<{ title: string; view_key: string | null }>();
  if (!publication?.view_key) throw missing();
  const object = await context.env.R2.get(publication.view_key);
  if (!object) throw missing();
  const view = await object.json();
  // `jsonResponse` already sends `private, no-store`; a cached copy would outlive an unpublish.
  return jsonResponse({ title: publication.title, view });
}, context.request);
