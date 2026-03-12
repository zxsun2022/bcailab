import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import {
  getWritingArticleById,
  getLatestWritingRevision
} from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import type { WritingFeedback } from "~/utils/writing-eval.server";

export const loader = async ({ request, context, params }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const articleId = params.id;
  if (!articleId) throw new Response("Not found", { status: 404 });

  const article = await getWritingArticleById(context.env.DB, articleId, { includeDeleted: true });
  if (!article || article.user_id !== user.id || article.deleted_at) {
    throw new Response("Not found", { status: 404 });
  }

  const latest = await getLatestWritingRevision(context.env.DB, articleId);
  if (!latest) {
    return json({ feedbackStatus: "none" as const, feedback: null });
  }

  let feedback: WritingFeedback | null = null;
  if (latest.feedback_json) {
    try {
      feedback = JSON.parse(latest.feedback_json) as WritingFeedback;
    } catch {
      feedback = null;
    }
  }

  return json({
    feedbackStatus: latest.feedback_status,
    feedback,
    roundNumber: latest.round_number,
    bandEstimate: feedback?.round_summary?.band_estimate ?? null
  });
};
