export const TRANSLATE_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "zh-Hans", label: "Chinese (Simplified)" },
  { code: "zh-Hant", label: "Chinese (Traditional)" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "es", label: "Spanish" },
  { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" },
  { code: "ru", label: "Russian" }
] as const;

export type TranslateLanguageCode = (typeof TRANSLATE_LANGUAGES)[number]["code"];

export const isTranslateLanguageCode = (value: string): value is TranslateLanguageCode =>
  TRANSLATE_LANGUAGES.some((lang) => lang.code === value);

export const translateLanguageLabel = (code: TranslateLanguageCode): string =>
  TRANSLATE_LANGUAGES.find((lang) => lang.code === code)?.label ?? code;
