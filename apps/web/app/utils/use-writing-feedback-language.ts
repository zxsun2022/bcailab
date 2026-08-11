import { useFeedbackLanguage } from "~/utils/use-feedback-language";
import type { WritingFeedbackLanguage } from "~/utils/writing-settings";

export const useWritingFeedbackLanguage = (): [
  WritingFeedbackLanguage,
  (value: WritingFeedbackLanguage) => void
] => useFeedbackLanguage();
