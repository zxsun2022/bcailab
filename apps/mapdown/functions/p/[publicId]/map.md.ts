import { isPublishedRequest, notFoundPage, publicHeaders } from "../../_shared/public-page";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  if (!isPublishedRequest(context.request, context.env)) return notFoundPage();
  const publicId = typeof context.params.publicId === "string" ? context.params.publicId : "";
  const publication = await context.env.DB.prepare(`
    SELECT title, markdown FROM mapdown_publications
    WHERE public_id = ? AND revoked_at IS NULL
    LIMIT 1
  `).bind(publicId).first<{ title: string; markdown: string }>();
  if (!publication) return notFoundPage();
  const filename = publication.title.replace(/[^\p{L}\p{N}._ -]+/gu, "").trim().slice(0, 80) || "mapdown";
  const headers = publicHeaders("text/markdown; charset=utf-8");
  headers.set("Content-Disposition", `attachment; filename="${filename.replace(/"/g, "")}.md"`);
  return new Response(publication.markdown, { headers });
};
