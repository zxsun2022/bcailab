import {
  FEEDBACK_LANGUAGE_PREFERENCES,
  parseFeedbackLanguage,
  type FeedbackLanguage
} from "~/utils/feedback-language";

/** Reading's names for the shared feedback language (Reading and Writing share one setting). */
export const READING_OUTPUT_LANGUAGE_OPTIONS = FEEDBACK_LANGUAGE_PREFERENCES;
export type ReadingOutputLanguage = FeedbackLanguage;
export const parseReadingOutputLanguage = parseFeedbackLanguage;
