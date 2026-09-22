import type { AppLoadContext } from "@remix-run/cloudflare";
import {
  claimEslReadingEvaluationRun,
  createEslReadingAttempt,
  failEslReadingEvaluationRun,
  getEslLearnerProfile,
  getEslReadingAttemptById,
  getPassageTags,
  incrementEslLearnerProfileCounters,
  insertLearnerTagObservations,
  listEslReadingAttemptsByPassage,
  listLatestEslReadingEvaluationsByPassage,
  recordPassageAttemptStat,
  saveEslReadingEvaluationResult,
  type Passage
} from "@bcailab/db";
import { evaluateEslReadingAttempt, FALLBACK_MODEL_NAME } from "~/utils/esl-reading-eval.server";
import { attributeReadingErrors } from "~/utils/learner-model";
import { scheduleLearnerModelRecompute } from "~/utils/learner-model.server";
import {
  ESL_PENDING_EVAL_STALE_MS,
  isSupportedEslAudioMime,
  isSupportedReadingMode,
  MAX_ESL_READING_AUDIO_BYTES,
  parseEslReadingEvaluationOutput,
  type EslLearnerProfileData,
  type EslReadingMode
} from "~/utils/esl-reading";
import {
  parseReadingOutputLanguage,
  type ReadingOutputLanguage
} from "~/utils/reading-settings";

const audioFormatByMime: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/aac": "aac",
  "audio/flac": "flac"
};

const audioMimeByFormat: Record<string, string> = {
  webm: "audio/webm",
  mp4: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  aac: "audio/aac",
  flac: "audio/flac"
};

export class EslAttemptSubmissionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "EslAttemptSubmissionError";
    this.status = status;
  }
}

export type ParsedEslAttemptSubmission = {
  mode: EslReadingMode;
  outputLanguage: ReadingOutputLanguage;
  durationMs: number | null;
  audioBuffer: ArrayBuffer;
  audioFormat: string;
  audioMimeType: string;
};

const inferAudioFormat = (mimeType: string, fileName: string): string | null => {
  const normalized = mimeType.split(";")[0].trim().toLowerCase();
  if (audioFormatByMime[normalized]) return audioFormatByMime[normalized];
  const ext = fileName.trim().toLowerCase().split(".").pop();
  if (!ext) return null;
  if (["webm", "mp4", "mp3", "wav", "ogg", "aac", "flac", "m4a"].includes(ext)) {
    return ext === "m4a" ? "mp4" : ext;
  }
  return null;
};

const buildAttemptR2Key = (userId: string, attemptId: string, extension: string): string => {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `esl/reading/${userId}/${year}/${month}/${attemptId}.${extension}`;
};

export const parseEslAttemptSubmission = async (
  formData: FormData
): Promise<ParsedEslAttemptSubmission> => {
  const modeRaw = String(formData.get("mode") ?? "reading");
  if (!isSupportedReadingMode(modeRaw)) {
    throw new EslAttemptSubmissionError("Invalid mode.");
  }
  const outputLanguage = parseReadingOutputLanguage(formData.get("outputLanguage"));

  const durationMsRaw = formData.get("durationMs");
  const durationMs = durationMsRaw ? Number(durationMsRaw) : null;

  const file = formData.get("audioFile");
  if (!(file instanceof File) || file.size <= 0) {
    throw new EslAttemptSubmissionError("Please record audio first.");
  }
  if (file.size > MAX_ESL_READING_AUDIO_BYTES) {
    throw new EslAttemptSubmissionError(
      `Audio exceeds ${(MAX_ESL_READING_AUDIO_BYTES / (1024 * 1024)).toFixed(0)}MB.`
    );
  }

  const providedMimeType = file.type || "application/octet-stream";
  if (file.type && !isSupportedEslAudioMime(file.type)) {
    throw new EslAttemptSubmissionError("Unsupported audio format.");
  }

  const audioFormat = inferAudioFormat(providedMimeType, file.name);
  if (!audioFormat) {
    throw new EslAttemptSubmissionError("Could not determine audio format.");
  }

  const mimeType =
    providedMimeType === "application/octet-stream"
      ? audioMimeByFormat[audioFormat] ?? "application/octet-stream"
      : providedMimeType;

  return {
    mode: modeRaw,
    outputLanguage,
    durationMs: durationMs && Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs) : null,
    audioBuffer: await file.arrayBuffer(),
    audioFormat,
    audioMimeType: mimeType.split(";")[0].trim().toLowerCase()
  };
};

type EvaluationTrigger = "submit" | "retry";

type EvaluationRun = {
  userId: string;
  attemptId: string;
  runId: string;
  trigger: EvaluationTrigger;
  passage: Passage;
  mode: EslReadingMode;
  outputLanguage: ReadingOutputLanguage;
  durationMs: number | null;
  audioBytes: Uint8Array;
  audioMimeType: string;
};

/**
 * One structured line per run event, so a run can be followed from `started` to its outcome in
 * `wrangler pages deployment tail`. A `started` line with no outcome line is a run the platform
 * cancelled (Cloudflare logs its own "waitUntil() tasks did not complete" warning alongside).
 * Identifiers and timings only: no audio, passage text or model output.
 */
const logRun = (
  run: Pick<EvaluationRun, "runId" | "attemptId" | "trigger">,
  event: string,
  fields: Record<string, unknown> = {}
) => {
  const line = JSON.stringify({
    event: "reading_evaluation",
    phase: event,
    runId: run.runId,
    attemptId: run.attemptId,
    trigger: run.trigger,
    ...fields
  });
  if (event.endsWith("error")) console.error(line);
  else console.log(line);
};

const errorText = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).slice(0, 300);

/** A side effect of a stored result. Its failure is logged and never touches the evaluation. */
const afterSave = async (
  run: EvaluationRun,
  name: string,
  task: () => Promise<unknown>
): Promise<void> => {
  try {
    await task();
  } catch (error) {
    logRun(run, "side_effect_error", { sideEffect: name, error: errorText(error) });
  }
};

const markRunFailed = async (context: AppLoadContext, run: EvaluationRun) => {
  try {
    const applied = await failEslReadingEvaluationRun(context.env.DB, {
      attemptId: run.attemptId,
      userId: run.userId,
      runId: run.runId
    });
    // Not applied: a newer run owns the attempt, or a result already exists. Either way this
    // run's failure is no longer the attempt's state.
    if (!applied) logRun(run, "failure_not_recorded");
  } catch (error) {
    logRun(run, "fail_write_error", { error: errorText(error) });
  }
};

const runReadingAttemptEvaluation = async (context: AppLoadContext, run: EvaluationRun) => {
  const startedAt = Date.now();
  const elapsedMs = () => Date.now() - startedAt;
  logRun(run, "started");

  // Everything up to the model's answer. Any failure here — reads included — is this run's
  // failure; previously the reads sat outside the try and a thrown read left the attempt pending.
  let evaluation: Awaited<ReturnType<typeof evaluateEslReadingAttempt>>;
  try {
    const allAttempts = await listEslReadingAttemptsByPassage(context.env.DB, {
      userId: run.userId,
      passageId: run.passage.id
    });
    const pastAttempts = allAttempts.filter((attempt) => attempt.id !== run.attemptId);
    const evaluations = await listLatestEslReadingEvaluationsByPassage(context.env.DB, {
      userId: run.userId,
      passageId: run.passage.id
    });
    const evaluationByAttemptId = new Map(
      evaluations.map((stored) => [stored.attempt_id, stored])
    );
    const historyEntries = pastAttempts.map((attempt) => {
      const stored = evaluationByAttemptId.get(attempt.id);
      const parsed = stored ? parseEslReadingEvaluationOutput(stored.output_json) : null;
      return {
        date: attempt.created_at,
        mode: attempt.mode,
        // A stored output without scores must not fail every later run on this passage.
        overallScore: parsed?.scores?.overall ?? 0,
        durationSeconds: attempt.duration_ms != null ? attempt.duration_ms / 1000 : null,
        fullEvaluation: parsed ?? undefined
      };
    });

    const profile = await getEslLearnerProfile(context.env.DB, run.userId);
    let learnerProfile: EslLearnerProfileData | null = null;
    if (profile) {
      try {
        learnerProfile = {
          persistent_issues: JSON.parse(profile.persistent_issues_json),
          strengths: JSON.parse(profile.strengths_json)
        };
      } catch {
        learnerProfile = null;
      }
    }

    evaluation = await evaluateEslReadingAttempt({
      env: context.env,
      passageText: run.passage.content_text,
      mode: run.mode,
      outputLanguage: run.outputLanguage,
      audioBytes: run.audioBytes,
      audioMimeType: run.audioMimeType,
      durationMs: run.durationMs,
      history: historyEntries,
      learnerProfile
    });
  } catch (error) {
    logRun(run, "evaluate_error", { elapsedMs: elapsedMs(), error: errorText(error) });
    await markRunFailed(context, run);
    return;
  }

  // Result and completed status are written in one batch; the first stored result wins.
  let saved: { saved: boolean; attemptExists: boolean };
  try {
    saved = await saveEslReadingEvaluationResult(context.env.DB, {
      attemptId: run.attemptId,
      userId: run.userId,
      modelName: evaluation.modelName,
      rubricVersion: evaluation.output.rubric_version,
      outputJson: JSON.stringify(evaluation.output)
    });
  } catch (error) {
    logRun(run, "save_error", { elapsedMs: elapsedMs(), error: errorText(error) });
    await markRunFailed(context, run);
    return;
  }
  if (!saved.saved) {
    logRun(run, saved.attemptExists ? "superseded" : "attempt_gone", { elapsedMs: elapsedMs() });
    return;
  }
  logRun(run, "completed", {
    elapsedMs: elapsedMs(),
    // `evaluateEslReadingAttempt` substitutes a heuristic result when the model call fails, so a
    // completed run is not necessarily a model result. Counted separately for that reason.
    usedFallback: evaluation.modelName === FALLBACK_MODEL_NAME
  });

  // Side effects of the stored result. Only the run that stored it reaches here, so they happen
  // once per attempt; each fails on its own and none can turn the saved evaluation into a failure.
  const practiceSeconds = run.durationMs ? Math.round(run.durationMs / 1000) : 0;
  await afterSave(run, "practice_counters", () =>
    incrementEslLearnerProfileCounters(context.env.DB, { userId: run.userId, practiceSeconds })
  );
  // Empirical difficulty for the material layer. Normalized to 0..1 so reading and
  // dictation scores are comparable; a no-op for user-created passages.
  await afterSave(run, "passage_stat", () =>
    recordPassageAttemptStat(context.env.DB, {
      passageId: run.passage.id,
      mode: "reading",
      accuracy: Math.min(1, Math.max(0, evaluation.output.scores.overall / 100))
    })
  );
  // Learner model: attribute the evaluation's highlights to the tag vocabulary. Marked
  // source='llm' and down-weighted in aggregation (design §5.2). User passages carry no
  // tags, so this is empty for them and writes nothing.
  await afterSave(run, "tag_observations", async () => {
    const passageTags = await getPassageTags(context.env.DB, run.passage.id);
    const tallies = attributeReadingErrors(passageTags, evaluation.output.highlights ?? []);
    if (tallies.size > 0) {
      await insertLearnerTagObservations(context.env.DB, {
        userId: run.userId,
        mode: "reading",
        passageId: run.passage.id,
        attemptId: run.attemptId,
        source: "llm",
        tallies: [...tallies].map(([tag, tally]) => ({
          tag,
          exposure: tally.exposure,
          hits: tally.hits
        }))
      });
    }
    await scheduleLearnerModelRecompute(context, run.userId);
  });
};

const scheduleReadingAttemptEvaluation = async (
  context: AppLoadContext,
  run: EvaluationRun,
  options: { preferBackground?: boolean } = {}
) => {
  const evaluationTask = runReadingAttemptEvaluation(context, run);
  if (options.preferBackground !== false && context.ctx?.waitUntil) {
    context.ctx.waitUntil(evaluationTask);
  } else {
    await evaluationTask;
  }
};

export const createAndScheduleEslReadingAttempt = async (
  context: AppLoadContext,
  input: {
    userId: string;
    passage: Passage;
    submission: ParsedEslAttemptSubmission;
  }
): Promise<{ attemptId: string }> => {
  const attemptId = crypto.randomUUID();
  // The first run is claimed by the insert itself, so the submit and a retry can never both own it.
  const runId = crypto.randomUUID();
  const r2Key = buildAttemptR2Key(input.userId, attemptId, input.submission.audioFormat);
  let supportsAsyncEvaluationStatus = true;
  const canRunInBackground = Boolean(context.ctx?.waitUntil);

  try {
    await context.env.R2.put(r2Key, input.submission.audioBuffer, {
      httpMetadata: {
        contentType: input.submission.audioMimeType,
        contentDisposition: `inline; filename="reading-${attemptId}.${input.submission.audioFormat}"`
      }
    });

    ({ supportsAsyncEvaluationStatus } = await createEslReadingAttempt(context.env.DB, {
      id: attemptId,
      passageId: input.passage.id,
      userId: input.userId,
      mode: input.submission.mode,
      audioFormat: input.submission.audioFormat,
      audioMimeType: input.submission.audioMimeType,
      r2Key,
      audioBytes: input.submission.audioBuffer.byteLength,
      durationMs: input.submission.durationMs,
      evaluationStatus: "pending",
      evaluationRunId: runId
    }));
  } catch {
    await context.env.R2.delete(r2Key).catch(() => undefined);
    throw new EslAttemptSubmissionError("Failed to submit. Please retry.", 500);
  }

  if (!supportsAsyncEvaluationStatus) {
    console.warn(
      canRunInBackground
        ? "esl_reading_attempts is missing evaluation_status or duration_ms; running evaluation in background without persisted pending status. Apply newer D1 migrations."
        : "esl_reading_attempts is missing evaluation_status or duration_ms; running evaluation inline. Apply newer D1 migrations."
    );
  }

  await scheduleReadingAttemptEvaluation(
    context,
    {
      userId: input.userId,
      attemptId,
      runId,
      trigger: "submit",
      passage: input.passage,
      mode: input.submission.mode,
      outputLanguage: input.submission.outputLanguage,
      durationMs: input.submission.durationMs,
      audioBytes: new Uint8Array(input.submission.audioBuffer),
      audioMimeType: input.submission.audioMimeType
    },
    { preferBackground: canRunInBackground }
  );

  return { attemptId };
};

/**
 * Retry an attempt's evaluation. The claim is one conditional UPDATE, so of two concurrent retries
 * only one starts a model call. Outcomes:
 * - `started`: this request owns a new run;
 * - `running`: a run started inside the stale window — keep waiting, start nothing;
 * - `completed`: a result is already stored — start nothing.
 * An explicitly failed run is claimable at once.
 */
export const retryEslReadingAttemptEvaluation = async (
  context: AppLoadContext,
  input: {
    userId: string;
    attemptId: string;
    passage: Passage;
    outputLanguage: ReadingOutputLanguage;
  }
): Promise<{ outcome: "started" | "running" | "completed" }> => {
  const attempt = await getEslReadingAttemptById(context.env.DB, input.attemptId, {
    includeDeleted: true
  });
  if (!attempt || attempt.user_id !== input.userId || attempt.passage_id !== input.passage.id || attempt.deleted_at) {
    throw new EslAttemptSubmissionError("Attempt not found.", 404);
  }
  if (!isSupportedReadingMode(attempt.mode)) {
    throw new EslAttemptSubmissionError("Invalid attempt mode.", 400);
  }

  const runId = crypto.randomUUID();
  const claim = await claimEslReadingEvaluationRun(context.env.DB, {
    attemptId: attempt.id,
    userId: input.userId,
    runId,
    staleSeconds: ESL_PENDING_EVAL_STALE_MS / 1000
  });
  if (claim.outcome === "missing") throw new EslAttemptSubmissionError("Attempt not found.", 404);
  if (claim.outcome !== "claimed") return { outcome: claim.outcome };

  const run: EvaluationRun = {
    userId: input.userId,
    attemptId: attempt.id,
    runId,
    trigger: "retry",
    passage: input.passage,
    mode: attempt.mode,
    outputLanguage: input.outputLanguage,
    durationMs: attempt.duration_ms,
    audioBytes: new Uint8Array(0),
    audioMimeType: attempt.audio_mime_type
  };

  // Only the claiming request reads the recording.
  const audioObject = await context.env.R2.get(attempt.r2_key).catch(() => null);
  if (!audioObject) {
    logRun(run, "audio_missing_error");
    await markRunFailed(context, run);
    throw new EslAttemptSubmissionError("Recording file is unavailable.", 500);
  }
  run.audioBytes = new Uint8Array(await audioObject.arrayBuffer());

  await scheduleReadingAttemptEvaluation(context, run);
  return { outcome: "started" };
};
