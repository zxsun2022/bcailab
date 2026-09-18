/** Reading context gate. See docs/spikes/reading-context-bias-protocol.md. No production writes. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { buildSpikePrompt, callOnce, inferMimeType, loadEnvValue } from "./grader-variance";
import { CONDITIONS, RUNS, LIMITS, parseManifest, evaluateBias, type Run } from "./grader-bias/metrics";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const digest = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");

const main = async () => {
  const argv = process.argv.slice(2);
  const read = (flag: string) => { const at = argv.indexOf(flag); return at < 0 ? undefined : argv[at + 1]; };
  const input = read("--manifest");
  if (!input || argv.includes("--help")) {
    console.log("Usage: pnpm exec tsx scripts/grader-bias.ts --manifest <json> [--run] [--out-dir <new directory>]");
    console.log("Default: validate corpus and audio hashes only, no model calls. --run requires the manifest committed at HEAD.");
    return;
  }
  const manifestPath = path.resolve(input);
  const raw = await readFile(manifestPath, "utf8");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("Manifest is not valid JSON."); }
  const manifest = parseManifest(parsed);
  const assets = new Map<string, { audioBase64: string; audioMime: string }>();
  for (const recording of manifest.recordings) {
    const audioPath = path.resolve(path.dirname(manifestPath), recording.audio);
    const bytes = await readFile(audioPath);
    if (bytes.length === 0 || bytes.length > 20 * 1024 * 1024) throw new Error("Audio must contain 1–20 MiB.");
    if (digest(bytes) !== recording.audioSha256) throw new Error(`Audio hash mismatch for ${recording.id}.`);
    assets.set(recording.id, { audioBase64: bytes.toString("base64"), audioMime: inferMimeType(audioPath) });
  }
  console.log(`Validated ${manifest.recordings.length} recordings; full experiment needs ${manifest.recordings.length * RUNS * CONDITIONS.length} model calls.`);
  if (!argv.includes("--run")) return;

  const relative = path.relative(root, manifestPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Commit the manifest inside the repository before running.");
  let registered: string;
  try { registered = execFileSync("git", ["show", `HEAD:${relative}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
  catch { throw new Error("Commit the manifest before running. No model calls made."); }
  if (registered !== raw) throw new Error("Manifest differs from HEAD; commit its annotations before running.");
  const experimentFiles = [
    "scripts/grader-bias.ts", "scripts/grader-bias/metrics.ts", "scripts/grader-variance.ts",
    "apps/web/app/utils/esl-reading-eval.server.ts", "apps/web/app/utils/learner-model.ts",
    "apps/web/app/utils/passage-tags.ts", "apps/web/app/utils/dictation-diff.ts",
    "apps/web/app/utils/llm.server.ts"
  ];
  for (const file of experimentFiles) {
    let committed: string;
    try { committed = execFileSync("git", ["show", `HEAD:${file}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
    catch { throw new Error("Commit the experiment code before running."); }
    if (await readFile(path.join(root, file), "utf8") !== committed) throw new Error("Experiment code differs from HEAD; commit it before running.");
  }
  const apiKey = await loadEnvValue("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  const baseUrl = await loadEnvValue("GEMINI_BASE_URL") ?? undefined;
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.resolve(read("--out-dir") ?? path.join(root, "docs/spikes", `reading-bias-${stamp}`));
  // A new directory prevents an accidental rerun from overwriting a failed experiment.
  await mkdir(path.dirname(outDir), { recursive: true });
  await mkdir(outDir);
  const runs: Run[] = [];
  const promptHashes: Record<string, string> = {};
  const metadata = { commit, manifestSha256: digest(raw), model: manifest.model, limits: LIMITS,
    repeats: RUNS, startedAt: new Date().toISOString(),
    productionPromptModuleSha256: digest(await readFile(path.join(root, "apps/web/app/utils/esl-reading-eval.server.ts"))) };
  const save = async (complete: boolean) => writeFile(path.join(outDir, "runs.json"),
    JSON.stringify({ ...metadata, complete, promptHashes, runs }, null, 2) + "\n");
  await save(false);
  // Interleave and rotate conditions to reduce order/time effects, without adaptive stopping.
  for (let repeat = 0; repeat < RUNS; repeat++) {
    for (const [recordingIndex, recording] of manifest.recordings.entries()) {
      for (let offset = 0; offset < CONDITIONS.length; offset++) {
        const condition = CONDITIONS[(repeat + recordingIndex + offset) % CONDITIONS.length]!;
        const prompt = buildSpikePrompt({ passageText: recording.passage, mode: "reading", lang: "en",
          durationSeconds: recording.durationSeconds,
          brief: condition === "brief" ? recording.brief : undefined,
          learnerProfile: condition === "legacy" ? { persistent_issues: recording.persistentIssues, strengths: [] } : null });
        promptHashes[`${recording.id}:${condition}`] = digest(prompt);
        const { result } = await callOnce({ apiKey, baseUrl, model: manifest.model, prompt, ...assets.get(recording.id)! });
        runs.push({ recordingId: recording.id, condition, repeat, overall: result.overall,
          highlights: result.highlights.map(h => ({ kind: h.kind, text_quote: h.text_quote, text_span: h.text_span })) });
        await save(false);
        console.log(`Completed ${runs.length}/${manifest.recordings.length * RUNS * CONDITIONS.length} calls.`);
      }
    }
  }
  const comparisons = evaluateBias(manifest, runs);
  await save(true);
  await writeFile(path.join(outDir, "summary.json"), JSON.stringify({ ...metadata, comparisons }, null, 2) + "\n");
  const lines = ["# Reading context bias evaluation", "", `Commit: ${commit}`, `Model: ${manifest.model}`,
    `Manifest SHA-256: ${digest(raw)}`, "", "| Condition | Pass | Pooled score shift | Absent-tag accuracy drop | Other-error recall drop |",
    "|---|---|---|---|---|"];
  for (const result of comparisons) {
    lines.push(`| ${result.condition} | ${result.pass} | ${result.pooledMeanShift.toFixed(3)} | ${result.absentAccuracyDrop.toFixed(4)} | ${result.otherRecallDrop.toFixed(4)} |`);
  }
  lines.push("", "## Per-recording mean score shifts", "", "| Recording | Brief | Legacy |", "|---|---|---|");
  manifest.recordings.forEach((r, index) => lines.push(`| ${r.id} | ${comparisons[0]!.recordingShifts[index]!.meanShift.toFixed(3)} | ${comparisons[1]!.recordingShifts[index]!.meanShift.toFixed(3)} |`));
  lines.push("", "Thresholds are the roadmap's pre-registered limits. Both comparisons are reported even if one fails.",
    "A pass is limited to this corpus/model/prompt; it does not automatically enable context or mark the work accepted.",
    "A failure must be brought to the owner. No threshold adjustment or production mutation was performed.", "");
  await writeFile(path.join(outDir, "report.md"), lines.join("\n"));
  console.log(`Wrote ${path.relative(root, outDir)}. Brief: ${comparisons[0]!.pass ? "PASS" : "FAIL"}; legacy: ${comparisons[1]!.pass ? "PASS" : "FAIL"}.`);
  if (comparisons.some(r => !r.pass)) process.exitCode = 2;
};

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Bias experiment failed.");
  process.exitCode = 1;
});
