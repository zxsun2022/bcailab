import * as React from "react";
import {
  getStoredReadingOutputLanguage,
  parseReadingOutputLanguage,
  READING_OUTPUT_LANGUAGE_STORAGE_KEY,
  READING_SETTINGS_EVENT,
  setStoredReadingOutputLanguage,
  type ReadingOutputLanguage
} from "~/utils/reading-settings";

export const useReadingOutputLanguage = (): [
  ReadingOutputLanguage,
  (value: ReadingOutputLanguage) => void
] => {
  const [outputLanguage, setOutputLanguage] = React.useState<ReadingOutputLanguage>("en");

  React.useEffect(() => {
    setOutputLanguage(getStoredReadingOutputLanguage());

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== READING_OUTPUT_LANGUAGE_STORAGE_KEY) return;
      setOutputLanguage(parseReadingOutputLanguage(event.newValue));
    };

    const handleSettingsChange = (event: Event) => {
      const detail = (event as CustomEvent<{ outputLanguage?: ReadingOutputLanguage }>).detail;
      setOutputLanguage(parseReadingOutputLanguage(detail?.outputLanguage));
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(READING_SETTINGS_EVENT, handleSettingsChange as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(READING_SETTINGS_EVENT, handleSettingsChange as EventListener);
    };
  }, []);

  const updateOutputLanguage = React.useCallback((value: ReadingOutputLanguage) => {
    setStoredReadingOutputLanguage(value);
    setOutputLanguage(value);
  }, []);

  return [outputLanguage, updateOutputLanguage];
};
