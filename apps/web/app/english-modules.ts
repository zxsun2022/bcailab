import type { MessageKey, Translate } from "~/i18n/translate";

export type EnglishModuleAccess = "public" | "trial" | "auth";
export type EnglishModuleGroup = "practice" | "utility";
export type EnglishModuleStatus = "active" | "planned";
export type EnglishModuleId =
  | "dictation"
  | "reading"
  | "writing"
  | "translate"
  | "speech"
  | "dictionary";
export type EnglishModuleTag =
  | "listening"
  | "scoring"
  | "freeToTry"
  | "speaking"
  | "evaluation"
  | "writing"
  | "feedback"
  | "translation"
  | "llm"
  | "tts"
  | "vocabulary";

export type EnglishModule = {
  id: EnglishModuleId;
  route: string;
  trialRoute?: string;
  access: EnglishModuleAccess;
  group: EnglishModuleGroup;
  status: EnglishModuleStatus;
  tags: readonly EnglishModuleTag[];
};

/**
 * The single source of truth for English Studio navigation and module access.
 * Product surfaces may choose different presentation, but must not copy routes
 * or anonymous-access rules.
 *
 * Copy — each module's name, description, detail and tag labels — lives in the interface
 * catalogues under `module.<id>.*` and `moduleTag.<tag>`, so it exists in every interface
 * language (ADR 0011). Read it through `moduleCopy`.
 */
export const ENGLISH_MODULES: readonly EnglishModule[] = [
  {
    id: "dictation",
    route: "/dictation",
    access: "public",
    group: "practice",
    status: "active",
    tags: ["listening", "scoring", "freeToTry"]
  },
  {
    id: "reading",
    route: "/reading",
    trialRoute: "/reading/trial",
    access: "trial",
    group: "practice",
    status: "active",
    tags: ["speaking", "evaluation", "freeToTry"]
  },
  {
    id: "writing",
    route: "/writing",
    trialRoute: "/writing/trial",
    access: "trial",
    group: "practice",
    status: "active",
    tags: ["writing", "feedback", "freeToTry"]
  },
  {
    id: "translate",
    route: "/translate",
    access: "public",
    group: "utility",
    status: "active",
    tags: ["translation", "llm", "freeToTry"]
  },
  {
    id: "speech",
    route: "/speech",
    access: "auth",
    group: "utility",
    status: "active",
    tags: ["tts", "listening"]
  },
  {
    id: "dictionary",
    route: "/esl/dictionary",
    access: "auth",
    group: "utility",
    status: "planned",
    tags: ["vocabulary"]
  }
] as const;

/** A module's learner-facing copy in the current interface language. */
export const moduleCopy = (t: Translate, module: Pick<EnglishModule, "id" | "tags">) => ({
  label: t(`module.${module.id}.label` satisfies MessageKey),
  description: t(`module.${module.id}.description` satisfies MessageKey),
  detail: t(`module.${module.id}.detail` satisfies MessageKey),
  tags: module.tags.map((tag) => t(`moduleTag.${tag}` satisfies MessageKey))
});

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
