import type { MessageKey, Translate } from "~/i18n/translate";

/**
 * `label` is the English name the translation *prompt* uses — it must stay English whatever
 * the interface language. What a learner reads comes from `translateLanguageName`.
 */
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

/** A language's name in the interface language, for anything the learner reads. */
export const translateLanguageName = (t: Translate, code: TranslateLanguageCode): string =>
  t(`translateLang.${code}` satisfies MessageKey);

/** As above for a stored code that may be missing or no longer supported. */
export const storedLanguageName = (t: Translate, code: string | null): string => {
  if (!code) return t("common.unknown");
  return isTranslateLanguageCode(code) ? translateLanguageName(t, code) : code;
};
