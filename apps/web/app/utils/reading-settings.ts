import {
  parseFeedbackLanguage,
  type FeedbackLanguage
} from "~/utils/feedback-language";

/** Reading's names for the shared feedback language (Reading and Writing share one setting). */
export type ReadingOutputLanguage = FeedbackLanguage;
export const parseReadingOutputLanguage = parseFeedbackLanguage;
