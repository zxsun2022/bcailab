import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDictationAttemptById } from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import type { DictationFeedback } from "~/utils/dictation-feedback.server";

/**
 * Poll target for the summary page's feedback panel.
 *
 * `feedback_json` is filled by a background `waitUntil` task after the attempt is
 * stored, so the summary starts with an empty slot and polls until it fills.
 * Attempts belong to signed-in users only, hence `requireUser`.
 */
export const loader = async ({ request, context, params }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const attemptId = params.attemptId;
  if (!attemptId) throw new Response("Not found", { status: 404 });

  const attempt = await getDictationAttemptById(context.env.DB, {
    id: attemptId,
    userId: user.id
  });
  if (!attempt) throw new Response("Not found", { status: 404 });

  let feedback: DictationFeedback | null = null;
  if (attempt.feedback_json) {
    try {
      feedback = JSON.parse(attempt.feedback_json) as DictationFeedback;
    } catch {
      feedback = null;
    }
  }

  return json({ ready: Boolean(feedback), feedback });
};
