import { getDocument, notFound } from "../../_shared/documents";
import { ApiError, jsonResponse, readBoundedJson, requireSameOriginMutation, stringParam, withApiErrors } from "../../_shared/http";
import { PRIVATE_SNAPSHOT_MAX_BYTES } from "../../_shared/limits";
import { requireMapdownUser } from "../../_shared/session";
import { validateCloudSnapshot } from "../../_shared/validation";

export const onRequestGet: PagesFunction<Env> = async (context) => withApiErrors(async () => {
  const user = await requireMapdownUser(context.env.DB, context.request);
  const id = stringParam(context.params.id);
  const document = await getDocument(context.env.DB, user.id, id, context.env.PUBLISHED_ORIGIN);
  if (!document) throw notFound();
  return jsonResponse({ document });
}, context.request);

export const onRequestPut: PagesFunction<Env> = async (context) => withApiErrors(async () => {
  requireSameOriginMutation(context.request);
  const user = await requireMapdownUser(context.env.DB, context.request);
  const id = stringParam(context.params.id);
  const body = await readBoundedJson(context.request, PRIVATE_SNAPSHOT_MAX_BYTES + 16 * 1024) as {
    baseVersion?: unknown;
    snapshot?: unknown;
  };
  if (!Number.isInteger(body.baseVersion) || Number(body.baseVersion) < 1) {
    throw new ApiError(400, "version", "The online document version is invalid.");
  }
  const validated = await validateCloudSnapshot(body.snapshot);
  const updatedAt = Date.now();
  const result = await context.env.DB.prepare(`
    UPDATE mapdown_documents
    SET title = ?, snapshot_json = ?, snapshot_digest = ?, node_count = ?,
      version = version + 1, updated_at = ?
    WHERE id = ? AND user_id = ? AND version = ?
  `).bind(
    validated.snapshot.document.title,
    validated.json,
    validated.digest,
    validated.nodeCount,
    updatedAt,
    id,
    user.id,
    Number(body.baseVersion)
  ).run();
  if (Number(result.meta.changes) !== 1) {
    const current = await getDocument(context.env.DB, user.id, id, context.env.PUBLISHED_ORIGIN);
    if (!current) throw notFound();
    throw new ApiError(409, "conflict", "The online copy changed before this save completed.", {
      document: current
    });
  }
  const document = await getDocument(context.env.DB, user.id, id, context.env.PUBLISHED_ORIGIN);
  if (!document) throw new Error("updated document missing");
  return jsonResponse({ document });
}, context.request);

export const onRequestDelete: PagesFunction<Env> = async (context) => withApiErrors(async () => {
  requireSameOriginMutation(context.request);
  const user = await requireMapdownUser(context.env.DB, context.request);
  const id = stringParam(context.params.id);
  const document = await getDocument(context.env.DB, user.id, id, context.env.PUBLISHED_ORIGIN);
  if (!document) throw notFound();
  const publication = await context.env.DB.prepare(`
    SELECT public_id, svg_key FROM mapdown_publications
    WHERE document_id = ? AND user_id = ? AND revoked_at IS NULL
    LIMIT 1
  `).bind(id, user.id).first<{ public_id: string; svg_key: string }>();
  const now = Date.now();
  await context.env.DB.batch([
    context.env.DB.prepare(`
      UPDATE mapdown_publications SET revoked_at = ?, updated_at = ?
      WHERE document_id = ? AND user_id = ? AND revoked_at IS NULL
    `).bind(now, now, id, user.id),
    context.env.DB.prepare("DELETE FROM mapdown_documents WHERE id = ? AND user_id = ?").bind(id, user.id)
  ]);
  if (publication) context.waitUntil(context.env.R2.delete(publication.svg_key));
  return jsonResponse({ ok: true, revokedPublicId: publication?.public_id ?? null });
}, context.request);
