import type { AppLoadContext } from "@remix-run/cloudflare";
import {
  createEslReadingAttempt,
  createEslReadingEvaluation,
  getEslLearnerProfile,
  getEslReadingAttemptById,
  getLatestEslReadingEvaluationByAttemptId,
  incrementEslLearnerProfileCounters,
  listEslReadingAttemptsByPassage,
  updateEslReadingAttemptEvaluationStatus,
  type EslPassage
} from "@bcailab/db";
import { evaluateEslReadingAttempt } from "~/utils/esl-reading-eval.server";
import {
  isSupportedEslAudioMime,
  isSupportedReadingMode,
  MAX_ESL_READING_AUDIO_BYTES,
  parseEslReadingEvaluationOutput,
  type EslLearnerProfileData,
  type EslReadingMode
} from "~/utils/esl-reading";

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
    durationMs: durationMs && Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs) : null,
    audioBuffer: await file.arrayBuffer(),
    audioFormat,
    audioMimeType: mimeType.split(";")[0].trim().toLowerCase()
  };
};

const runReadingAttemptEvaluation = async (
  context: AppLoadContext,
  input: {
    userId: string;
    attemptId: string;
    passage: EslPassage;
    mode: EslReadingMode;
    durationMs: number | null;
    audioBytes: Uint8Array;
    audioMimeType: string;
  }
) => {
  const currentAttempt = await getEslReadingAttemptById(context.env.DB, input.attemptId, {
    includeDeleted: true
  });
  if (!currentAttempt || currentAttempt.user_id !== input.userId || currentAttempt.deleted_at) {
    return;
  }

  const allAttempts = await listEslReadingAttemptsByPassage(context.env.DB, {
    userId: input.userId,
    passageId: input.passage.id
  });
  const pastAttempts = allAttempts.filter((attempt) => attempt.id !== input.attemptId);
  const historyEntries = await Promise.all(
    pastAttempts.map(async (attempt) => {
      const evaluation = await getLatestEslReadingEvaluationByAttemptId(context.env.DB, attempt.id);
      const parsed = evaluation ? parseEslReadingEvaluationOutput(evaluation.output_json) : null;
      return {
        date: attempt.created_at,
        mode: attempt.mode,
        overallScore: parsed?.scores.overall ?? 0,
        durationSeconds: attempt.duration_ms != null ? attempt.duration_ms / 1000 : null,
        fullEvaluation: parsed ?? undefined
      };
    })
  );

  const profile = await getEslLearnerProfile(context.env.DB, input.userId);
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

  try {
    const evaluation = await evaluateEslReadingAttempt({
      env: context.env,
      passageText: input.passage.content_text,
      mode: input.mode,
      audioBytes: input.audioBytes,
      audioMimeType: input.audioMimeType,
      durationMs: input.durationMs,
      history: historyEntries,
      learnerProfile
    });

    const activeAttempt = await getEslReadingAttemptById(context.env.DB, input.attemptId, {
      includeDeleted: true
    });
    if (!activeAttempt || activeAttempt.user_id !== input.userId || activeAttempt.deleted_at) {
      return;
    }

    await createEslReadingEvaluation(context.env.DB, {
      attemptId: input.attemptId,
      userId: input.userId,
      modelName: evaluation.modelName,
      rubricVersion: evaluation.output.rubric_version,
      outputJson: JSON.stringify(evaluation.output)
    });
    await updateEslReadingAttemptEvaluationStatus(context.env.DB, {
      id: input.attemptId,
      userId: input.userId,
      status: "completed"
    });

    const practiceSeconds = input.durationMs ? Math.round(input.durationMs / 1000) : 0;
    await incrementEslLearnerProfileCounters(context.env.DB, {
      userId: input.userId,
      practiceSeconds
    });
  } catch {
    const activeAttempt = await getEslReadingAttemptById(context.env.DB, input.attemptId, {
      includeDeleted: true
    });
    if (!activeAttempt || activeAttempt.user_id !== input.userId || activeAttempt.deleted_at) {
      return;
    }
    await updateEslReadingAttemptEvaluationStatus(context.env.DB, {
      id: input.attemptId,
      userId: input.userId,
      status: "failed"
    });
  }
};

const scheduleReadingAttemptEvaluation = async (
  context: AppLoadContext,
  input: {
    userId: string;
    attemptId: string;
    passage: EslPassage;
    mode: EslReadingMode;
    durationMs: number | null;
    audioBytes: Uint8Array;
    audioMimeType: string;
  },
  options: { preferBackground?: boolean } = {}
) => {
  const evaluationTask = runReadingAttemptEvaluation(context, input);
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
    passage: EslPassage;
    submission: ParsedEslAttemptSubmission;
  }
): Promise<{ attemptId: string }> => {
  const attemptId = crypto.randomUUID();
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
      evaluationStatus: "pending"
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
      passage: input.passage,
      mode: input.submission.mode,
      durationMs: input.submission.durationMs,
      audioBytes: new Uint8Array(input.submission.audioBuffer),
      audioMimeType: input.submission.audioMimeType
    },
    { preferBackground: canRunInBackground }
  );

  return { attemptId };
};

export const retryEslReadingAttemptEvaluation = async (
  context: AppLoadContext,
  input: {
    userId: string;
    attemptId: string;
    passage: EslPassage;
  }
) => {
  const attempt = await getEslReadingAttemptById(context.env.DB, input.attemptId, {
    includeDeleted: true
  });
  if (!attempt || attempt.user_id !== input.userId || attempt.passage_id !== input.passage.id || attempt.deleted_at) {
    throw new EslAttemptSubmissionError("Attempt not found.", 404);
  }
  if (!isSupportedReadingMode(attempt.mode)) {
    throw new EslAttemptSubmissionError("Invalid attempt mode.", 400);
  }

  const audioObject = await context.env.R2.get(attempt.r2_key);
  if (!audioObject) {
    await updateEslReadingAttemptEvaluationStatus(context.env.DB, {
      id: attempt.id,
      userId: input.userId,
      status: "failed"
    });
    throw new EslAttemptSubmissionError("Recording file is unavailable.", 500);
  }

  await updateEslReadingAttemptEvaluationStatus(context.env.DB, {
    id: attempt.id,
    userId: input.userId,
    status: "pending"
  });

  const audioBuffer = await audioObject.arrayBuffer();
  await scheduleReadingAttemptEvaluation(context, {
    userId: input.userId,
    attemptId: attempt.id,
    passage: input.passage,
    mode: attempt.mode,
    durationMs: attempt.duration_ms,
    audioBytes: new Uint8Array(audioBuffer),
    audioMimeType: attempt.audio_mime_type
  });
};
