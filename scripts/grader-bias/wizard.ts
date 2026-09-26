/**
 * Local guide for the Reading bias gate (roadmap Now, criterion (d)). It walks the owner through
 * the corpus kit in a browser: decisions, recording, listen-check, freezing, pre-registration and
 * the runs. It edits only the kit's own files and runs the existing CLIs unchanged, so every
 * safeguard those CLIs enforce (TODO refusal, validation, the HEAD check) still applies.
 *
 *   pnpm bias:wizard            then open http://127.0.0.1:4321
 *
 * Binds to 127.0.0.1 only. Writes: draft.json, audio/ (git-ignored), and whatever the CLIs write.
 * Never calls a model itself, never commits, never touches D1, R2 or Pages.
 */
import http from "node:http";
import { readFile, writeFile, mkdir, readdir, stat, unlink, mkdtemp } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";
import { passageExposure, type CorpusDraft } from "./draft";
import { loadEnvValue } from "../grader-variance";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const corpusDir = path.join(root, "docs/spikes/reading-bias-corpus");
const spikesDir = path.join(root, "docs/spikes");
const audioDir = path.join(corpusDir, "audio");
const draftPath = path.join(corpusDir, "draft.json");
const templatePath = path.join(corpusDir, "draft.template.json");
const manifestPath = path.join(corpusDir, "manifest.json");
const rel = (file: string) => path.relative(root, file);

const PORT = Number(process.env.BIAS_WIZARD_PORT ?? 4321);
const AUDIO_TYPES: Record<string, string> = {
  ".wav": "audio/wav", ".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".webm": "audio/webm", ".ogg": "audio/ogg"
};
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

type WizardDraft = CorpusDraft & { ownerDecisions?: Record<string, unknown> };

const git = (args: string[]): string | null => {
  try { return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
  catch { return null; }
};
const committedAtHead = async (file: string): Promise<boolean> => {
  const head = git(["show", `HEAD:${rel(file)}`]);
  if (head === null || !existsSync(file)) return false;
  return head === await readFile(file, "utf8");
};
const mtime = async (file: string) => (existsSync(file) ? (await stat(file)).mtimeMs : 0);

/** The model production Reading evaluation uses, read from the routing table rather than copied. */
const productionModel = async (): Promise<string | null> => {
  const source = await readFile(path.join(root, "apps/web/app/utils/llm.server.ts"), "utf8");
  return source.match(/const EVAL_MODEL = "([^"]+)"/)?.[1] ?? null;
};

const loadDraft = async (): Promise<WizardDraft> =>
  JSON.parse(await readFile(existsSync(draftPath) ? draftPath : templatePath, "utf8")) as WizardDraft;
const saveDraft = async (draft: WizardDraft) => writeFile(draftPath, JSON.stringify(draft, null, 2) + "\n");

const audioFor = async (id: string): Promise<{ file: string; bytes: number } | null> => {
  for (const ext of Object.keys(AUDIO_TYPES)) {
    const file = path.join(audioDir, id + ext);
    if (existsSync(file)) return { file: path.basename(file), bytes: (await stat(file)).size };
  }
  return null;
};

/** Past outputs: full runs in docs/spikes/reading-bias-*, screens in grader-variance-prelim-*. */
const listReports = async () => {
  const entries = await readdir(spikesDir, { withFileTypes: true });
  const runs = [];
  for (const entry of entries.filter((e) => e.isDirectory() && e.name.startsWith("reading-bias-") && e.name !== "reading-bias-corpus")) {
    const dir = path.join(spikesDir, entry.name);
    const report = existsSync(path.join(dir, "report.md")) ? await readFile(path.join(dir, "report.md"), "utf8") : null;
    const summary = existsSync(path.join(dir, "summary.json"))
      ? JSON.parse(await readFile(path.join(dir, "summary.json"), "utf8")) as { comparisons?: { condition: string; pass: boolean }[] }
      : null;
    runs.push({ name: entry.name, report, comparisons: summary?.comparisons?.map(({ condition, pass }) => ({ condition, pass })) ?? null });
  }
  const screens = [];
  for (const entry of entries.filter((e) => e.isFile() && e.name.startsWith("grader-variance-prelim-"))) {
    screens.push({ name: entry.name, report: await readFile(path.join(spikesDir, entry.name), "utf8") });
  }
  return { runs: runs.sort((a, b) => b.name.localeCompare(a.name)), screens };
};

/* ---------- jobs: the existing CLIs, run one at a time ---------- */

type Job = { kind: string; running: boolean; exitCode: number | null; log: string[] };
let job: Job | null = null;

const runStep = (current: Job, script: string, args: string[]) => new Promise<number>((resolve) => {
  current.log.push(`$ tsx ${script} ${args.map((a) => (a.includes(" ") ? JSON.stringify(a) : a)).join(" ")}`);
  const child = spawn(process.execPath, ["--import", "tsx", path.join(root, script), ...args], { cwd: root, env: process.env });
  const push = (chunk: Buffer) => {
    for (const line of chunk.toString("utf8").split("\n")) if (line.trim()) current.log.push(line);
    if (current.log.length > 2000) current.log.splice(0, current.log.length - 2000);
  };
  child.stdout.on("data", push);
  child.stderr.on("data", push);
  child.on("close", (code) => resolve(code ?? 1));
});

const startJob = (kind: string, steps: () => Promise<[string, string[]][]>) => {
  if (job?.running) throw new HttpError(409, "另一个任务还在运行，请等它结束。");
  const current: Job = { kind, running: true, exitCode: null, log: [] };
  job = current;
  void (async () => {
    try {
      for (const [script, args] of await steps()) {
        const code = await runStep(current, script, args);
        current.exitCode = code;
        if (code !== 0) break;
      }
    } catch (error) {
      current.log.push(error instanceof Error ? error.message : String(error));
      current.exitCode = 1;
    } finally {
      current.running = false;
    }
  })();
};

/** Three five-call screens on one recording: no brief, a brief for the other tag, its own brief. */
const preliminarySteps = async (recordingId: string): Promise<[string, string[]][]> => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    model: string; recordings: { id: string; audio: string; passage: string; testedTag: string; brief: string }[];
  };
  const target = manifest.recordings.find((r) => r.id === recordingId) ?? fail(400, "未知录音。");
  const other = manifest.recordings.find((r) => r.testedTag !== target.testedTag) ?? fail(400, "manifest 缺少另一个标签。");
  const tmp = await mkdtemp(path.join(os.tmpdir(), "bias-wizard-"));
  const passage = path.join(tmp, "passage.txt");
  const trueBrief = path.join(tmp, "true-brief.txt");
  const falseBrief = path.join(tmp, "false-brief.txt");
  await writeFile(passage, target.passage);
  await writeFile(trueBrief, target.brief);
  await writeFile(falseBrief, other.brief);
  const base = ["--audio", path.join(corpusDir, target.audio), "--passage", passage, "--runs", "5",
    "--lang", "en", "--model", manifest.model];
  return [
    ["scripts/grader-variance.ts", [...base, "--label", `prelim-${target.id}-no-brief`]],
    ["scripts/grader-variance.ts", [...base, "--brief", falseBrief, "--label", `prelim-${target.id}-false-brief`]],
    ["scripts/grader-variance.ts", [...base, "--brief", trueBrief, "--label", `prelim-${target.id}-true-brief`]]
  ];
};

/* ---------- HTTP ---------- */

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const fail = (status: number, message: string): never => { throw new HttpError(status, message); };

const readBody = (req: http.IncomingMessage, limit: number) => new Promise<Buffer>((resolve, reject) => {
  const chunks: Buffer[] = [];
  let size = 0;
  req.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size > limit) { reject(new HttpError(413, "文件太大（上限 20 MiB）。")); req.destroy(); return; }
    chunks.push(chunk);
  });
  req.on("end", () => resolve(Buffer.concat(chunks)));
  req.on("error", reject);
});

const state = async () => {
  const draft = await loadDraft();
  const audio: Record<string, { file: string; bytes: number } | null> = {};
  for (const recording of draft.recordings) audio[recording.id] = await audioFor(recording.id);
  const exposure: Record<string, ReturnType<typeof passageExposure>> = {};
  for (const [key, text] of Object.entries(draft.passages)) exposure[key] = passageExposure(text);
  const manifestExists = existsSync(manifestPath);
  const audioTimes = await Promise.all(draft.recordings.map((r) => mtime(path.join(corpusDir, r.audio))));
  const manifestTime = await mtime(manifestPath);
  return {
    productionModel: await productionModel(),
    hasApiKey: Boolean(await loadEnvValue("GEMINI_API_KEY")),
    branch: git(["branch", "--show-current"])?.trim() || null,
    draftExists: existsSync(draftPath),
    draft,
    audio,
    exposure,
    manifestExists,
    manifestFresh: manifestExists && manifestTime >= Math.max(await mtime(draftPath), ...audioTimes),
    draftCommitted: await committedAtHead(draftPath),
    manifestCommitted: await committedAtHead(manifestPath),
    paths: { draft: rel(draftPath), manifest: rel(manifestPath) },
    reports: await listReports(),
    job
  };
};

/** Once the manifest is registered at HEAD, the corpus is frozen: editing it means a new experiment. */
const assertEditable = async () => {
  if (await committedAtHead(manifestPath)) {
    fail(409, "manifest 已在 HEAD 预注册，语料已冻结。要修改就得作为新实验重新注册。");
  }
};

const handle = async (req: http.IncomingMessage, res: http.ServerResponse) => {
  const host = req.headers.host ?? "";
  if (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}`) fail(403, "Forbidden host.");
  // A custom header forces a CORS preflight this server never answers, so no other site can post here.
  if (req.method === "POST" && req.headers["x-wizard"] !== "1") fail(403, "Missing wizard header.");
  const url = new URL(req.url ?? "/", `http://${host}`);
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  };

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(await readFile(path.join(here, "wizard.html")));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/state") return send(200, await state());

  const audioMatch = url.pathname.match(/^\/api\/audio\/([a-z0-9-]+)$/);
  if (audioMatch) {
    const id = audioMatch[1]!;
    const draft = await loadDraft();
    const recording = draft.recordings.find((r) => r.id === id) ?? fail(404, "未知录音。");
    if (req.method === "GET") {
      const found = await audioFor(id) ?? fail(404, "还没有录音。");
      res.writeHead(200, { "content-type": AUDIO_TYPES[path.extname(found.file)]!, "cache-control": "no-store" });
      res.end(await readFile(path.join(audioDir, found.file)));
      return;
    }
    if (req.method === "POST") {
      await assertEditable();
      const ext = url.searchParams.get("ext") ?? "";
      if (!AUDIO_TYPES[ext]) fail(400, `不支持的格式：${ext}。支持 ${Object.keys(AUDIO_TYPES).join(", ")}。`);
      const duration = Number(url.searchParams.get("duration"));
      if (!Number.isFinite(duration) || duration <= 0 || duration > 600) fail(400, "录音时长无效。");
      const bytes = await readBody(req, MAX_AUDIO_BYTES);
      if (bytes.length === 0) fail(400, "录音是空的。");
      await mkdir(audioDir, { recursive: true });
      for (const other of Object.keys(AUDIO_TYPES)) {
        const file = path.join(audioDir, id + other);
        if (existsSync(file)) await unlink(file);
      }
      await writeFile(path.join(audioDir, id + ext), bytes);
      recording.audio = `audio/${id}${ext}`;
      recording.durationSeconds = Math.round(duration * 10) / 10;
      // New audio has not been listened to: its earlier ground truth describes a different take.
      recording.groundTruth = "TODO: listen-check this take";
      await saveDraft(draft);
      return send(200, { ok: true });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/draft") {
    await assertEditable();
    const next = JSON.parse((await readBody(req, 1024 * 1024)).toString("utf8")) as WizardDraft;
    const current = await loadDraft();
    // Only the fields a person decides may change; passages, claims and the slate stay the kit's.
    if (typeof next.model === "string") current.model = next.model;
    if (typeof next.briefDate === "string") current.briefDate = next.briefDate;
    if (next.ownerDecisions && typeof next.ownerDecisions === "object") current.ownerDecisions = next.ownerDecisions;
    for (const incoming of next.recordings ?? []) {
      const recording = current.recordings.find((r) => r.id === incoming.id);
      if (recording && typeof incoming.groundTruth === "string") recording.groundTruth = incoming.groundTruth;
    }
    await saveDraft(current);
    return send(200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/job") {
    const { kind, recordingId } = JSON.parse((await readBody(req, 4096)).toString("utf8")) as { kind: string; recordingId?: string };
    const draftArg = rel(draftPath);
    const manifestArg = rel(manifestPath);
    if (kind === "prepare") {
      await assertEditable();
      startJob(kind, async () => [
        ["scripts/grader-bias/prepare.ts", ["--draft", draftArg]],
        ["scripts/grader-bias.ts", ["--manifest", manifestArg]]
      ]);
    } else if (kind === "prelim" || kind === "run") {
      if (!await committedAtHead(manifestPath)) fail(409, "请先提交 manifest（预注册），再调用模型。");
      if (!await loadEnvValue("GEMINI_API_KEY")) fail(409, "没有找到 GEMINI_API_KEY。");
      if (kind === "prelim") startJob(kind, () => preliminarySteps(recordingId ?? ""));
      else startJob(kind, async () => [["scripts/grader-bias.ts", ["--manifest", manifestArg, "--run"]]]);
    } else {
      fail(400, "未知任务。");
    }
    return send(200, { ok: true });
  }

  fail(404, "Not found.");
};

const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    const status = error instanceof HttpError ? error.status : 500;
    if (!(error instanceof HttpError)) console.error(error);
    if (!res.headersSent) res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error." }));
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Reading bias wizard: http://127.0.0.1:${PORT}`);
  console.log("Ctrl+C to stop. Only this machine can reach it.");
});
