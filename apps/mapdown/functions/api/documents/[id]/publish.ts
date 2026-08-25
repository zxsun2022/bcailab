import { randomToken } from "../../../_shared/crypto";
import { getDocument, notFound } from "../../../_shared/documents";
import { ApiError, jsonResponse, readBoundedJson, requireSameOriginMutation, stringParam, withApiErrors } from "../../../_shared/http";
import {
  PUBLICATION_LIMIT,
  PUBLISHED_MARKDOWN_MAX_BYTES,
  PUBLISHED_PNG_MAX_BYTES,
  PUBLISHED_SVG_MAX_BYTES,
  PUBLISHED_VIEW_MAX_BYTES
} from "../../../_shared/limits";
import { requireMapdownUser } from "../../../_shared/session";
import {
  normalizeCloudTitle,
  validatePublishedMarkdown,
  validatePublishedPng,
  validatePublishedSvg,
  validatePublishedView
} from "../../../_shared/validation";

interface ActivePublicationRow {
  public_id: string;
  svg_key: string;
  png_key: string | null;
  view_key: string | null;
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
    PUBLISHED_MARKDOWN_MAX_BYTES + PUBLISHED_SVG_MAX_BYTES + PUBLISHED_VIEW_MAX_BYTES +
      Math.ceil(PUBLISHED_PNG_MAX_BYTES / 3) * 4 + 64 * 1024
  ) as {
    baseVersion?: unknown;
    title?: unknown;
    markdown?: unknown;
    svg?: unknown;
    png?: unknown;
    view?: unknown;
  };
  if (!Number.isInteger(body.baseVersion) || Number(body.baseVersion) !== document.version) {
    throw new ApiError(409, "conflict", "Save the current online version before publishing.", {
      document
    });
  }
  const title = normalizeCloudTitle(body.title);
  const markdown = validatePublishedMarkdown(body.markdown);
  const svg = validatePublishedSvg(body.svg);
  const png = validatePublishedPng(body.png);
  const { json: viewJson } = validatePublishedView(body.view, document.nodeCount);
  const active = await context.env.DB.prepare(`
    SELECT public_id, svg_key, png_key, view_key, version
    FROM mapdown_publications
    WHERE document_id = ? AND user_id = ? AND revoked_at IS NULL
    LIMIT 1
  `).bind(documentId, user.id).first<ActivePublicationRow>();

  const publicId = active?.public_id ?? randomToken(16);
  const publicationVersion = active ? Number(active.version) + 1 : 1;
  const svgKey = `mapdown/publications/${publicId}/v${publicationVersion}.svg`;
  const pngKey = `mapdown/publications/${publicId}/v${publicationVersion}.png`;
  const viewKey = `mapdown/publications/${publicId}/v${publicationVersion}.json`;
  const uploads = await Promise.allSettled([
    context.env.R2.put(svgKey, svg, {
      httpMetadata: { contentType: "image/svg+xml; charset=utf-8" },
      customMetadata: { publicId, version: String(publicationVersion) }
    }),
    context.env.R2.put(pngKey, png, {
      httpMetadata: { contentType: "image/png" },
      customMetadata: { publicId, version: String(publicationVersion) }
    }),
    context.env.R2.put(viewKey, viewJson, {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
      customMetadata: { publicId, version: String(publicationVersion) }
    })
  ]);
  const failedUpload = uploads.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failedUpload) {
    await context.env.R2.delete([svgKey, pngKey, viewKey]);
    throw failedUpload.reason;
  }

  const now = Date.now();
  try {
    if (active) {
      const updated = await context.env.DB.prepare(`
        UPDATE mapdown_publications
        SET title = ?, markdown = ?, svg_key = ?, png_key = ?, view_key = ?, version = ?, updated_at = ?
        WHERE public_id = ? AND document_id = ? AND user_id = ? AND revoked_at IS NULL
      `).bind(title, markdown, svgKey, pngKey, viewKey, publicationVersion, now, publicId, documentId, user.id).run();
      if (Number(updated.meta.changes) !== 1) {
        throw new ApiError(409, "publication_conflict", "The published version changed before this update completed.");
      }
    } else {
      const inserted = await context.env.DB.prepare(`
        INSERT INTO mapdown_publications
          (public_id, document_id, user_id, title, markdown, svg_key, png_key, view_key, version,
           created_at, updated_at, revoked_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL
        WHERE (
          SELECT COUNT(*) FROM mapdown_publications
          WHERE user_id = ? AND revoked_at IS NULL
        ) < ?
      `).bind(
        publicId, documentId, user.id, title, markdown, svgKey, pngKey, viewKey, now, now,
        user.id, PUBLICATION_LIMIT
      ).run();
      if (Number(inserted.meta.changes) !== 1) {
        throw new ApiError(409, "publication_limit", `An account can publish up to ${PUBLICATION_LIMIT} active maps.`);
      }
    }
  } catch (error) {
    await context.env.R2.delete([svgKey, pngKey, viewKey]);
    throw error;
  }
  if (active?.svg_key) {
    context.waitUntil(context.env.R2.delete([
      active.svg_key,
      ...(active.png_key ? [active.png_key] : []),
      ...(active.view_key ? [active.view_key] : [])
    ]));
  }
  return jsonResponse({
    publication: {
      publicId,
      publicUrl: `${context.env.PUBLISHED_ORIGIN}/p/${publicId}`,
      version: publicationVersion,
      updatedAt: now
    }
  }, active ? 200 : 201);
}, context.request);
