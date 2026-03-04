import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useActionData, useLoaderData } from "@remix-run/react";
import { Button, Card } from "@bcailab/ui";
import {
  createEslReadingAttempt,
  createEslReadingEvaluation,
  getEslPassageById,
  getEslReadingAttemptById,
  getLatestEslReadingEvaluationByAttemptId,
  listEslReadingAttemptsByPassage,
  softDeleteEslReadingAttempt
} from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { evaluateEslReadingAttempt } from "~/utils/esl-reading-eval.server";
import {
  clipText,
  isSupportedEslAudioMime,
  isSupportedReadingMode,
  MAX_ESL_READING_AUDIO_BYTES,
  parseEslReadingEvaluationOutput,
  type EslReadingMode
} from "~/utils/esl-reading";
import * as React from "react";

type ActionData = { error?: string };

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

const buildAttemptR2Key = (userId: string, attemptId: string, extension: string): string => {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `esl/reading/${userId}/${year}/${month}/${attemptId}.${extension}`;
};

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

const inferAudioFormat = (mimeType: string, fileName: string): string | null => {
  const normalizedMimeType = mimeType.split(";")[0].trim().toLowerCase();
  if (audioFormatByMime[normalizedMimeType]) return audioFormatByMime[normalizedMimeType];
  const ext = fileName.trim().toLowerCase().split(".").pop();
  if (!ext) return null;
  if (["webm", "mp4", "mp3", "wav", "ogg", "aac", "flac", "m4a"].includes(ext)) {
    return ext === "m4a" ? "mp4" : ext;
  }
  return null;
};

const recorderMimeCandidates = [
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg"
];

const pickRecorderMimeType = (): string | null => {
  if (typeof MediaRecorder === "undefined") return null;
  for (const candidate of recorderMimeCandidates) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return null;
};

const extensionFromMimeType = (mimeType: string): string => {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("mp4")) return "mp4";
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("aac")) return "aac";
  if (normalized.includes("flac")) return "flac";
  return "webm";
};

export const loader = async ({ request, context, params }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const passageId = params.id;
  if (!passageId) {
    throw new Response("Not found", { status: 404 });
  }

  const passage = await getEslPassageById(context.env.DB, passageId, { includeDeleted: true });
  if (!passage || passage.user_id !== user.id || passage.deleted_at) {
    throw new Response("Not found", { status: 404 });
  }

  const attempts = await listEslReadingAttemptsByPassage(context.env.DB, {
    userId: user.id,
    passageId
  });
  const evaluations = await Promise.all(
    attempts.map((attempt) => getLatestEslReadingEvaluationByAttemptId(context.env.DB, attempt.id))
  );

  const attemptsWithEval = attempts.map((attempt, index) => {
    const evaluation = evaluations[index];
    const parsed = evaluation ? parseEslReadingEvaluationOutput(evaluation.output_json) : null;
    return {
      id: attempt.id,
      mode: attempt.mode,
      createdAt: attempt.created_at,
      score: parsed?.scores.overall ?? null,
      modelName: evaluation?.model_name ?? null
    };
  });

  const url = new URL(request.url);
  const selectedAttemptId = url.searchParams.get("attempt") || attemptsWithEval[0]?.id || null;
  const selectedAttempt = selectedAttemptId
    ? attempts.find((attempt) => attempt.id === selectedAttemptId) ?? null
    : null;
  const selectedEvaluation = selectedAttempt
    ? await getLatestEslReadingEvaluationByAttemptId(context.env.DB, selectedAttempt.id)
    : null;
  const selectedOutput = selectedEvaluation
    ? parseEslReadingEvaluationOutput(selectedEvaluation.output_json)
    : null;

  return json({
    passage,
    attempts: attemptsWithEval,
    selected: selectedAttempt
      ? {
          id: selectedAttempt.id,
          mode: selectedAttempt.mode,
          createdAt: selectedAttempt.created_at,
          audioUrl: `/esl/audio/${selectedAttempt.id}`,
          evaluation: selectedOutput,
          modelName: selectedEvaluation?.model_name ?? null
        }
      : null
  });
};

export const action = async ({ request, context, params }: ActionFunctionArgs) => {
  const user = await requireUser(request, context);
  const passageId = params.id;
  if (!passageId) {
    throw new Response("Not found", { status: 404 });
  }

  const passage = await getEslPassageById(context.env.DB, passageId, { includeDeleted: true });
  if (!passage || passage.user_id !== user.id || passage.deleted_at) {
    throw new Response("Not found", { status: 404 });
  }

  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "submitAttempt");

  if (intent === "deleteAttempt") {
    const attemptId = String(formData.get("attemptId") ?? "");
    if (!attemptId) {
      return json<ActionData>({ error: "Missing attempt id." }, { status: 400 });
    }
    const attempt = await getEslReadingAttemptById(context.env.DB, attemptId, { includeDeleted: true });
    if (!attempt || attempt.user_id !== user.id || attempt.passage_id !== passage.id || attempt.deleted_at) {
      return json<ActionData>({ error: "Attempt not found." }, { status: 404 });
    }
    try {
      await context.env.R2.delete(attempt.r2_key);
      await softDeleteEslReadingAttempt(context.env.DB, { id: attempt.id, userId: user.id });
      return redirect(`/esl/reading/${passage.id}`);
    } catch {
      return json<ActionData>(
        { error: "Failed to delete this attempt. Please try again." },
        { status: 500 }
      );
    }
  }

  if (intent !== "submitAttempt") {
    return json<ActionData>({ error: "Unsupported action." }, { status: 400 });
  }

  const modeRaw = String(formData.get("mode") ?? "reading");
  if (!isSupportedReadingMode(modeRaw)) {
    return json<ActionData>({ error: "Invalid mode." }, { status: 400 });
  }
  const mode: EslReadingMode = modeRaw;

  const file = formData.get("audioFile");
  if (!(file instanceof File) || file.size <= 0) {
    return json<ActionData>({ error: "Please upload an audio file first." }, { status: 400 });
  }
  if (file.size > MAX_ESL_READING_AUDIO_BYTES) {
    return json<ActionData>(
      { error: `Audio exceeds ${(MAX_ESL_READING_AUDIO_BYTES / (1024 * 1024)).toFixed(0)}MB.` },
      { status: 400 }
    );
  }

  const providedMimeType = file.type || "application/octet-stream";
  if (file.type && !isSupportedEslAudioMime(file.type)) {
    return json<ActionData>(
      { error: "Unsupported audio format. Use webm/mp4/mp3/wav/ogg/aac/flac." },
      { status: 400 }
    );
  }

  const audioFormat = inferAudioFormat(providedMimeType, file.name);
  if (!audioFormat) {
    return json<ActionData>({ error: "Could not determine audio format." }, { status: 400 });
  }
  const mimeType = providedMimeType === "application/octet-stream"
    ? audioMimeByFormat[audioFormat] ?? "application/octet-stream"
    : providedMimeType;
  const canonicalMimeType = mimeType.split(";")[0].trim().toLowerCase();

  const attemptId = crypto.randomUUID();
  const r2Key = buildAttemptR2Key(user.id, attemptId, audioFormat);
  const audioBuffer = await file.arrayBuffer();

  try {
    await context.env.R2.put(r2Key, audioBuffer, {
      httpMetadata: {
        contentType: mimeType,
        contentDisposition: `inline; filename="reading-${attemptId}.${audioFormat}"`
      }
    });

    await createEslReadingAttempt(context.env.DB, {
      id: attemptId,
      passageId: passage.id,
      userId: user.id,
      mode,
      audioFormat,
      audioMimeType: canonicalMimeType,
      r2Key,
      audioBytes: audioBuffer.byteLength
    });
  } catch {
    return json<ActionData>(
      { error: "Failed to submit this attempt. Please retry." },
      { status: 500 }
    );
  }

  try {
    const evaluation = await evaluateEslReadingAttempt({
      env: context.env,
      passageText: passage.content_text,
      mode,
      audioBytes: new Uint8Array(audioBuffer),
      audioMimeType: canonicalMimeType
    });
    await createEslReadingEvaluation(context.env.DB, {
      attemptId,
      userId: user.id,
      modelName: evaluation.modelName,
      rubricVersion: evaluation.output.rubric_version,
      outputJson: JSON.stringify(evaluation.output)
    });
  } catch {
    // Keep the attempt even if evaluation fails; user can still review and replay the upload.
  }

  return redirect(`/esl/reading/${passage.id}?attempt=${attemptId}`);
};

export default function EslReadingPassagePage() {
  const { passage, attempts, selected } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [hidePassage, setHidePassage] = React.useState(false);
  const [recordingState, setRecordingState] = React.useState<"idle" | "recording" | "stopping">(
    "idle"
  );
  const [recorderStatus, setRecorderStatus] = React.useState(
    "You can upload an existing audio file or record in browser."
  );
  const [recordedAudioUrl, setRecordedAudioUrl] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const mediaStreamRef = React.useRef<MediaStream | null>(null);
  const recordedChunksRef = React.useRef<BlobPart[]>([]);

  const clearAudioPreview = React.useCallback(() => {
    setRecordedAudioUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
  }, []);

  const stopMediaStream = React.useCallback(() => {
    const stream = mediaStreamRef.current;
    if (!stream) return;
    for (const track of stream.getTracks()) {
      track.stop();
    }
    mediaStreamRef.current = null;
  }, []);

  React.useEffect(() => {
    return () => {
      clearAudioPreview();
      stopMediaStream();
    };
  }, [clearAudioPreview, stopMediaStream]);

  const startRecording = React.useCallback(async () => {
    if (recordingState !== "idle") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setRecorderStatus("This browser does not support microphone recording.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      recordedChunksRef.current = [];

      const mimeType = pickRecorderMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blobType =
          recordedChunksRef.current[0] instanceof Blob && recordedChunksRef.current[0].type
            ? recordedChunksRef.current[0].type
            : recorder.mimeType || mimeType || "audio/webm";
        const extension = extensionFromMimeType(blobType);
        const blob = new Blob(recordedChunksRef.current, { type: blobType });
        const file = new File([blob], `reading-attempt-${Date.now()}.${extension}`, {
          type: blobType
        });

        if (fileInputRef.current) {
          const transfer = new DataTransfer();
          transfer.items.add(file);
          fileInputRef.current.files = transfer.files;
        }

        clearAudioPreview();
        setRecordedAudioUrl(URL.createObjectURL(file));
        setRecorderStatus(`Recorded ${Math.max(1, Math.round(file.size / 1024))} KB and attached.`);
        setRecordingState("idle");
        mediaRecorderRef.current = null;
        stopMediaStream();
      };

      recorder.onerror = () => {
        setRecorderStatus("Recording failed. Please retry or upload an audio file.");
        setRecordingState("idle");
        mediaRecorderRef.current = null;
        stopMediaStream();
      };

      recorder.start(200);
      setRecordingState("recording");
      setRecorderStatus("Recording... click Stop when finished.");
    } catch {
      setRecorderStatus("Microphone permission denied or unavailable.");
      setRecordingState("idle");
      stopMediaStream();
    }
  }, [clearAudioPreview, recordingState, stopMediaStream]);

  const stopRecording = React.useCallback(() => {
    if (recordingState !== "recording") return;
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setRecordingState("idle");
      return;
    }
    setRecordingState("stopping");
    setRecorderStatus("Processing recording...");
    recorder.stop();
  }, [recordingState]);

  const clearAttachedAudio = React.useCallback(() => {
    if (recordingState === "recording") return;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    clearAudioPreview();
    setRecorderStatus("Audio selection cleared.");
  }, [clearAudioPreview, recordingState]);

  const handleFileChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      clearAudioPreview();
      if (!file) {
        setRecorderStatus("No audio file selected.");
        return;
      }
      setRecordedAudioUrl(URL.createObjectURL(file));
      setRecorderStatus(`Selected: ${file.name}`);
    },
    [clearAudioPreview]
  );

  return (
    <div className="tool-page">
      <div className="esl-reading-header">
        <Link to="/esl/reading" className="posts-link">← Back to passages</Link>
        <h1>{passage.title || "Untitled passage"}</h1>
      </div>

      <Card className="tool-card-stack">
        <div className="esl-passage-panel-head">
          <span className="post-meta">Passage</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setHidePassage((value) => !value)}
          >
            {hidePassage ? "Show text" : "Hide text (recitation)"}
          </button>
        </div>
        {hidePassage ? (
          <div className="esl-passage-hidden">Text hidden. Try reciting from memory.</div>
        ) : (
          <div className="esl-passage-body">{passage.content_text}</div>
        )}
      </Card>

      <Card className="tool-card-stack">
        <form method="post" encType="multipart/form-data" className="esl-attempt-form">
          <input type="hidden" name="_intent" value="submitAttempt" />
          <label className="post-meta" htmlFor="mode-select">
            Submission mode
          </label>
          <select id="mode-select" name="mode" className="input">
            <option value="reading">Reading (text visible)</option>
            <option value="recitation">Recitation (memorization)</option>
          </select>
          <label className="post-meta" htmlFor="audio-file">
            Audio file
          </label>
          <input
            ref={fileInputRef}
            id="audio-file"
            name="audioFile"
            type="file"
            accept="audio/*"
            className="input"
            onChange={handleFileChange}
          />
          <div className="esl-recorder-controls">
            <Button
              type="button"
              size="sm"
              onClick={() => void startRecording()}
              disabled={recordingState !== "idle"}
            >
              {recordingState === "recording" ? "Recording..." : "Start recording"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={stopRecording}
              disabled={recordingState !== "recording"}
            >
              Stop
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={clearAttachedAudio}
              disabled={recordingState !== "idle"}
            >
              Clear
            </Button>
          </div>
          <p className="esl-recorder-status">{recorderStatus}</p>
          {recordedAudioUrl ? <audio controls src={recordedAudioUrl} className="esl-audio-player" /> : null}
          <div className="textarea-meta">
            <span>Upload recording and submit</span>
            <span>{(MAX_ESL_READING_AUDIO_BYTES / (1024 * 1024)).toFixed(0)}MB max</span>
          </div>
          {actionData?.error ? <div className="form-error">{actionData.error}</div> : null}
          <div className="form-actions form-actions-inline">
            <Button type="submit">Submit attempt</Button>
          </div>
        </form>
      </Card>

      <div className="esl-attempt-section">
        <div className="esl-passage-list-head">
          <h2>Attempts</h2>
          <span>{attempts.length}</span>
        </div>
        {attempts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">No attempts yet</div>
            <p className="empty-state-desc">Upload your first recording to start tracking progress.</p>
          </div>
        ) : (
          <div className="esl-attempt-list">
            {attempts.map((attempt) => (
              <Card
                key={attempt.id}
                className={`esl-attempt-row ${selected?.id === attempt.id ? "is-active" : ""}`}
              >
                <div className="esl-attempt-row-main">
                  <div className="esl-attempt-row-head">
                    <span className="post-meta">{formatDateTime(attempt.createdAt)}</span>
                    <span className="badge">{attempt.mode === "recitation" ? "Recitation" : "Reading"}</span>
                  </div>
                  <div className="esl-attempt-row-score">
                    {attempt.score !== null ? `Overall ${attempt.score}` : "No score"}
                    {attempt.modelName ? ` · ${clipText(attempt.modelName, 24)}` : ""}
                  </div>
                </div>
                <Link to={`/esl/reading/${passage.id}?attempt=${attempt.id}`} className="btn btn-ghost btn-sm">
                  View
                </Link>
              </Card>
            ))}
          </div>
        )}
      </div>

      {selected ? (
        <Card className="tool-card-stack">
          <div className="esl-selected-head">
            <h3>Selected attempt</h3>
            <form
              method="post"
              onSubmit={(event) => {
                if (!confirm("Delete this attempt? This cannot be undone.")) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="_intent" value="deleteAttempt" />
              <input type="hidden" name="attemptId" value={selected.id} />
              <Button type="submit" variant="danger" size="sm">
                Delete
              </Button>
            </form>
          </div>
          <audio controls src={selected.audioUrl} className="esl-audio-player" />
          <p className="post-meta">Submitted {formatDateTime(selected.createdAt)}</p>
          {selected.evaluation ? (
            <div className="esl-eval-panel">
              <div className="esl-eval-score">
                Overall score: <strong>{selected.evaluation.scores.overall}</strong>
                {selected.modelName ? ` (${selected.modelName})` : ""}
              </div>
              <div className="esl-eval-grid">
                <span>Pronunciation: {selected.evaluation.scores.pronunciation}</span>
                <span>Stress/Rhythm: {selected.evaluation.scores.stress_rhythm}</span>
                <span>Fluency: {selected.evaluation.scores.fluency}</span>
                <span>Clarity: {selected.evaluation.scores.clarity}</span>
              </div>
              <div className="esl-eval-subtitle">Top actions (ZH)</div>
              <ul className="esl-eval-list">
                {selected.evaluation.top_actions_zh.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="form-error">Evaluation not available for this attempt.</div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
