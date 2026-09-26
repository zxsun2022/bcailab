import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getWritingArticleById } from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { getRequestTranslator } from "~/i18n/locale.server";
import { PracticeError, type PracticeView } from "~/utils/writing-practice";
import {
  answerPractice,
  beginTransferStep,
  endPracticeItem,
  PracticeConflictError,
  startPractice
} from "~/utils/writing-practice.server";

export type PracticeActionData = { item?: PracticeView; error?: string };

/**
 * Targeted practice after Writing feedback. POST only; every intent returns the item as the
 * learner may see it. A model failure returns an error and changes nothing, so the page keeps the
 * learner's text and can simply try again.
 */
export const action = async ({ request, context, params }: ActionFunctionArgs) => {
  const user = await requireUser(request, context);
  const articleId = params.id;
  if (!articleId) throw new Response("Not found", { status: 404 });
  const article = await getWritingArticleById(context.env.DB, articleId, { includeDeleted: true });
  if (!article || article.user_id !== user.id || article.deleted_at) {
    throw new Response("Not found", { status: 404 });
  }

  const t = getRequestTranslator(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const itemId = String(form.get("itemId") ?? "");
  const base = { userId: user.id, articleId: article.id };

  try {
    let item: PracticeView;
    if (intent === "start") {
      item = await startPractice(context.env.DB, {
        ...base,
        revisionId: String(form.get("revisionId") ?? ""),
        annotationIndex: Number(form.get("annotationIndex")),
        language: form.get("feedbackLanguage") === "zh" ? "zh" : "en"
      });
    } else if (intent === "answer") {
      item = await answerPractice(context.env, { ...base, itemId, answer: String(form.get("answer") ?? "") });
    } else if (intent === "transfer") {
      item = await beginTransferStep(context.env, { ...base, itemId });
    } else if (intent === "skip" || intent === "dispute") {
      item = await endPracticeItem(context.env.DB, {
        ...base,
        itemId,
        outcome: intent === "skip" ? "skipped" : "disputed"
      });
    } else {
      return json<PracticeActionData>({ error: t("writing.error.unsupported") }, { status: 400 });
    }
    return json<PracticeActionData>({ item });
  } catch (error) {
    if (error instanceof PracticeConflictError) {
      return json<PracticeActionData>({ error: t("writingPractice.error.conflict") }, { status: 409 });
    }
    if (error instanceof PracticeError && error.code === "invalid_answer") {
      return json<PracticeActionData>({ error: t("writingPractice.error.answer") }, { status: 400 });
    }
    if (error instanceof PracticeError && error.code === "invalid_state") {
      return json<PracticeActionData>({ error: t("writingPractice.error.state") }, { status: 409 });
    }
    // Counts and ids only: never the learner's text or the model's output.
    console.error("writing.practice.action failed", {
      intent,
      itemId: itemId || null,
      errorClass: error instanceof Error ? error.name : "unknown"
    });
    return json<PracticeActionData>({ error: t("writingPractice.error.model") }, { status: 502 });
  }
};
