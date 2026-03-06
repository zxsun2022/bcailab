import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import {
  getEslPassageById,
  getEslReadingAttemptById,
  getLatestEslReadingEvaluationByAttemptId
} from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import {
  deriveEslAttemptEvaluationState,
  parseEslReadingEvaluationOutput
} from "~/utils/esl-reading";
import { buildReferenceFallbackR2Key } from "~/utils/esl-passage-reference.server";

export const loader = async ({ request, context, params }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const passageId = params.id;
  if (!passageId) {
    throw new Response("Not found", { status: 404 });
  }

  const passage = await getEslPassageById(context.env.DB, passageId, { includeDeleted: true });
  if (!passage || passage.user_id !== user.id || passage.deleted_at) {
    throw new Response("Not found", { status: 404 });
  }

  const fallbackReferenceKey = buildReferenceFallbackR2Key(user.id, passage.id);
  const hasFallbackReference =
    passage.reference_tts_status !== "completed" || !passage.reference_tts_r2_key
      ? Boolean(await context.env.R2.head(fallbackReferenceKey).catch(() => null))
      : false;

  const url = new URL(request.url);
  const attemptId = url.searchParams.get("attempt");
  const attempt = attemptId
    ? await getEslReadingAttemptById(context.env.DB, attemptId, { includeDeleted: true })
    : null;

  const ownsAttempt =
    attempt &&
    attempt.user_id === user.id &&
    attempt.passage_id === passage.id &&
    !attempt.deleted_at;
  const evaluation = ownsAttempt
    ? await getLatestEslReadingEvaluationByAttemptId(context.env.DB, attempt.id)
    : null;
  const parsed = evaluation ? parseEslReadingEvaluationOutput(evaluation.output_json) : null;
  const effective = ownsAttempt
    ? deriveEslAttemptEvaluationState({
        storedStatus: attempt.evaluation_status,
        hasEvaluation: Boolean(parsed),
        createdAt: attempt.created_at
      })
    : null;

  return json({
    referenceStatus:
      passage.reference_tts_status === "completed" ||
      passage.reference_tts_status === "pending" ||
      passage.reference_tts_status === "failed"
        ? passage.reference_tts_status
        : hasFallbackReference
          ? "completed"
          : null,
    hasReferenceAudio:
      (passage.reference_tts_status === "completed" && Boolean(passage.reference_tts_r2_key)) ||
      hasFallbackReference,
    evaluationStatus: effective?.status ?? null,
    hasEvaluation: Boolean(parsed),
    isStalePending: Boolean(effective?.isStalePending)
  });
};
