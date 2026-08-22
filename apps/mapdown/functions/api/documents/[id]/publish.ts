import { randomToken } from "../../../_shared/crypto";
import { getDocument, notFound } from "../../../_shared/documents";
import { ApiError, jsonResponse, readBoundedJson, requireSameOriginMutation, stringParam, withApiErrors } from "../../../_shared/http";
import { PUBLICATION_LIMIT, PUBLISHED_MARKDOWN_MAX_BYTES, PUBLISHED_SVG_MAX_BYTES } from "../../../_shared/limits";
import { requireMapdownUser } from "../../../_shared/session";
import { normalizeCloudTitle, validatePublishedMarkdown, validatePublishedSvg } from "../../../_shared/validation";

interface ActivePublicationRow {
  public_id: string;
  svg_key: string;
  version: number;
}

export const onRequestPost: PagesFunction<Env> = async (context) => withApiErrors(async () => {
  requireSameOriginMutation(context.request);
  const user = await requireMapdownUser(context.env.DB, context.request);
  const documentId = stringParam(context.params.id);
  const document = await getDocument(
    context.env.DB,
    user.id,
    documentId,
    context.env.PUBLISHED_ORIGIN
  );
  if (!document) throw notFound();
  const body = await readBoundedJson(
    context.request,
    PUBLISHED_MARKDOWN_MAX_BYTES + PUBLISHED_SVG_MAX_BYTES + 32 * 1024
  ) as { baseVersion?: unknown; title?: unknown; markdown?: unknown; svg?: unknown };
  if (!Number.isInteger(body.baseVersion) || Number(body.baseVersion) !== document.version) {
    throw new ApiError(409, "conflict", "Save the current online version before publishing.", {
      document
    });
  }
  const title = normalizeCloudTitle(body.title);
  const markdown = validatePublishedMarkdown(body.markdown);
  const svg = validatePublishedSvg(body.svg);
  const active = await context.env.DB.prepare(`
    SELECT public_id, svg_key, version
    FROM mapdown_publications
    WHERE document_id = ? AND user_id = ? AND revoked_at IS NULL
    LIMIT 1
  `).bind(documentId, user.id).first<ActivePublicationRow>();

  const publicId = active?.public_id ?? randomToken(16);
  const publicationVersion = active ? Number(active.version) + 1 : 1;
  const svgKey = `mapdown/publications/${publicId}/v${publicationVersion}.svg`;
  await context.env.R2.put(svgKey, svg, {
    httpMetadata: { contentType: "image/svg+xml; charset=utf-8" },
    customMetadata: { publicId, version: String(publicationVersion) }
  });

  const now = Date.now();
  try {
    if (active) {
      const updated = await context.env.DB.prepare(`
        UPDATE mapdown_publications
        SET title = ?, markdown = ?, svg_key = ?, version = ?, updated_at = ?
        WHERE public_id = ? AND document_id = ? AND user_id = ? AND revoked_at IS NULL
      `).bind(title, markdown, svgKey, publicationVersion, now, publicId, documentId, user.id).run();
      if (Number(updated.meta.changes) !== 1) {
        throw new ApiError(409, "publication_conflict", "The published version changed before this update completed.");
      }
    } else {
      const inserted = await context.env.DB.prepare(`
        INSERT INTO mapdown_publications
          (public_id, document_id, user_id, title, markdown, svg_key, version,
           created_at, updated_at, revoked_at)
        SELECT ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL
        WHERE (
          SELECT COUNT(*) FROM mapdown_publications
          WHERE user_id = ? AND revoked_at IS NULL
        ) < ?
      `).bind(
        publicId, documentId, user.id, title, markdown, svgKey, now, now,
        user.id, PUBLICATION_LIMIT
      ).run();
      if (Number(inserted.meta.changes) !== 1) {
        throw new ApiError(409, "publication_limit", `An account can publish up to ${PUBLICATION_LIMIT} active maps.`);
      }
    }
  } catch (error) {
    await context.env.R2.delete(svgKey);
    throw error;
  }
  if (active?.svg_key) context.waitUntil(context.env.R2.delete(active.svg_key));
  return jsonResponse({
    publication: {
      publicId,
      publicUrl: `${context.env.PUBLISHED_ORIGIN}/p/${publicId}`,
      version: publicationVersion,
      updatedAt: now
    }
  }, active ? 200 : 201);
}, context.request);
