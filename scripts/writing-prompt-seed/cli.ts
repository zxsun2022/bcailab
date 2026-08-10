import { execFileSync } from "node:child_process";
import { readFile, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  validateWritingPromptBatch,
  type GeneratedWritingPrompt,
  type PromptValidationIssue,
  type WritingPromptSource
} from "@bcailab/db";
import { deriveWritingPrompt, sha256, stableJson } from "./derive";

const SEED_DIR = import.meta.dirname;
const REPO_ROOT = path.resolve(SEED_DIR, "..", "..");
const SOURCE_PATH = path.join(SEED_DIR, "prompts.source.json");
const GENERATED_DIR = path.join(SEED_DIR, "generated");
const GENERATED_PATH = path.join(GENERATED_DIR, "prompts.generated.json");
const REVIEW_PATH = path.join(GENERATED_DIR, "review-pack.json");
const ASSET_DIR = path.join(REPO_ROOT, "apps", "web", "public", "writing", "task1");
const D1_NAME = "bcailab-db";

type DerivedBatch = {
  prompts: GeneratedWritingPrompt[];
  assets: Map<string, string>;
};

type ReviewPack = {
  schemaVersion: 1;
  batchHash: string;
  generatedAt: string;
  counts: { total: number; general: number; ieltsTask1: number; ieltsTask2: number };
  prompts: Array<{
    id: string;
    slug: string;
    title: string;
    contentHash: string;
    assetDigest: string | null;
    automatedValidation: "passed";
  }>;
  independentReview: { status: "pending" | "passed"; reviewer: string | null; reviewedAt: string | null };
  ownerReview: { status: "pending"; ownerApprovedHash: null; reviewedAt: null };
};

type ApprovalManifest = {
  schemaVersion: 1;
  batchHash: string;
  independentReview: { status: "passed"; reviewer: string; reviewedAt: string };
  ownerReview: {
    status: "approved";
    ownerApprovedHash: string;
    reviewer: string;
    reviewedAt: string;
  };
};

const HELP = `Writing prompt editorial pipeline

Usage:
  pnpm writing-prompts --help
  pnpm writing-prompts validate
  pnpm writing-prompts derive --check
  pnpm writing-prompts derive --write
  pnpm writing-prompts review-pack --check
  pnpm writing-prompts review-pack --write
  pnpm writing-prompts preflight
  pnpm writing-prompts preflight --local [--persist-to <dir>]
  pnpm writing-prompts preflight --remote
  pnpm writing-prompts publish --local --owner-manifest <file> [--persist-to <dir>]
  pnpm writing-prompts publish --remote --owner-manifest <file> --confirm-remote <batch-hash>
  pnpm writing-prompts verify --local [--persist-to <dir>]
  pnpm writing-prompts verify --remote

Safety:
  Bare/check commands read files only and make no network or D1 calls.
  Publish has no default target and always requires the current independent + owner approval manifest.
  Remote publish additionally requires the exact current batch hash through --confirm-remote.
`;

const readFlag = (args: string[], flag: string): string | null => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1]! : null;
};

const parseJsonFile = async <T>(filePath: string): Promise<T> =>
  JSON.parse(await readFile(filePath, "utf8")) as T;

const formatIssues = (issues: PromptValidationIssue[]): string =>
  issues.map((issue) => `- ${issue.path}: ${issue.message}`).join("\n");

const readSource = async (): Promise<WritingPromptSource[]> => {
  const source = await parseJsonFile<unknown>(SOURCE_PATH);
  const issues = validateWritingPromptBatch(source);
  if (issues.length > 0) {
    throw new Error(`Prompt validation failed:\n${formatIssues(issues)}`);
  }
  return source as WritingPromptSource[];
};

const deriveBatch = async (): Promise<DerivedBatch> => {
  const prompts: GeneratedWritingPrompt[] = [];
  const assets = new Map<string, string>();
  for (const source of await readSource()) {
    const derived = deriveWritingPrompt(source);
    prompts.push(derived.prompt);
    if (derived.svg && derived.prompt.assetDigest) {
      assets.set(`${derived.prompt.assetDigest}.svg`, derived.svg);
    }
  }
  return { prompts, assets };
};

const generatedJson = (prompts: GeneratedWritingPrompt[]): string =>
  `${JSON.stringify(prompts, null, 2)}\n`;

const buildReviewPack = (prompts: GeneratedWritingPrompt[]): ReviewPack => {
  const entries = prompts.map((prompt) => ({
    id: prompt.id,
    slug: prompt.slug,
    title: prompt.title,
    contentHash: prompt.contentHash,
    assetDigest: prompt.assetDigest,
    automatedValidation: "passed" as const
  }));
  return {
    schemaVersion: 1,
    batchHash: sha256(stableJson(entries)),
    generatedAt: "deterministic-from-content",
    counts: {
      total: prompts.length,
      general: prompts.filter((prompt) => prompt.family === "general").length,
      ieltsTask1: prompts.filter((prompt) => prompt.taskType === "academic_task_1").length,
      ieltsTask2: prompts.filter((prompt) => prompt.taskType === "academic_task_2").length
    },
    prompts: entries,
    independentReview: { status: "pending", reviewer: null, reviewedAt: null },
    ownerReview: { status: "pending", ownerApprovedHash: null, reviewedAt: null }
  };
};

const reviewJson = (pack: ReviewPack): string => `${JSON.stringify(pack, null, 2)}\n`;

const assertEqualFile = async (filePath: string, expected: string, label: string) => {
  let actual: string;
  try {
    actual = await readFile(filePath, "utf8");
  } catch {
    throw new Error(`${label} is missing. Run: pnpm writing-prompts derive --write`);
  }
  if (actual !== expected) {
    throw new Error(`${label} is stale. Run: pnpm writing-prompts derive --write`);
  }
};

const deriveCommand = async (args: string[]) => {
  const write = args.includes("--write");
  const check = args.includes("--check");
  if (write === check) throw new Error("derive requires exactly one of --check or --write.");
  const batch = await deriveBatch();
  const expectedNames = [...batch.assets.keys()].sort();
  if (write) {
    await mkdir(GENERATED_DIR, { recursive: true });
    await mkdir(ASSET_DIR, { recursive: true });
    await writeFile(GENERATED_PATH, generatedJson(batch.prompts), "utf8");
    for (const [name, svg] of batch.assets) {
      await writeFile(path.join(ASSET_DIR, name), svg, "utf8");
    }
    console.log(`Wrote ${batch.prompts.length} prompts and ${batch.assets.size} Task 1 assets.`);
    return;
  }
  await assertEqualFile(GENERATED_PATH, generatedJson(batch.prompts), "Generated prompt artifact");
  const actualNames = (await readdir(ASSET_DIR)).filter((name) => name.endsWith(".svg")).sort();
  if (actualNames.join("\n") !== expectedNames.join("\n")) {
    throw new Error("Task 1 asset set is stale. Run: pnpm writing-prompts derive --write");
  }
  for (const [name, svg] of batch.assets) {
    await assertEqualFile(path.join(ASSET_DIR, name), svg, `Task 1 asset ${name}`);
  }
  console.log(`Derived artifacts are current: ${batch.prompts.length} prompts, ${batch.assets.size} assets.`);
};

const reviewPackCommand = async (args: string[]) => {
  const write = args.includes("--write");
  const check = args.includes("--check");
  if (write === check) throw new Error("review-pack requires exactly one of --check or --write.");
  const batch = await deriveBatch();
  const expected = reviewJson(buildReviewPack(batch.prompts));
  if (write) {
    await mkdir(GENERATED_DIR, { recursive: true });
    await writeFile(REVIEW_PATH, expected, "utf8");
    console.log(`Wrote pending review pack for ${batch.prompts.length} prompts.`);
  } else {
    await assertEqualFile(REVIEW_PATH, expected, "Review pack");
    console.log("Review pack is current and still requires independent and owner approval.");
  }
};

const wranglerTarget = (args: string[]): { flags: string[]; remote: boolean } => {
  const local = args.includes("--local");
  const remote = args.includes("--remote");
  if (local === remote) throw new Error("Choose exactly one target: --local or --remote.");
  if (remote) return { flags: ["--remote"], remote: true };
  const persist = readFlag(args, "--persist-to") ?? "apps/web/.wrangler/state";
  return { flags: ["--local", "--persist-to", persist], remote: false };
};

const runWrangler = (args: string[]): string => {
  try {
    return execFileSync("pnpm", ["exec", "wrangler", ...args], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message?: string };
    throw new Error(failure.stderr || failure.stdout || failure.message || "Wrangler failed.");
  }
};

const d1Json = (sql: string, flags: string[]): Array<{ results?: Record<string, unknown>[] }> => {
  const output = runWrangler([
    "d1",
    "execute",
    D1_NAME,
    ...flags,
    "--json",
    "--command",
    sql
  ]);
  return JSON.parse(output) as Array<{ results?: Record<string, unknown>[] }>;
};

const preflightCommand = async (args: string[]) => {
  await readSource();
  if (!args.includes("--local") && !args.includes("--remote")) {
    console.log("File preflight passed. No D1 target was contacted.");
    return;
  }
  const target = wranglerTarget(args);
  const schema = d1Json(
    `SELECT
       (SELECT COUNT(*) FROM writing_prompts) AS prompt_count,
       (SELECT COUNT(*) FROM saved_translations) AS saved_count,
       (SELECT COUNT(*) FROM (
          SELECT article_id, round_number FROM writing_revisions
          GROUP BY article_id, round_number HAVING COUNT(*) > 1
        )) AS duplicate_rounds`,
    target.flags
  )[0]?.results?.[0];
  if (!schema) throw new Error("D1 preflight returned no schema result.");
  if (Number(schema.duplicate_rounds ?? 0) > 0) {
    throw new Error(`D1 has ${schema.duplicate_rounds} duplicate article/round groups; resolve them before migration or publication.`);
  }
  console.log(
    `D1 preflight passed (${target.remote ? "remote" : "local"}): ${schema.prompt_count} prompts, ${schema.saved_count} saved translations.`
  );
};

const sqlQuote = (value: string | null): string =>
  value == null ? "NULL" : `'${value.replace(/'/g, "''")}'`;

const buildPublishSql = (
  prompts: GeneratedWritingPrompt[],
  pack: ReviewPack,
  approval: ApprovalManifest
): string => {
  const reviewManifest = JSON.stringify({
    schemaVersion: 1,
    batchHash: pack.batchHash,
    independentReview: approval.independentReview,
    ownerReview: approval.ownerReview
  });
  const values = prompts
    .map((prompt) =>
      `(${[
        prompt.id,
        prompt.slug,
        prompt.family,
        prompt.taskType,
        prompt.promptKind,
        prompt.cefrBand,
        prompt.title,
        prompt.promptText,
        prompt.coachId,
        prompt.topic,
        String(prompt.targetWords),
        String(prompt.targetMinutes),
        prompt.taskMaterialJson,
        prompt.assetPath,
        prompt.assetAltText ?? null,
        prompt.accessibleDescription,
        prompt.sourceLabel,
        prompt.contentHash,
        reviewManifest,
        prompt.contentHash
      ]
        .map((value, index) => (index === 10 || index === 11 ? value : sqlQuote(value)))
        .join(", ")}, 'published', datetime('now'), datetime('now'))`
    )
    .join(",\n");
  return `INSERT INTO writing_prompts (
    id, slug, family, task_type, prompt_kind, cefr_band,
    title, prompt_text, coach_id, topic, target_words, target_minutes,
    task_material_json, asset_path, asset_alt_text, accessible_description,
    source_label, content_hash, review_manifest_json, owner_approved_hash,
    status, published_at, updated_at
  ) VALUES\n${values}
  ON CONFLICT(id) DO UPDATE SET
    slug = excluded.slug,
    family = excluded.family,
    task_type = excluded.task_type,
    prompt_kind = excluded.prompt_kind,
    cefr_band = excluded.cefr_band,
    title = excluded.title,
    prompt_text = excluded.prompt_text,
    coach_id = excluded.coach_id,
    topic = excluded.topic,
    target_words = excluded.target_words,
    target_minutes = excluded.target_minutes,
    task_material_json = excluded.task_material_json,
    asset_path = excluded.asset_path,
    asset_alt_text = excluded.asset_alt_text,
    accessible_description = excluded.accessible_description,
    source_label = excluded.source_label,
    content_hash = excluded.content_hash,
    review_manifest_json = excluded.review_manifest_json,
    owner_approved_hash = excluded.owner_approved_hash,
    status = 'published',
    reviewed_at = COALESCE(writing_prompts.reviewed_at, datetime('now')),
    published_at = COALESCE(writing_prompts.published_at, datetime('now')),
    retired_at = NULL,
    updated_at = datetime('now');`;
};

const loadCurrentReview = async (prompts: GeneratedWritingPrompt[]): Promise<ReviewPack> => {
  const expected = buildReviewPack(prompts);
  await assertEqualFile(REVIEW_PATH, reviewJson(expected), "Review pack");
  return expected;
};

const assertApproval = (
  approval: ApprovalManifest,
  pack: ReviewPack
): void => {
  if (
    approval.schemaVersion !== 1 ||
    approval.batchHash !== pack.batchHash ||
    approval.ownerReview?.ownerApprovedHash !== pack.batchHash ||
    approval.ownerReview?.status !== "approved" ||
    !approval.ownerReview.reviewer?.trim() ||
    !approval.ownerReview.reviewedAt?.trim() ||
    approval.independentReview?.status !== "passed" ||
    !approval.independentReview.reviewer?.trim() ||
    !approval.independentReview.reviewedAt?.trim()
  ) {
    throw new Error(
      `Approval manifest is missing current independent/owner approval for batch ${pack.batchHash}.`
    );
  }
};

const publishCommand = async (args: string[]) => {
  const target = wranglerTarget(args);
  const manifestFlag = readFlag(args, "--owner-manifest");
  if (!manifestFlag) throw new Error("publish requires --owner-manifest <file>.");
  const batch = await deriveBatch();
  await assertEqualFile(GENERATED_PATH, generatedJson(batch.prompts), "Generated prompt artifact");
  const pack = await loadCurrentReview(batch.prompts);
  const approvalPath = path.resolve(process.cwd(), manifestFlag);
  const approval = await parseJsonFile<ApprovalManifest>(approvalPath);
  assertApproval(approval, pack);
  if (target.remote && readFlag(args, "--confirm-remote") !== pack.batchHash) {
    throw new Error(`Remote publish requires --confirm-remote ${pack.batchHash}`);
  }
  const sql = buildPublishSql(batch.prompts, pack, approval);
  runWrangler([
    "d1",
    "execute",
    D1_NAME,
    ...target.flags,
    "--command",
    sql
  ]);
  console.log(`Published ${batch.prompts.length} reviewed prompts to ${target.remote ? "remote" : "local"} D1.`);
};

const verifyCommand = async (args: string[]) => {
  const target = wranglerTarget(args);
  const batch = await deriveBatch();
  const pack = buildReviewPack(batch.prompts);
  const quotedHashes = batch.prompts.map((prompt) => sqlQuote(prompt.contentHash)).join(", ");
  const row = d1Json(
    `SELECT COUNT(*) AS matching,
            SUM(CASE WHEN status = 'published' AND owner_approved_hash = content_hash THEN 1 ELSE 0 END) AS approved
     FROM writing_prompts WHERE content_hash IN (${quotedHashes})`,
    target.flags
  )[0]?.results?.[0];
  if (Number(row?.matching ?? 0) !== batch.prompts.length || Number(row?.approved ?? 0) !== batch.prompts.length) {
    throw new Error(
      `Verification failed for batch ${pack.batchHash}: expected ${batch.prompts.length}, found ${row?.matching ?? 0} matching and ${row?.approved ?? 0} approved.`
    );
  }
  console.log(`Verified ${batch.prompts.length} approved prompts for batch ${pack.batchHash}.`);
};

const main = async () => {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || command === "help") {
    console.log(HELP);
    return;
  }
  if (command === "validate") {
    const prompts = await readSource();
    console.log(`Validated ${prompts.length} source prompts: 24 general, 12 IELTS Task 1, 12 IELTS Task 2.`);
    return;
  }
  if (command === "derive") return deriveCommand(args);
  if (command === "review-pack") return reviewPackCommand(args);
  if (command === "preflight") return preflightCommand(args);
  if (command === "publish") return publishCommand(args);
  if (command === "verify") return verifyCommand(args);
  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
