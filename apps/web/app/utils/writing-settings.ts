import {
  FEEDBACK_LANGUAGE_EVENT,
  FEEDBACK_LANGUAGE_OPTIONS,
  FEEDBACK_LANGUAGE_STORAGE_KEY,
  getStoredFeedbackLanguage,
  parseFeedbackLanguage,
  setStoredFeedbackLanguage,
  type FeedbackLanguage
} from "~/utils/feedback-language";

/** @deprecated Use the shared feedback-language names for new code. */
export const WRITING_FEEDBACK_LANGUAGE_STORAGE_KEY = FEEDBACK_LANGUAGE_STORAGE_KEY;
/** @deprecated Use the shared feedback-language names for new code. */
export const WRITING_SETTINGS_EVENT = FEEDBACK_LANGUAGE_EVENT;
export const WRITING_FEEDBACK_LANGUAGE_OPTIONS = FEEDBACK_LANGUAGE_OPTIONS;
export type WritingFeedbackLanguage = FeedbackLanguage;
export const parseWritingFeedbackLanguage = parseFeedbackLanguage;
export const getStoredWritingFeedbackLanguage = getStoredFeedbackLanguage;
export const setStoredWritingFeedbackLanguage = setStoredFeedbackLanguage;
