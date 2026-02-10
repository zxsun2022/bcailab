export type SpeechLanguage = {
  code: string;
  label: string;
};

export type SpeechMark = {
  name: string;
  startSec: number;
  startChar: number;
  endChar: number;
};

export type SpeechAlignment = {
  displayText: string;
  marks: SpeechMark[];
};

export type SpeechTimepoint = {
  markName: string;
  timeSeconds: number;
};

export const AUDIO_FORMAT = "MP3";
export const MAX_TTS_SSML_BYTES = 5000;

export const SUPPORTED_SPEECH_LANGUAGES: SpeechLanguage[] = [
  { code: "en-US", label: "English" },
  { code: "fr-FR", label: "Français" },
  { code: "ja-JP", label: "日本語" },
  { code: "es-ES", label: "Español" }
];
