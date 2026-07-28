export type EnglishModuleAccess = "public" | "trial" | "auth";
export type EnglishModuleGroup = "practice" | "utility";
export type EnglishModuleStatus = "active" | "planned";

export type EnglishModule = {
  id: string;
  label: string;
  route: string;
  trialRoute?: string;
  access: EnglishModuleAccess;
  group: EnglishModuleGroup;
  status: EnglishModuleStatus;
  description: string;
  detail: string;
  tags: readonly string[];
};

/**
 * The single source of truth for English Studio navigation and module access.
 * Product surfaces may choose different presentation, but must not copy routes
 * or anonymous-access rules.
 */
export const ENGLISH_MODULES: readonly EnglishModule[] = [
  {
    id: "dictation",
    label: "Dictation",
    route: "/dictation",
    access: "public",
    group: "practice",
    status: "active",
    description: "Listen sentence by sentence and type what you hear.",
    detail:
      "Graded passages from A2 to C1 with per-sentence audio, unlimited replays, and a speed toggle. Every sentence is scored instantly against the reference. Free to try without an account.",
    tags: ["Listening", "Scoring", "Free to try"]
  },
  {
    id: "reading",
    label: "Reading",
    route: "/reading",
    trialRoute: "/reading/trial",
    access: "trial",
    group: "practice",
    status: "active",
    description: "Read aloud or recite passages, get AI evaluation on every attempt.",
    detail:
      "Save passages, record attempts, and receive structured feedback on pronunciation, fluency, and completeness — with a progress dashboard across attempts.",
    tags: ["Speaking", "Evaluation", "Free to try"]
  },
  {
    id: "writing",
    label: "Writing",
    route: "/writing",
    trialRoute: "/writing/trial",
    access: "trial",
    group: "practice",
    status: "active",
    description: "Draft, get structured feedback, revise, and track rounds.",
    detail:
      "Choose a coach persona, submit a draft, and work through revision rounds with scored feedback that remembers where you left off.",
    tags: ["Writing", "Feedback", "Free to try"]
  },
  {
    id: "translate",
    label: "Translate",
    route: "/translate",
    access: "public",
    group: "utility",
    status: "active",
    description: "DeepL-style translation between English, Chinese, and more.",
    detail:
      "Two-pane translation driven by an LLM: auto-detect the source language, keep formatting intact, and swap directions in one click. Free to try without an account.",
    tags: ["Translation", "LLM", "Free to try"]
  },
  {
    id: "speech",
    label: "Speech",
    route: "/speech",
    access: "auth",
    group: "utility",
    status: "active",
    description: "Turn any text into natural audio you can replay anywhere.",
    detail:
      "Generate MP3 audio with natural voices, keep a private history, and use it as listening or shadowing material.",
    tags: ["TTS", "Listening"]
  },
  {
    id: "dictionary",
    label: "AI Dictionary",
    route: "/esl/dictionary",
    access: "auth",
    group: "utility",
    status: "planned",
    description: "Word and phrase explanation with bilingual support.",
    detail: "Planned: contextual explanations that connect back to your reading and writing practice.",
    tags: ["Vocabulary"]
  }
] as const;

export type EnglishModuleDestination = {
  href: string;
  requiresLogin: boolean;
};

export function resolveEnglishModuleDestination(
  module: EnglishModule,
  signedIn: boolean
): EnglishModuleDestination {
  if (signedIn || module.access === "public") {
    return { href: module.route, requiresLogin: false };
  }
  if (module.access === "trial") {
    if (!module.trialRoute) {
      throw new Error(`Trial module "${module.id}" is missing trialRoute`);
    }
    return { href: module.trialRoute, requiresLogin: false };
  }
  return { href: module.route, requiresLogin: true };
}
