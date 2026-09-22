import {
  FEEDBACK_LANGUAGE_PREFERENCES,
  parseFeedbackLanguage,
  type FeedbackLanguage
} from "~/utils/feedback-language";

/** Writing's names for the shared feedback language (Reading and Writing share one setting). */
export const WRITING_FEEDBACK_LANGUAGE_OPTIONS = FEEDBACK_LANGUAGE_PREFERENCES;
export type WritingFeedbackLanguage = FeedbackLanguage;
export const parseWritingFeedbackLanguage = parseFeedbackLanguage;
