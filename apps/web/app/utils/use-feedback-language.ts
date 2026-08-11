import * as React from "react";
import {
  FEEDBACK_LANGUAGE_EVENT,
  FEEDBACK_LANGUAGE_STORAGE_KEY,
  getStoredFeedbackLanguage,
  LEGACY_READING_OUTPUT_LANGUAGE_STORAGE_KEY,
  LEGACY_WRITING_FEEDBACK_LANGUAGE_STORAGE_KEY,
  parseFeedbackLanguage,
  setStoredFeedbackLanguage,
  type FeedbackLanguage
} from "~/utils/feedback-language";

const PREFERENCE_KEYS = new Set([
  FEEDBACK_LANGUAGE_STORAGE_KEY,
  LEGACY_WRITING_FEEDBACK_LANGUAGE_STORAGE_KEY,
  LEGACY_READING_OUTPUT_LANGUAGE_STORAGE_KEY
]);

export const useFeedbackLanguage = (): [
  FeedbackLanguage,
  (value: FeedbackLanguage) => void
] => {
  const [language, setLanguage] = React.useState<FeedbackLanguage>("en");

  React.useEffect(() => {
    setLanguage(getStoredFeedbackLanguage());

    const handleStorage = (event: StorageEvent) => {
      if (event.key && !PREFERENCE_KEYS.has(event.key)) return;
      setLanguage(getStoredFeedbackLanguage());
    };

    const handleSettingsChange = (event: Event) => {
      const detail = (event as CustomEvent<{ language?: FeedbackLanguage }>).detail;
      setLanguage(parseFeedbackLanguage(detail?.language));
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(FEEDBACK_LANGUAGE_EVENT, handleSettingsChange as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(FEEDBACK_LANGUAGE_EVENT, handleSettingsChange as EventListener);
    };
  }, []);

  const updateLanguage = React.useCallback((value: FeedbackLanguage) => {
    setStoredFeedbackLanguage(value);
    setLanguage(value);
  }, []);

  return [language, updateLanguage];
};
