import { notFound } from "../../../_shared/documents";
import { jsonResponse, requireSameOriginMutation, stringParam, withApiErrors } from "../../../_shared/http";
import { requireMapdownUser } from "../../../_shared/session";

export const onRequestPost: PagesFunction<Env> = async (context) => withApiErrors(async () => {
  requireSameOriginMutation(context.request);
  const user = await requireMapdownUser(context.env.DB, context.request);
  const documentId = stringParam(context.params.id);
  const active = await context.env.DB.prepare(`
    SELECT public_id, svg_key FROM mapdown_publications
    WHERE document_id = ? AND user_id = ? AND revoked_at IS NULL
    LIMIT 1
  `).bind(documentId, user.id).first<{ public_id: string; svg_key: string }>();
  if (!active) throw notFound();
  const now = Date.now();
  const result = await context.env.DB.prepare(`
    UPDATE mapdown_publications
    SET revoked_at = ?, updated_at = ?
    WHERE public_id = ? AND document_id = ? AND user_id = ? AND revoked_at IS NULL
  `).bind(now, now, active.public_id, documentId, user.id).run();
  if (Number(result.meta.changes) !== 1) throw notFound();
  context.waitUntil(context.env.R2.delete(active.svg_key));
  return jsonResponse({ ok: true, publicId: active.public_id });
}, context.request);
