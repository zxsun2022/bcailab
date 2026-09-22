import * as React from "react";
import { useLocale } from "~/i18n/context";
import {
  FEEDBACK_LANGUAGE_EVENT,
  FEEDBACK_LANGUAGE_PREFERENCE_KEY,
  getStoredFeedbackLanguagePreference,
  isFeedbackLanguagePreference,
  resolveFeedbackLanguage,
  setStoredFeedbackLanguagePreference,
  type FeedbackLanguage,
  type FeedbackLanguagePreference
} from "~/utils/feedback-language";

/**
 * The learner's feedback-language preference, kept in sync across tabs and settings pages.
 *
 * Starts at `auto` on the server and on first render — the server cannot read localStorage —
 * so a page renders the interface language's feedback choice until the stored preference loads.
 */
export const useFeedbackLanguagePreference = (): [
  FeedbackLanguagePreference,
  (value: FeedbackLanguagePreference) => void
] => {
  const [preference, setPreference] = React.useState<FeedbackLanguagePreference>("auto");

  React.useEffect(() => {
    setPreference(getStoredFeedbackLanguagePreference());

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== FEEDBACK_LANGUAGE_PREFERENCE_KEY) return;
      setPreference(getStoredFeedbackLanguagePreference());
    };

    const handleSettingsChange = (event: Event) => {
      const detail = (event as CustomEvent<{ preference?: unknown }>).detail;
      if (isFeedbackLanguagePreference(detail?.preference)) setPreference(detail.preference);
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(FEEDBACK_LANGUAGE_EVENT, handleSettingsChange as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(FEEDBACK_LANGUAGE_EVENT, handleSettingsChange as EventListener);
    };
  }, []);

  const updatePreference = React.useCallback((value: FeedbackLanguagePreference) => {
    setStoredFeedbackLanguagePreference(value);
    setPreference(value);
  }, []);

  return [preference, updatePreference];
};

/**
 * The language new feedback should be written in: the explicit preference, or the interface
 * language when the learner has not chosen. This is what forms post to the graders.
 */
export const useFeedbackLanguage = (): [
  FeedbackLanguage,
  (value: FeedbackLanguagePreference) => void
] => {
  const locale = useLocale();
  const [preference, setPreference] = useFeedbackLanguagePreference();
  return [resolveFeedbackLanguage(preference, locale), setPreference];
};
