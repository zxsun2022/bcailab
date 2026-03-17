export const WRITING_FEEDBACK_LANGUAGE_STORAGE_KEY = "bcailab-writing-feedback-language";
export const WRITING_SETTINGS_EVENT = "bcailab-writing-settings-changed";

export const WRITING_FEEDBACK_LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "zh", label: "Chinese" }
] as const;

export type WritingFeedbackLanguage =
  (typeof WRITING_FEEDBACK_LANGUAGE_OPTIONS)[number]["value"];

export const parseWritingFeedbackLanguage = (value: unknown): WritingFeedbackLanguage =>
  value === "zh" ? "zh" : "en";

export const getStoredWritingFeedbackLanguage = (): WritingFeedbackLanguage => {
  if (typeof window === "undefined") return "en";
  return parseWritingFeedbackLanguage(
    window.localStorage.getItem(WRITING_FEEDBACK_LANGUAGE_STORAGE_KEY)
  );
};

export const setStoredWritingFeedbackLanguage = (value: WritingFeedbackLanguage) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WRITING_FEEDBACK_LANGUAGE_STORAGE_KEY, value);
  window.dispatchEvent(
    new CustomEvent(WRITING_SETTINGS_EVENT, {
      detail: { feedbackLanguage: value }
    })
  );
};
