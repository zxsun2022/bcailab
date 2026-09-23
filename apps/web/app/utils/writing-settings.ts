import {
  parseFeedbackLanguage,
  type FeedbackLanguage
} from "~/utils/feedback-language";

/** Writing's names for the shared feedback language (Reading and Writing share one setting). */
export type WritingFeedbackLanguage = FeedbackLanguage;
export const parseWritingFeedbackLanguage = parseFeedbackLanguage;
