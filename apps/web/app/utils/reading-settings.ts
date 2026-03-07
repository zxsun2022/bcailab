export const READING_OUTPUT_LANGUAGE_STORAGE_KEY = "bcailab-reading-output-language";
export const READING_SETTINGS_EVENT = "bcailab-reading-settings-changed";

export const READING_OUTPUT_LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "zh", label: "Chinese" }
] as const;

export type ReadingOutputLanguage = (typeof READING_OUTPUT_LANGUAGE_OPTIONS)[number]["value"];

export const parseReadingOutputLanguage = (value: unknown): ReadingOutputLanguage =>
  value === "zh" ? "zh" : "en";

export const getStoredReadingOutputLanguage = (): ReadingOutputLanguage => {
  if (typeof window === "undefined") return "en";
  return parseReadingOutputLanguage(
    window.localStorage.getItem(READING_OUTPUT_LANGUAGE_STORAGE_KEY)
  );
};

export const setStoredReadingOutputLanguage = (value: ReadingOutputLanguage) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(READING_OUTPUT_LANGUAGE_STORAGE_KEY, value);
  window.dispatchEvent(
    new CustomEvent(READING_SETTINGS_EVENT, {
      detail: { outputLanguage: value }
    })
  );
};
