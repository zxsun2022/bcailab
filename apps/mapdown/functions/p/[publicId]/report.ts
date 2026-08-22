import { keyedDigest } from "../../_shared/crypto";
import { REPORT_DETAILS_MAX_CODE_POINTS, REPORTS_PER_DAY, REPORT_WINDOW_MS } from "../../_shared/limits";
import { isPublishedRequest, messagePage, notFoundPage } from "../../_shared/public-page";

const REASONS = new Set(["spam", "harassment", "copyright", "other"]);

export const onRequestPost: PagesFunction<Env> = async (context) => {
  if (!isPublishedRequest(context.request, context.env)) return notFoundPage();
  const publicId = typeof context.params.publicId === "string" ? context.params.publicId : "";
  const publication = await context.env.DB.prepare(`
    SELECT public_id FROM mapdown_publications
    WHERE public_id = ? AND revoked_at IS NULL
    LIMIT 1
  `).bind(publicId).first();
  if (!publication) return notFoundPage();
  const length = Number(context.request.headers.get("Content-Length"));
  if (Number.isFinite(length) && length > 4 * 1024) {
    return messagePage("Report not sent", "The report is too large.", 413);
  }
  const contentType = context.request.headers.get("Content-Type") ?? "";
  if (!contentType.startsWith("application/x-www-form-urlencoded") &&
      !contentType.startsWith("multipart/form-data")) {
    return messagePage("Report not sent", "The report form is invalid.", 415);
  }
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return messagePage("Report not sent", "The report form is invalid.", 400);
  }
  if (String(form.get("website") ?? "")) return messagePage("Report received", "Thank you. The report was recorded.");
  const reason = String(form.get("reason") ?? "");
  const details = String(form.get("details") ?? "").trim();
  if (!REASONS.has(reason) || [...details].length > REPORT_DETAILS_MAX_CODE_POINTS) {
    return messagePage("Report not sent", "Choose a valid reason and keep details to 500 characters.", 400);
  }
  const ip = context.request.headers.get("CF-Connecting-IP") ?? "unknown";
  const reporterDigest = await keyedDigest(
    context.env.MAPDOWN_HANDOFF_SECRET,
    "bcailab:mapdown-report:v1",
    ip
  );
  const now = Date.now();
  const inserted = await context.env.DB.prepare(`
    INSERT INTO mapdown_publication_reports
      (id, public_id, reporter_digest, reason, details, created_at, status)
    SELECT ?, ?, ?, ?, ?, ?, 'open'
    WHERE (
      SELECT COUNT(*) FROM mapdown_publication_reports
      WHERE public_id = ? AND reporter_digest = ? AND created_at >= ?
    ) < ?
  `).bind(
    crypto.randomUUID(), publicId, reporterDigest, reason, details, now,
    publicId, reporterDigest, now - REPORT_WINDOW_MS, REPORTS_PER_DAY
  ).run();
  if (Number(inserted.meta.changes) !== 1) {
    return messagePage("Report limit reached", "This browser has already sent the allowed reports for this map today.", 429);
  }
  return messagePage("Report received", "Thank you. The report was recorded.");
};
