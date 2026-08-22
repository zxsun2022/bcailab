import { findDocumentByClientId, listDocuments, withoutSnapshotDigest } from "../../_shared/documents";
import { ApiError, jsonResponse, readBoundedJson, requireSameOriginMutation, withApiErrors } from "../../_shared/http";
import { CLOUD_DOCUMENT_LIMIT, PRIVATE_SNAPSHOT_MAX_BYTES } from "../../_shared/limits";
import { requireMapdownUser } from "../../_shared/session";
import { validateCloudSnapshot } from "../../_shared/validation";

export const onRequestGet: PagesFunction<Env> = async (context) => withApiErrors(async () => {
  const user = await requireMapdownUser(context.env.DB, context.request);
  return jsonResponse({ documents: await listDocuments(context.env.DB, user.id, context.env.PUBLISHED_ORIGIN) });
}, context.request);

export const onRequestPost: PagesFunction<Env> = async (context) => withApiErrors(async () => {
  requireSameOriginMutation(context.request);
  const user = await requireMapdownUser(context.env.DB, context.request);
  const body = await readBoundedJson(context.request, PRIVATE_SNAPSHOT_MAX_BYTES + 16 * 1024) as {
    clientDocumentId?: unknown;
    snapshot?: unknown;
  };
  if (typeof body.clientDocumentId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(body.clientDocumentId)) {
    throw new ApiError(400, "client_document_id", "The local document id is invalid.");
  }
  const validated = await validateCloudSnapshot(body.snapshot);
  if (validated.snapshot.document.id !== body.clientDocumentId) {
    throw new ApiError(400, "client_document_id", "The local document id does not match the snapshot.");
  }
  const existing = await findDocumentByClientId(
    context.env.DB,
    user.id,
    body.clientDocumentId,
    context.env.PUBLISHED_ORIGIN
  );
  if (existing) {
    if (existing.snapshotDigest === validated.digest) {
      return jsonResponse({ document: withoutSnapshotDigest(existing) });
    }
    throw new ApiError(409, "conflict", "A different online version already exists for this local map.", {
      document: withoutSnapshotDigest(existing)
    });
  }
  const id = crypto.randomUUID();
  const now = Date.now();
  let inserted: D1Result;
  try {
    inserted = await context.env.DB.prepare(`
      INSERT INTO mapdown_documents
        (id, user_id, client_document_id, title, snapshot_json, snapshot_digest,
         node_count, version, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, 1, ?, ?
      WHERE (SELECT COUNT(*) FROM mapdown_documents WHERE user_id = ?) < ?
    `).bind(
      id,
      user.id,
      body.clientDocumentId,
      validated.snapshot.document.title,
      validated.json,
      validated.digest,
      validated.nodeCount,
      now,
      now,
      user.id,
      CLOUD_DOCUMENT_LIMIT
    ).run();
  } catch (error) {
    const raced = await findDocumentByClientId(
      context.env.DB,
      user.id,
      body.clientDocumentId,
      context.env.PUBLISHED_ORIGIN
    );
    if (!raced) throw error;
    if (raced.snapshotDigest === validated.digest) {
      return jsonResponse({ document: withoutSnapshotDigest(raced) });
    }
    throw new ApiError(409, "conflict", "A different online version already exists for this local map.", {
      document: withoutSnapshotDigest(raced)
    });
  }
  if (Number(inserted.meta.changes) !== 1) {
    throw new ApiError(409, "document_limit", `An account can save up to ${CLOUD_DOCUMENT_LIMIT} Mapdown documents online.`);
  }
  const created = await findDocumentByClientId(
    context.env.DB,
    user.id,
    body.clientDocumentId,
    context.env.PUBLISHED_ORIGIN
  );
  if (!created) throw new Error("created document missing");
  return jsonResponse({ document: withoutSnapshotDigest(created) }, 201);
}, context.request);
