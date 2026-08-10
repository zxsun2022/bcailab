import { useFeedbackLanguage } from "~/utils/use-feedback-language";
import type { ReadingOutputLanguage } from "~/utils/reading-settings";

export const useReadingOutputLanguage = (): [
  ReadingOutputLanguage,
  (value: ReadingOutputLanguage) => void
] => useFeedbackLanguage();
