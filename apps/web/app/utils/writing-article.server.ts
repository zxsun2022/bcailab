import type { AppLoadContext } from "@remix-run/cloudflare";
import {
  createWritingArticle,
  createWritingRevision,
  getLatestWritingRevision,
  listWritingRevisionsByArticle,
  updateWritingArticleTitle,
  updateWritingRevisionFeedback,
  touchWritingArticle
} from "@bcailab/db";
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

export const createArticleWithFirstRevision = async (
  context: AppLoadContext,
  input: {
    userId: string;
    agentType: string;
    userText: string;
    title?: string | null;
    feedbackLanguage: "en" | "zh";
  }
): Promise<{ articleId: string; revisionId: string }> => {
  const wordCount = countWords(input.userText);

  const article = await createWritingArticle(context.env.DB, {
    userId: input.userId,
    title: input.title || null,
    agentType: input.agentType
  });

  const revision = await createWritingRevision(context.env.DB, {
    articleId: article.id,
    userId: input.userId,
    roundNumber: 1,
    userText: input.userText,
    wordCount
  });

  const ctx = context as unknown as { waitUntil(p: Promise<unknown>): void };
  ctx.waitUntil(
    (async () => {
      try {
        const { modelName, feedback } = await evaluateWriting({
          env: context.env,
          agentType: input.agentType,
          userText: input.userText,
          wordCount,
          feedbackLanguage: input.feedbackLanguage,
          previousRound: null,
          historyScores: []
        });
        await updateWritingRevisionFeedback(context.env.DB, {
          id: revision.id,
          feedbackJson: JSON.stringify(feedback),
          feedbackStatus: "completed",
          modelName
        });
      } catch {
        await updateWritingRevisionFeedback(context.env.DB, {
          id: revision.id,
          feedbackJson: null,
          feedbackStatus: "failed",
          modelName: "error"
        });
      }
    })()
  );

  if (!input.title) {
    ctx.waitUntil(
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
  }
): Promise<{ revisionId: string }> => {
  const wordCount = countWords(input.userText);
  const revisions = await listWritingRevisionsByArticle(context.env.DB, input.articleId);
  const roundNumber = revisions.length + 1;

  const previousRevision = revisions.length > 0 ? revisions[revisions.length - 1] : null;
  const previousFeedback: WritingFeedback | null = previousRevision?.feedback_json
    ? (JSON.parse(previousRevision.feedback_json) as WritingFeedback)
    : null;

  const historyScores = revisions
    .filter((r) => r.feedback_json)
    .map((r) => {
      const fb = JSON.parse(r.feedback_json!) as WritingFeedback;
      return { round: r.round_number, band: fb.round_summary?.band_estimate ?? "?" };
    });

  const revision = await createWritingRevision(context.env.DB, {
    articleId: input.articleId,
    userId: input.userId,
    roundNumber,
    userText: input.userText,
    wordCount
  });

  await touchWritingArticle(context.env.DB, { id: input.articleId, userId: input.userId });

  const ctx = context as unknown as { waitUntil(p: Promise<unknown>): void };
  ctx.waitUntil(
    (async () => {
      try {
        const { modelName, feedback } = await evaluateWriting({
          env: context.env,
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
          historyScores
        });
        await updateWritingRevisionFeedback(context.env.DB, {
          id: revision.id,
          feedbackJson: JSON.stringify(feedback),
          feedbackStatus: "completed",
          modelName
        });
      } catch {
        await updateWritingRevisionFeedback(context.env.DB, {
          id: revision.id,
          feedbackJson: null,
          feedbackStatus: "failed",
          modelName: "error"
        });
      }
    })()
  );

  return { revisionId: revision.id };
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
  const revisions = await listWritingRevisionsByArticle(context.env.DB, input.articleId);
  const revision = revisions.find((r) => r.id === input.revisionId);
  if (!revision) throw new Error("Revision not found.");

  const previousRevision = revisions.find((r) => r.round_number === revision.round_number - 1);
  const previousFeedback: WritingFeedback | null =
    previousRevision?.feedback_json
      ? (JSON.parse(previousRevision.feedback_json) as WritingFeedback)
      : null;

  const historyScores = revisions
    .filter((r) => r.feedback_json && r.round_number < revision.round_number)
    .map((r) => {
      const fb = JSON.parse(r.feedback_json!) as WritingFeedback;
      return { round: r.round_number, band: fb.round_summary?.band_estimate ?? "?" };
    });

  await updateWritingRevisionFeedback(context.env.DB, {
    id: revision.id,
    feedbackJson: null,
    feedbackStatus: "pending" as "completed",
    modelName: ""
  });

  const ctx = context as unknown as { waitUntil(p: Promise<unknown>): void };
  ctx.waitUntil(
    (async () => {
      try {
        const { modelName, feedback } = await evaluateWriting({
          env: context.env,
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
          historyScores
        });
        await updateWritingRevisionFeedback(context.env.DB, {
          id: revision.id,
          feedbackJson: JSON.stringify(feedback),
          feedbackStatus: "completed",
          modelName
        });
      } catch {
        await updateWritingRevisionFeedback(context.env.DB, {
          id: revision.id,
          feedbackJson: null,
          feedbackStatus: "failed",
          modelName: "error"
        });
      }
    })()
  );
};
