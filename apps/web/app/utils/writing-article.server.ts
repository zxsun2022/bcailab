import type { AppLoadContext } from "@remix-run/cloudflare";
import {
  beginWritingRevisionFeedbackRetry,
  createWritingArticleWithFirstRevision as createWritingArticleBatch,
  createWritingRevision,
  getWritingArticleById,
  listWritingRevisionsByArticle,
  updateWritingArticleTitle,
  updateWritingRevisionFeedback,
  touchWritingArticle
} from "@bcailab/db";
import type { WritingAssignmentSnapshot } from "@bcailab/db";
import {
  evaluateWriting,
  generateArticleTitle,
  type WritingFeedback
} from "~/utils/writing-eval.server";

export const countWords = (text: string): number =>
  text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

const scheduleWritingTask = async (
  context: AppLoadContext,
  task: Promise<unknown>
): Promise<void> => {
  if (context.ctx?.waitUntil) {
    context.ctx.waitUntil(task);
    return;
  }

  await task;
};

const parseAssignmentSnapshot = (value: string | null): WritingAssignmentSnapshot | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as WritingAssignmentSnapshot;
    return parsed?.schemaVersion === 1 ? parsed : null;
  } catch {
    return null;
  }
};

const scheduleEvaluation = async (
  context: AppLoadContext,
  input: {
    userId: string;
    revisionId: string;
    generation: number;
    agentType: string;
    userText: string;
    wordCount: number;
    feedbackLanguage: "en" | "zh";
    previousRound: Parameters<typeof evaluateWriting>[0]["previousRound"];
    historyScores: Array<{ round: number; assessment: string }>;
    topic?: string;
    assignment?: WritingAssignmentSnapshot | null;
  }
) => {
  await scheduleWritingTask(
    context,
    (async () => {
      try {
        const { modelName, feedback } = await evaluateWriting({
          env: context.env,
          agentType: input.agentType,
          userText: input.userText,
          wordCount: input.wordCount,
          feedbackLanguage: input.feedbackLanguage,
          previousRound: input.previousRound,
          historyScores: input.historyScores,
          topic: input.topic,
          assignment: input.assignment
        });
        await updateWritingRevisionFeedback(context.env.DB, {
          id: input.revisionId,
          userId: input.userId,
          generation: input.generation,
          feedbackJson: JSON.stringify(feedback),
          feedbackStatus: "completed",
          modelName
        });
      } catch {
        await updateWritingRevisionFeedback(context.env.DB, {
          id: input.revisionId,
          userId: input.userId,
          generation: input.generation,
          feedbackJson: null,
          feedbackStatus: "failed",
          modelName: "error"
        });
      }
    })()
  );
};

export const createArticleWithFirstRevision = async (
  context: AppLoadContext,
  input: {
    userId: string;
    agentType: string;
    userText: string;
    title?: string | null;
    feedbackLanguage: "en" | "zh";
    topic?: string;
    promptId?: string | null;
    assignmentSnapshotJson?: string | null;
    startKey: string;
  }
): Promise<{ articleId: string; revisionId: string }> => {
  const wordCount = countWords(input.userText);

  const result = await createWritingArticleBatch(context.env.DB, {
    userId: input.userId,
    title: input.title || null,
    essayPrompt: input.topic || null,
    promptId: input.promptId ?? null,
    assignmentSnapshotJson: input.assignmentSnapshotJson ?? null,
    startKey: input.startKey,
    agentType: input.agentType,
    userText: input.userText,
    wordCount
  });
  const { article, revision } = result;

  if (result.created) {
    await scheduleEvaluation(context, {
      userId: input.userId,
      revisionId: revision.id,
      generation: revision.feedback_generation,
      agentType: input.agentType,
      userText: input.userText,
      wordCount,
      feedbackLanguage: input.feedbackLanguage,
      previousRound: null,
      historyScores: [],
      topic: input.topic,
      assignment: parseAssignmentSnapshot(input.assignmentSnapshotJson ?? null)
    });
  }

  if (result.created && !input.title) {
    await scheduleWritingTask(
      context,
      (async () => {
        const title = await generateArticleTitle(context.env, input.userText);
        if (title) {
          await updateWritingArticleTitle(context.env.DB, {
            id: article.id,
            userId: input.userId,
            title
          });
        }
      })()
    );
  }

  return { articleId: article.id, revisionId: revision.id };
};

export const submitRevision = async (
  context: AppLoadContext,
  input: {
    userId: string;
    articleId: string;
    agentType: string;
    userText: string;
    feedbackLanguage: "en" | "zh";
    topic?: string;
  }
): Promise<{
  revisionId: string;
  roundNumber: number;
  createdAt: string;
  wordCount: number;
  userText: string;
}> => {
  const wordCount = countWords(input.userText);
  const article = await getWritingArticleById(context.env.DB, input.articleId, {
    includeDeleted: true
  });
  if (!article || article.user_id !== input.userId || article.deleted_at) {
    throw new Error("Article not found.");
  }
  const assignment = parseAssignmentSnapshot(article.assignment_snapshot_json);
  const revisions = await listWritingRevisionsByArticle(context.env.DB, input.articleId);
  const roundNumber = (revisions[revisions.length - 1]?.round_number ?? 0) + 1;

  const previousRevision = revisions.length > 0 ? revisions[revisions.length - 1] : null;
  const previousFeedback: WritingFeedback | null = previousRevision?.feedback_json
    ? (JSON.parse(previousRevision.feedback_json) as WritingFeedback)
    : null;

  const historyScores = revisions
    .filter((r) => r.feedback_json)
    .map((r) => {
      const fb = JSON.parse(r.feedback_json!) as WritingFeedback;
      return { round: r.round_number, assessment: fb.round_summary?.band_estimate ?? "?" };
    });

  const revision = await createWritingRevision(context.env.DB, {
    articleId: input.articleId,
    userId: input.userId,
    roundNumber,
    userText: input.userText,
    wordCount
  });

  await touchWritingArticle(context.env.DB, { id: input.articleId, userId: input.userId });

  await scheduleEvaluation(context, {
    userId: input.userId,
    revisionId: revision.id,
    generation: revision.feedback_generation,
    agentType: input.agentType,
    userText: input.userText,
    wordCount,
    feedbackLanguage: input.feedbackLanguage,
    previousRound: previousRevision
      ? {
          round_number: previousRevision.round_number,
          user_text: previousRevision.user_text,
          feedback: previousFeedback,
          word_count: previousRevision.word_count
        }
      : null,
    historyScores,
    topic: article.essay_prompt ?? input.topic,
    assignment
  });

  return {
    revisionId: revision.id,
    roundNumber: revision.round_number,
    createdAt: revision.created_at,
    wordCount: revision.word_count,
    userText: revision.user_text
  };
};

export const retryRevisionFeedback = async (
  context: AppLoadContext,
  input: {
    userId: string;
    revisionId: string;
    articleId: string;
    agentType: string;
    feedbackLanguage: "en" | "zh";
  }
): Promise<void> => {
  const article = await getWritingArticleById(context.env.DB, input.articleId, { includeDeleted: true });
  if (!article || article.user_id !== input.userId || article.deleted_at) {
    throw new Error("Article not found.");
  }

  const revisions = await listWritingRevisionsByArticle(context.env.DB, input.articleId);
  const existingRevision = revisions.find((r) => r.id === input.revisionId);
  if (!existingRevision) throw new Error("Revision not found.");

  const previousRevision = revisions.find(
    (r) => r.round_number === existingRevision.round_number - 1
  );
  const previousFeedback: WritingFeedback | null =
    previousRevision?.feedback_json
      ? (JSON.parse(previousRevision.feedback_json) as WritingFeedback)
      : null;

  const historyScores = revisions
    .filter((r) => r.feedback_json && r.round_number < existingRevision.round_number)
    .map((r) => {
      const fb = JSON.parse(r.feedback_json!) as WritingFeedback;
      return { round: r.round_number, assessment: fb.round_summary?.band_estimate ?? "?" };
    });

  const revision = await beginWritingRevisionFeedbackRetry(context.env.DB, {
    id: existingRevision.id,
    articleId: input.articleId,
    userId: input.userId
  });
  if (!revision) throw new Error("Revision not found.");

  await scheduleEvaluation(context, {
    userId: input.userId,
    revisionId: revision.id,
    generation: revision.feedback_generation,
    agentType: input.agentType,
    userText: revision.user_text,
    wordCount: revision.word_count,
    feedbackLanguage: input.feedbackLanguage,
    previousRound: previousRevision
      ? {
          round_number: previousRevision.round_number,
          user_text: previousRevision.user_text,
          feedback: previousFeedback,
          word_count: previousRevision.word_count
        }
      : null,
    historyScores,
    topic: article.essay_prompt ?? undefined,
    assignment: parseAssignmentSnapshot(article.assignment_snapshot_json)
  });
};
