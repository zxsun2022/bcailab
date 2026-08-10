import {
  buildWritingAssignmentSnapshot,
  validateWritingPrompt,
  type GeneratedWritingPrompt,
  type WritingAssignmentSnapshot,
  type WritingPrompt,
  type WritingPromptSource,
  type WritingTaskMaterial
} from "@bcailab/db";

const assetDigestFromPath = (assetPath: string | null): string | null => {
  if (!assetPath) return null;
  return assetPath.match(/\/([a-f0-9]{64})\.svg$/)?.[1] ?? null;
};

export const materializeWritingPrompt = (
  row: WritingPrompt
): { prompt: GeneratedWritingPrompt; snapshot: WritingAssignmentSnapshot } => {
  let material: WritingTaskMaterial | undefined;
  if (row.task_material_json) {
    try {
      material = JSON.parse(row.task_material_json) as WritingTaskMaterial;
    } catch {
      throw new Error(`Writing prompt ${row.id} has invalid canonical material JSON.`);
    }
  }

  const source: WritingPromptSource = {
    schemaVersion: 1,
    id: row.id,
    slug: row.slug,
    family: row.family,
    taskType: row.task_type,
    promptKind: row.prompt_kind,
    cefrBand: row.cefr_band,
    title: row.title,
    promptText: row.prompt_text,
    coachId: row.coach_id,
    topic: row.topic,
    targetWords: row.target_words,
    targetMinutes: row.target_minutes,
    sourceLabel: row.source_label,
    ...(row.asset_alt_text ? { assetAltText: row.asset_alt_text } : {}),
    ...(material ? { material } : {})
  };
  const issues = validateWritingPrompt(source);
  if (issues.length > 0) {
    throw new Error(
      `Writing prompt ${row.id} violates the runtime contract: ${issues[0]!.path} ${issues[0]!.message}`
    );
  }

  const assetDigest = assetDigestFromPath(row.asset_path);
  if (row.task_type === "academic_task_1" && !assetDigest) {
    throw new Error(`Writing prompt ${row.id} has no content-addressed Task 1 asset.`);
  }
  const prompt: GeneratedWritingPrompt = {
    ...source,
    taskMaterialJson: row.task_material_json,
    assetPath: row.asset_path,
    assetDigest,
    accessibleDescription: row.accessible_description,
    contentHash: row.content_hash
  };
  return { prompt, snapshot: buildWritingAssignmentSnapshot(prompt) };
};

export const parseWritingAssignmentSnapshot = (
  value: string | null
): WritingAssignmentSnapshot | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as WritingAssignmentSnapshot;
    if (
      parsed?.schemaVersion !== 1 ||
      typeof parsed.promptId !== "string" ||
      typeof parsed.contentHash !== "string" ||
      typeof parsed.promptText !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};
