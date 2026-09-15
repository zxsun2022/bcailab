import type { AppLoadContext } from "@remix-run/cloudflare";
import {
  getEslLearnerProfile,
  listDictationAttemptsByUser,
  listLatestWritingFeedbackRoundsByUser
} from "@bcailab/db";
import {
  buildLearnerBrief,
  LEARNER_CONTEXT_LIMITS,
  projectForDictationFeedback,
  renderLearnerContext
} from "~/utils/learner-context";

/**
 * Reads what the learner brief needs and renders one grader's section. Decision: ADR 0010.
 *
 * Runs inside the grader's existing background task, never on a page request. Fails soft: a
 * grader without context is today's grader, so an assembly error yields an empty section rather
 * than a failed evaluation. Only counts are logged — brief content never is.
 */

/** Dictation rows fetched: more than the six the brief keeps, so the attempt being judged and
 *  unfinished attempts do not crowd out real history. Still a single bounded read. */
const DICTATION_ROWS = 12;

export const assembleDictationFeedbackContext = async (
  context: AppLoadContext,
  input: { userId: string; attemptId: string }
): Promise<string> => {
  try {
    const db = context.env.DB;
    const [profile, dictationAttempts, writingRounds] = await Promise.all([
      getEslLearnerProfile(db, input.userId),
      listDictationAttemptsByUser(db, { userId: input.userId, limit: DICTATION_ROWS }),
      listLatestWritingFeedbackRoundsByUser(db, {
        userId: input.userId,
        limit: LEARNER_CONTEXT_LIMITS.writingSessions
      })
    ]);
    const projection = projectForDictationFeedback(
      buildLearnerBrief({
        assembledAt: new Date().toISOString(),
        profile,
        dictationAttempts,
        writingRounds,
        current: { dictationAttemptId: input.attemptId }
      })
    );
    const rendered = renderLearnerContext(projection);
    console.log(
      `learner-context dictation_feedback tags=${projection.tags.length} dictation_notes=${projection.dictation.groups.length} writing_notes=${projection.writing.groups.length} chars=${rendered.length}`
    );
    return rendered;
  } catch (error) {
    console.error(
      "learner-context assembly failed:",
      error instanceof Error ? error.message : "unknown error"
    );
    return "";
  }
};
