export const FEEDBACK_LANGUAGE_STORAGE_KEY = "bcailab-feedback-language";
export const LEGACY_WRITING_FEEDBACK_LANGUAGE_STORAGE_KEY =
  "bcailab-writing-feedback-language";
export const LEGACY_READING_OUTPUT_LANGUAGE_STORAGE_KEY =
  "bcailab-reading-output-language";
export const FEEDBACK_LANGUAGE_EVENT = "bcailab-feedback-language-changed";

export const FEEDBACK_LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "zh", label: "Chinese" }
] as const;

export type FeedbackLanguage = (typeof FEEDBACK_LANGUAGE_OPTIONS)[number]["value"];

type PreferenceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const parseFeedbackLanguage = (value: unknown): FeedbackLanguage =>
  value === "zh" ? "zh" : "en";

const isFeedbackLanguage = (value: unknown): value is FeedbackLanguage =>
  value === "en" || value === "zh";

/**
 * Reads and canonicalizes the shared feedback-language preference.
 *
 * Migration precedence is intentionally fixed: the former Writing key wins,
 * then the former Reading key, then English. Once a winner is chosen both
 * legacy keys are removed so subsequent reads cannot diverge again.
 */
export const migrateFeedbackLanguagePreference = (
  storage: PreferenceStorage
): FeedbackLanguage => {
  const current = storage.getItem(FEEDBACK_LANGUAGE_STORAGE_KEY);
  const legacyWriting = storage.getItem(LEGACY_WRITING_FEEDBACK_LANGUAGE_STORAGE_KEY);
  const legacyReading = storage.getItem(LEGACY_READING_OUTPUT_LANGUAGE_STORAGE_KEY);
  const resolved = isFeedbackLanguage(current)
    ? current
    : isFeedbackLanguage(legacyWriting)
      ? legacyWriting
      : isFeedbackLanguage(legacyReading)
        ? legacyReading
        : "en";

  storage.setItem(FEEDBACK_LANGUAGE_STORAGE_KEY, resolved);
  storage.removeItem(LEGACY_WRITING_FEEDBACK_LANGUAGE_STORAGE_KEY);
  storage.removeItem(LEGACY_READING_OUTPUT_LANGUAGE_STORAGE_KEY);
  return resolved;
};
export const getStoredFeedbackLanguage = (): FeedbackLanguage => {
  if (typeof window === "undefined") return "en";
  try {
    return migrateFeedbackLanguagePreference(window.localStorage);
  } catch {
    return "en";
  }
};

export const setStoredFeedbackLanguage = (value: FeedbackLanguage) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FEEDBACK_LANGUAGE_STORAGE_KEY, value);
    window.localStorage.removeItem(LEGACY_WRITING_FEEDBACK_LANGUAGE_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_READING_OUTPUT_LANGUAGE_STORAGE_KEY);
  } catch {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(FEEDBACK_LANGUAGE_EVENT, {
      detail: { language: value }
    })
  );
};
