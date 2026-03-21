import * as React from "react";
import {
  getStoredWritingFeedbackLanguage,
  parseWritingFeedbackLanguage,
  setStoredWritingFeedbackLanguage,
  WRITING_FEEDBACK_LANGUAGE_STORAGE_KEY,
  WRITING_SETTINGS_EVENT,
  type WritingFeedbackLanguage
} from "~/utils/writing-settings";

export const useWritingFeedbackLanguage = (): [
  WritingFeedbackLanguage,
  (value: WritingFeedbackLanguage) => void
] => {
  const [feedbackLanguage, setFeedbackLanguage] =
    React.useState<WritingFeedbackLanguage>("en");

  React.useEffect(() => {
    setFeedbackLanguage(getStoredWritingFeedbackLanguage());

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== WRITING_FEEDBACK_LANGUAGE_STORAGE_KEY) return;
      setFeedbackLanguage(parseWritingFeedbackLanguage(event.newValue));
    };

    const handleSettingsChange = (event: Event) => {
      const detail = (event as CustomEvent<{ feedbackLanguage?: WritingFeedbackLanguage }>).detail;
      setFeedbackLanguage(parseWritingFeedbackLanguage(detail?.feedbackLanguage));
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(WRITING_SETTINGS_EVENT, handleSettingsChange as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(WRITING_SETTINGS_EVENT, handleSettingsChange as EventListener);
    };
  }, []);

  const updateFeedbackLanguage = React.useCallback((value: WritingFeedbackLanguage) => {
    setStoredWritingFeedbackLanguage(value);
    setFeedbackLanguage(value);
  }, []);

  return [feedbackLanguage, updateFeedbackLanguage];
};
