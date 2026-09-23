import type { Locale } from "~/i18n/locale";

/**
 * The language AI feedback is written in, and the learner's preference for it.
 *
 * Feedback follows the interface language unless the learner picked one (ADR 0011, design §5).
 * The preference therefore has three values — `auto`, `en`, `zh` — while the language a grader
 * is asked for is always one of two. Graders and routes only ever see the resolved language.
 */

export type FeedbackLanguage = "en" | "zh";
export type FeedbackLanguagePreference = "auto" | FeedbackLanguage;

/**
 * The current key. It is new rather than reused because the old key cannot say what its value
 * means: the old code wrote `en` whenever nothing was stored, so an `en` there is as likely a
 * default as a choice. A value under this key is always the learner's own.
 */
export const FEEDBACK_LANGUAGE_PREFERENCE_KEY = "bcailab-feedback-language-v2";
/** Keys earlier versions wrote. Read once to migrate, then removed. */
export const PREVIOUS_FEEDBACK_LANGUAGE_STORAGE_KEY = "bcailab-feedback-language";
export const LEGACY_WRITING_FEEDBACK_LANGUAGE_STORAGE_KEY =
  "bcailab-writing-feedback-language";
export const LEGACY_READING_OUTPUT_LANGUAGE_STORAGE_KEY =
  "bcailab-reading-output-language";
export const FEEDBACK_LANGUAGE_EVENT = "bcailab-feedback-language-changed";

/** Offered on the settings page, in this order. Labels come from the catalogues (`feedbackLang.*`). */
export const FEEDBACK_LANGUAGE_PREFERENCES = ["auto", "en", "zh"] as const;

type PreferenceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Server-side: what a submitted form asked for. Anything unexpected is English. */
export const parseFeedbackLanguage = (value: unknown): FeedbackLanguage =>
  value === "zh" ? "zh" : "en";

export const isFeedbackLanguagePreference = (value: unknown): value is FeedbackLanguagePreference =>
  value === "auto" || value === "en" || value === "zh";

/** The language a grader is asked for, given the preference and the interface language. */
export const resolveFeedbackLanguage = (
  preference: FeedbackLanguagePreference,
  locale: Locale
): FeedbackLanguage => (preference === "auto" ? (locale === "zh" ? "zh" : "en") : preference);

/**
 * Reads the preference, migrating what earlier versions stored.
 *
 * A stored `zh` under any earlier key was a choice — nothing else ever wrote it — and stays an
 * explicit Chinese preference. A stored `en` cannot be told apart from the default the old code
 * persisted on first read, so it becomes `auto`. That differs from an explicit English choice
 * only in the Chinese interface, which did not exist when those values were written. Earlier
 * precedence is kept: the previous canonical key, then Writing's, then Reading's.
 */
export const migrateFeedbackLanguagePreference = (
  storage: PreferenceStorage
): FeedbackLanguagePreference => {
  const current = storage.getItem(FEEDBACK_LANGUAGE_PREFERENCE_KEY);
  if (isFeedbackLanguagePreference(current)) return current;

  const earlier = [
    storage.getItem(PREVIOUS_FEEDBACK_LANGUAGE_STORAGE_KEY),
    storage.getItem(LEGACY_WRITING_FEEDBACK_LANGUAGE_STORAGE_KEY),
    storage.getItem(LEGACY_READING_OUTPUT_LANGUAGE_STORAGE_KEY)
  ].find((value) => value === "en" || value === "zh");
  const resolved: FeedbackLanguagePreference = earlier === "zh" ? "zh" : "auto";

  storage.setItem(FEEDBACK_LANGUAGE_PREFERENCE_KEY, resolved);
  storage.removeItem(PREVIOUS_FEEDBACK_LANGUAGE_STORAGE_KEY);
  storage.removeItem(LEGACY_WRITING_FEEDBACK_LANGUAGE_STORAGE_KEY);
  storage.removeItem(LEGACY_READING_OUTPUT_LANGUAGE_STORAGE_KEY);
  return resolved;
};

export const getStoredFeedbackLanguagePreference = (): FeedbackLanguagePreference => {
  if (typeof window === "undefined") return "auto";
  try {
    return migrateFeedbackLanguagePreference(window.localStorage);
  } catch {
    return "auto";
  }
};

export const setStoredFeedbackLanguagePreference = (value: FeedbackLanguagePreference) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FEEDBACK_LANGUAGE_PREFERENCE_KEY, value);
  } catch {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(FEEDBACK_LANGUAGE_EVENT, {
      detail: { preference: value }
    })
  );
};
