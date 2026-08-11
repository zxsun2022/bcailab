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
export const READING_OUTPUT_LANGUAGE_STORAGE_KEY = FEEDBACK_LANGUAGE_STORAGE_KEY;
/** @deprecated Use the shared feedback-language names for new code. */
export const READING_SETTINGS_EVENT = FEEDBACK_LANGUAGE_EVENT;
export const READING_OUTPUT_LANGUAGE_OPTIONS = FEEDBACK_LANGUAGE_OPTIONS;
export type ReadingOutputLanguage = FeedbackLanguage;
export const parseReadingOutputLanguage = parseFeedbackLanguage;
export const getStoredReadingOutputLanguage = getStoredFeedbackLanguage;
export const setStoredReadingOutputLanguage = setStoredFeedbackLanguage;
