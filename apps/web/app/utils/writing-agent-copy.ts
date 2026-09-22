import type { MessageKey, Translate } from "~/i18n/translate";
import type { WritingAgent } from "~/utils/writing-agents";

/**
 * What a learner reads about a writing coach, in the interface language.
 *
 * `WRITING_AGENTS` keeps its English label, description, dimensions and assessment prefix
 * because the grading prompt is built from them; translating those would change what the
 * model is told. This module translates only at the point of display (ADR 0011).
 */

const KNOWN_AGENTS = ["general", "ielts_task1", "ielts_task2"] as const;
type KnownAgentId = (typeof KNOWN_AGENTS)[number];

const isKnownAgent = (id: string): id is KnownAgentId =>
  (KNOWN_AGENTS as readonly string[]).includes(id);

export const writingAgentCopy = (
  t: Translate,
  agent: Pick<WritingAgent, "id" | "label" | "description" | "scaffold">
) =>
  isKnownAgent(agent.id)
    ? {
        label: t(`writingAgent.${agent.id}.label` satisfies MessageKey),
        description: t(`writingAgent.${agent.id}.description` satisfies MessageKey),
        scaffold: t(`writingAgent.${agent.id}.scaffold` satisfies MessageKey)
      }
    : { label: agent.label, description: agent.description, scaffold: agent.scaffold };

/**
 * Feedback names its dimension in the words the prompt gave the model, which are the English
 * names below. Anything else — an older name, a model's paraphrase — is shown as stored.
 */
export const WRITING_DIMENSION_KEYS: Record<string, MessageKey> = {
  Clarity: "writingDimension.clarity",
  Structure: "writingDimension.structure",
  "Style & Voice": "writingDimension.styleVoice",
  "Grammar & Mechanics": "writingDimension.grammarMechanics",
  "Task Achievement (TA)": "writingDimension.taskAchievement",
  "Task Response (TR)": "writingDimension.taskResponse",
  "Coherence & Cohesion (CC)": "writingDimension.coherenceCohesion",
  "Lexical Resource (LR)": "writingDimension.lexicalResource",
  "Grammatical Range & Accuracy (GRA)": "writingDimension.grammaticalRange",
  General: "writingDimension.general"
};

export const writingDimensionLabel = (t: Translate, name: string): string => {
  const key = WRITING_DIMENSION_KEYS[name];
  return key ? t(key) : name;
};

/**
 * The display form of a round's assessment. The value itself is model output and is shown as
 * stored; only the IELTS prefix ("Coach estimate · Band") is interface copy.
 */
export const writingAssessmentLabel = (
  t: Translate,
  value: string,
  assessmentPrefix?: string | null
): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return assessmentPrefix ? t("writing.assessmentBand", { value: trimmed }) : trimmed;
};
