export type WritingAgent = {
  id: string;
  label: string;
  description: string;
  dimensions: string[];
  rubric: string;
  tone: string;
  minWords: number;
  maxWords: number;
};

export const WRITING_AGENTS: Record<string, WritingAgent> = {
  ielts_task2: {
    id: "ielts_task2",
    label: "IELTS Task 2",
    description:
      "Academic essay responding to a point of view, argument, or problem. Evaluated against IELTS Band 7–9 descriptors.",
    dimensions: [
      "Task Response (TR)",
      "Coherence & Cohesion (CC)",
      "Lexical Resource (LR)",
      "Grammatical Range & Accuracy (GRA)"
    ],
    rubric: [
      "Evaluate the essay against IELTS Writing Task 2 Band descriptors (Bands 5–9).",
      "",
      "Task Response (TR):",
      "- Band 9: Fully addresses all parts of the task; presents a fully developed position with relevant, extended, and well-supported ideas.",
      "- Band 7: Addresses all parts of the task; presents a clear position with relevant main ideas, though some may be over-generalised or lack focus.",
      "- Band 5: Addresses the task only partially; the format may be inappropriate; position is not always clear.",
      "",
      "Coherence & Cohesion (CC):",
      "- Band 9: Uses cohesion effortlessly; paragraphing is skilful.",
      "- Band 7: Logically organises information and ideas; clear progression; uses a range of cohesive devices appropriately.",
      "- Band 5: Information and ideas are not arranged coherently; overuse or underuse of cohesive devices.",
      "",
      "Lexical Resource (LR):",
      "- Band 9: Wide range of vocabulary used with full flexibility and precision; rare minor slips.",
      "- Band 7: Sufficient range for flexible and precise meaning; uses less common items with some awareness of style and collocation; occasional errors in word choice/spelling.",
      "- Band 5: Limited range; errors in word choice and spelling may cause difficulty for the reader.",
      "",
      "Grammatical Range & Accuracy (GRA):",
      "- Band 9: Wide range of structures used with full flexibility and accuracy; rare minor errors.",
      "- Band 7: Variety of complex structures; frequent error-free sentences; good control though occasional errors.",
      "- Band 5: Limited range of structures; attempts complex sentences but with frequent errors."
    ].join("\n"),
    tone:
      "Direct and constructive, like a strict but fair IELTS examiner-coach. Point out weaknesses clearly, but acknowledge genuine strengths. Never soften serious issues.",
    minWords: 250,
    maxWords: 400
  }
};

export const DEFAULT_AGENT_ID = "ielts_task2";

export const getWritingAgent = (id: string): WritingAgent | null =>
  WRITING_AGENTS[id] ?? null;

export const getWritingAgentOrDefault = (id: string): WritingAgent =>
  WRITING_AGENTS[id] ?? WRITING_AGENTS[DEFAULT_AGENT_ID];

export const listWritingAgents = (): WritingAgent[] =>
  Object.values(WRITING_AGENTS);
