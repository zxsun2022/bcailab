export const WRITING_PROMPT_SCHEMA_VERSION = 1 as const;

export const WRITING_PROMPT_FAMILIES = ["general", "ielts"] as const;
export const WRITING_PROMPT_TASK_TYPES = [
  "guided",
  "academic_task_1",
  "academic_task_2"
] as const;
export const WRITING_PROMPT_KINDS = [
  "email",
  "opinion",
  "story",
  "description",
  "line_graph",
  "bar_chart",
  "pie_chart",
  "table",
  "process",
  "map",
  "opinion_essay",
  "discussion",
  "problem_solution",
  "advantages_disadvantages"
] as const;
export const WRITING_PROMPT_CEFR_BANDS = ["A2", "B1", "B2", "C1"] as const;

export type WritingPromptFamily = (typeof WRITING_PROMPT_FAMILIES)[number];
export type WritingPromptTaskType = (typeof WRITING_PROMPT_TASK_TYPES)[number];
export type WritingPromptKind = (typeof WRITING_PROMPT_KINDS)[number];
export type WritingPromptCefrBand = (typeof WRITING_PROMPT_CEFR_BANDS)[number];
export type WritingPromptCoachId = "general" | "ielts_task1" | "ielts_task2";

type ChartMaterial = {
  kind: "line_graph" | "bar_chart" | "pie_chart";
  title: string;
  unit: string;
  categories: string[];
  series: Array<{ name: string; values: number[] }>;
  keyFeatures: string[];
  comparisons: string[];
};

type TableMaterial = {
  kind: "table";
  title: string;
  unit: string;
  columns: string[];
  rows: Array<{ label: string; values: number[] }>;
  keyFeatures: string[];
  comparisons: string[];
};

type ProcessMaterial = {
  kind: "process";
  title: string;
  stages: Array<{ label: string; description: string }>;
  keyFeatures: string[];
};

type MapMaterial = {
  kind: "map";
  title: string;
  beforeLabel: string;
  afterLabel: string;
  features: Array<{ place: string; before: string; after: string }>;
  keyFeatures: string[];
};

export type WritingTaskMaterial =
  | ChartMaterial
  | TableMaterial
  | ProcessMaterial
  | MapMaterial;

export type WritingPromptSource = {
  schemaVersion: 1;
  id: string;
  slug: string;
  family: WritingPromptFamily;
  taskType: WritingPromptTaskType;
  promptKind: WritingPromptKind;
  cefrBand: WritingPromptCefrBand | null;
  title: string;
  promptText: string;
  coachId: WritingPromptCoachId;
  topic: string;
  targetWords: number;
  targetMinutes: number;
  sourceLabel: string;
  assetAltText?: string;
  material?: WritingTaskMaterial;
};

export type GeneratedWritingPrompt = WritingPromptSource & {
  taskMaterialJson: string | null;
  assetPath: string | null;
  assetDigest: string | null;
  accessibleDescription: string | null;
  contentHash: string;
};

export type WritingAssignmentSnapshot = {
  schemaVersion: 1;
  promptId: string;
  promptSlug: string;
  contentHash: string;
  family: WritingPromptFamily;
  taskType: WritingPromptTaskType;
  promptKind: WritingPromptKind;
  cefrBand: WritingPromptCefrBand | null;
  title: string;
  promptText: string;
  coachId: WritingPromptCoachId;
  topic: string;
  targetWords: number;
  targetMinutes: number;
  sourceLabel: string;
  taskMaterial: WritingTaskMaterial | null;
  asset: {
    path: string;
    digest: string;
    altText: string;
    accessibleDescription: string;
  } | null;
};

export type PromptValidationIssue = {
  path: string;
  message: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isOneOf = <T extends string>(value: unknown, choices: readonly T[]): value is T =>
  typeof value === "string" && choices.includes(value as T);

const hasText = (value: unknown, min: number, max: number): value is string =>
  typeof value === "string" && value.trim().length >= min && value.trim().length <= max;

const addTextIssue = (
  issues: PromptValidationIssue[],
  value: unknown,
  path: string,
  min: number,
  max: number
) => {
  if (!hasText(value, min, max)) {
    issues.push({ path, message: `must contain ${min}-${max} characters` });
  }
};

const validateStringArray = (
  issues: PromptValidationIssue[],
  value: unknown,
  path: string,
  minimum: number
) => {
  if (!Array.isArray(value) || value.length < minimum) {
    issues.push({ path, message: `must contain at least ${minimum} entries` });
    return;
  }
  value.forEach((entry, index) => addTextIssue(issues, entry, `${path}[${index}]`, 1, 240));
};

const validateTaskMaterial = (
  value: unknown,
  expectedKind: WritingPromptKind,
  path: string
): PromptValidationIssue[] => {
  const issues: PromptValidationIssue[] = [];
  if (!isRecord(value)) return [{ path, message: "is required and must be an object" }];
  if (value.kind !== expectedKind) {
    issues.push({ path: `${path}.kind`, message: `must equal ${expectedKind}` });
    return issues;
  }
  addTextIssue(issues, value.title, `${path}.title`, 3, 160);
  validateStringArray(issues, value.keyFeatures, `${path}.keyFeatures`, 2);

  if (expectedKind === "line_graph" || expectedKind === "bar_chart" || expectedKind === "pie_chart") {
    addTextIssue(issues, value.unit, `${path}.unit`, 1, 50);
    validateStringArray(issues, value.categories, `${path}.categories`, 2);
    if (!Array.isArray(value.series) || value.series.length < 1) {
      issues.push({ path: `${path}.series`, message: "must contain at least one series" });
    } else {
      const categoryCount = Array.isArray(value.categories) ? value.categories.length : -1;
      value.series.forEach((series, index) => {
        if (!isRecord(series)) {
          issues.push({ path: `${path}.series[${index}]`, message: "must be an object" });
          return;
        }
        addTextIssue(issues, series.name, `${path}.series[${index}].name`, 1, 80);
        if (
          !Array.isArray(series.values) ||
          series.values.length !== categoryCount ||
          series.values.some((number) => typeof number !== "number" || !Number.isFinite(number))
        ) {
          issues.push({
            path: `${path}.series[${index}].values`,
            message: "must contain one finite number per category"
          });
        }
      });
    }
    validateStringArray(issues, value.comparisons, `${path}.comparisons`, 1);
  } else if (expectedKind === "table") {
    addTextIssue(issues, value.unit, `${path}.unit`, 1, 50);
    validateStringArray(issues, value.columns, `${path}.columns`, 2);
    if (!Array.isArray(value.rows) || value.rows.length < 2) {
      issues.push({ path: `${path}.rows`, message: "must contain at least two rows" });
    } else {
      const columnCount = Array.isArray(value.columns) ? value.columns.length : -1;
      value.rows.forEach((row, index) => {
        if (!isRecord(row)) {
          issues.push({ path: `${path}.rows[${index}]`, message: "must be an object" });
          return;
        }
        addTextIssue(issues, row.label, `${path}.rows[${index}].label`, 1, 80);
        if (
          !Array.isArray(row.values) ||
          row.values.length !== columnCount ||
          row.values.some((number) => typeof number !== "number" || !Number.isFinite(number))
        ) {
          issues.push({
            path: `${path}.rows[${index}].values`,
            message: "must contain one finite number per column"
          });
        }
      });
    }
    validateStringArray(issues, value.comparisons, `${path}.comparisons`, 1);
  } else if (expectedKind === "process") {
    if (!Array.isArray(value.stages) || value.stages.length < 4) {
      issues.push({ path: `${path}.stages`, message: "must contain at least four stages" });
    } else {
      value.stages.forEach((stage, index) => {
        if (!isRecord(stage)) {
          issues.push({ path: `${path}.stages[${index}]`, message: "must be an object" });
          return;
        }
        addTextIssue(issues, stage.label, `${path}.stages[${index}].label`, 1, 80);
        addTextIssue(issues, stage.description, `${path}.stages[${index}].description`, 5, 240);
      });
    }
  } else if (expectedKind === "map") {
    addTextIssue(issues, value.beforeLabel, `${path}.beforeLabel`, 2, 40);
    addTextIssue(issues, value.afterLabel, `${path}.afterLabel`, 2, 40);
    if (!Array.isArray(value.features) || value.features.length < 4) {
      issues.push({ path: `${path}.features`, message: "must contain at least four places" });
    } else {
      value.features.forEach((feature, index) => {
        if (!isRecord(feature)) {
          issues.push({ path: `${path}.features[${index}]`, message: "must be an object" });
          return;
        }
        addTextIssue(issues, feature.place, `${path}.features[${index}].place`, 1, 80);
        addTextIssue(issues, feature.before, `${path}.features[${index}].before`, 1, 160);
        addTextIssue(issues, feature.after, `${path}.features[${index}].after`, 1, 160);
      });
    }
  }
  return issues;
};

export const validateWritingPrompt = (
  value: unknown,
  path = "prompt"
): PromptValidationIssue[] => {
  const issues: PromptValidationIssue[] = [];
  if (!isRecord(value)) return [{ path, message: "must be an object" }];

  if (value.schemaVersion !== WRITING_PROMPT_SCHEMA_VERSION) {
    issues.push({ path: `${path}.schemaVersion`, message: "must equal 1" });
  }
  addTextIssue(issues, value.id, `${path}.id`, 8, 120);
  if (typeof value.id === "string" && !/^wp_[a-z0-9_]+$/.test(value.id)) {
    issues.push({ path: `${path}.id`, message: "must use the wp_snake_case format" });
  }
  addTextIssue(issues, value.slug, `${path}.slug`, 5, 100);
  if (typeof value.slug === "string" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug)) {
    issues.push({ path: `${path}.slug`, message: "must be a lowercase kebab-case slug" });
  }
  if (!isOneOf(value.family, WRITING_PROMPT_FAMILIES)) {
    issues.push({ path: `${path}.family`, message: "must be general or ielts" });
  }
  if (!isOneOf(value.taskType, WRITING_PROMPT_TASK_TYPES)) {
    issues.push({ path: `${path}.taskType`, message: "has an unsupported task type" });
  }
  if (!isOneOf(value.promptKind, WRITING_PROMPT_KINDS)) {
    issues.push({ path: `${path}.promptKind`, message: "has an unsupported prompt kind" });
  }
  addTextIssue(issues, value.title, `${path}.title`, 3, 120);
  addTextIssue(issues, value.promptText, `${path}.promptText`, 20, 2000);
  addTextIssue(issues, value.topic, `${path}.topic`, 2, 80);
  addTextIssue(issues, value.sourceLabel, `${path}.sourceLabel`, 2, 120);
  if (
    typeof value.targetWords !== "number" ||
    !Number.isInteger(value.targetWords) ||
    value.targetWords < 40 ||
    value.targetWords > 400
  ) {
    issues.push({ path: `${path}.targetWords`, message: "must be an integer from 40 to 400" });
  }
  if (
    typeof value.targetMinutes !== "number" ||
    !Number.isInteger(value.targetMinutes) ||
    value.targetMinutes < 5 ||
    value.targetMinutes > 60
  ) {
    issues.push({ path: `${path}.targetMinutes`, message: "must be an integer from 5 to 60" });
  }

  const isGeneral = value.family === "general";
  const isTask1 = value.taskType === "academic_task_1";
  const isTask2 = value.taskType === "academic_task_2";
  if (isGeneral) {
    if (value.taskType !== "guided" || value.coachId !== "general") {
      issues.push({ path, message: "general prompts must use the guided task and general coach" });
    }
    if (!isOneOf(value.cefrBand, WRITING_PROMPT_CEFR_BANDS)) {
      issues.push({ path: `${path}.cefrBand`, message: "is required for general prompts" });
    }
    if (value.material != null || value.assetAltText != null) {
      issues.push({ path, message: "general prompts cannot contain Task 1 material" });
    }
  } else if (value.family === "ielts") {
    if (value.cefrBand != null) {
      issues.push({ path: `${path}.cefrBand`, message: "must be null for IELTS prompts" });
    }
    if (isTask1) {
      if (value.coachId !== "ielts_task1" || value.targetWords !== 150) {
        issues.push({ path, message: "IELTS Task 1 must use its coach and a 150-word target" });
      }
      addTextIssue(issues, value.assetAltText, `${path}.assetAltText`, 20, 300);
      if (isOneOf(value.promptKind, WRITING_PROMPT_KINDS)) {
        issues.push(...validateTaskMaterial(value.material, value.promptKind, `${path}.material`));
      }
    } else if (isTask2) {
      if (value.coachId !== "ielts_task2" || value.targetWords !== 250) {
        issues.push({ path, message: "IELTS Task 2 must use its coach and a 250-word target" });
      }
      if (value.material != null || value.assetAltText != null) {
        issues.push({ path, message: "IELTS Task 2 cannot contain Task 1 material" });
      }
    } else {
      issues.push({ path: `${path}.taskType`, message: "IELTS prompts must be Task 1 or Task 2" });
    }
  }

  const leakText = `${String(value.title ?? "")} ${String(value.promptText ?? "")}`;
  if (/\b(model|sample) answer\b|\banswer\s*:/i.test(leakText)) {
    issues.push({ path: `${path}.promptText`, message: "appears to leak an answer or explanation" });
  }
  return issues;
};

export const validateWritingPromptBatch = (value: unknown): PromptValidationIssue[] => {
  if (!Array.isArray(value)) return [{ path: "prompts", message: "must be an array" }];
  const issues = value.flatMap((prompt, index) => validateWritingPrompt(prompt, `prompts[${index}]`));
  const seen = new Map<string, number>();
  (["id", "slug", "title"] as const).forEach((field) => {
    value.forEach((prompt, index) => {
      if (!isRecord(prompt) || typeof prompt[field] !== "string") return;
      const key = `${field}:${String(prompt[field]).toLowerCase()}`;
      const previous = seen.get(key);
      if (previous != null) {
        issues.push({
          path: `prompts[${index}].${field}`,
          message: `duplicates prompts[${previous}].${field}`
        });
      } else {
        seen.set(key, index);
      }
    });
  });

  WRITING_PROMPT_CEFR_BANDS.forEach((band) => {
    const count = value.filter(
      (prompt) => isRecord(prompt) && prompt.family === "general" && prompt.cefrBand === band
    ).length;
    if (count !== 6) issues.push({ path: "prompts", message: `must contain 6 ${band} prompts; found ${count}` });
  });
  const task1 = value.filter(
    (prompt) => isRecord(prompt) && prompt.taskType === "academic_task_1"
  );
  const task2 = value.filter(
    (prompt) => isRecord(prompt) && prompt.taskType === "academic_task_2"
  );
  if (task1.length !== 12) issues.push({ path: "prompts", message: `must contain 12 IELTS Task 1 prompts; found ${task1.length}` });
  if (task2.length !== 12) issues.push({ path: "prompts", message: `must contain 12 IELTS Task 2 prompts; found ${task2.length}` });
  (["line_graph", "bar_chart", "pie_chart", "table", "process", "map"] as const).forEach((kind) => {
    const count = task1.filter((prompt) => isRecord(prompt) && prompt.promptKind === kind).length;
    if (count !== 2) issues.push({ path: "prompts", message: `must contain 2 Task 1 ${kind} prompts; found ${count}` });
  });
  (["opinion_essay", "discussion", "problem_solution", "advantages_disadvantages"] as const).forEach((kind) => {
    const count = task2.filter((prompt) => isRecord(prompt) && prompt.promptKind === kind).length;
    if (count !== 3) issues.push({ path: "prompts", message: `must contain 3 Task 2 ${kind} prompts; found ${count}` });
  });
  if (value.length !== 48) issues.push({ path: "prompts", message: `must contain exactly 48 prompts; found ${value.length}` });
  return issues;
};

export const buildWritingAssignmentSnapshot = (
  prompt: GeneratedWritingPrompt
): WritingAssignmentSnapshot => ({
  schemaVersion: 1,
  promptId: prompt.id,
  promptSlug: prompt.slug,
  contentHash: prompt.contentHash,
  family: prompt.family,
  taskType: prompt.taskType,
  promptKind: prompt.promptKind,
  cefrBand: prompt.cefrBand,
  title: prompt.title,
  promptText: prompt.promptText,
  coachId: prompt.coachId,
  topic: prompt.topic,
  targetWords: prompt.targetWords,
  targetMinutes: prompt.targetMinutes,
  sourceLabel: prompt.sourceLabel,
  taskMaterial: prompt.material ?? null,
  asset:
    prompt.assetPath && prompt.assetDigest && prompt.assetAltText && prompt.accessibleDescription
      ? {
          path: prompt.assetPath,
          digest: prompt.assetDigest,
          altText: prompt.assetAltText,
          accessibleDescription: prompt.accessibleDescription
        }
      : null
});
