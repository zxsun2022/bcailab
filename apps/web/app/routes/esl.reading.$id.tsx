import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { Button, Card } from "@bcailab/ui";
import {
  createEslReadingAttempt,
  createEslReadingEvaluation,
  getEslLearnerProfile,
  getEslPassageById,
  getEslReadingAttemptById,
  getLatestEslReadingEvaluationByAttemptId,
  incrementEslLearnerProfileCounters,
  listEslReadingAttemptsByPassage,
  softDeleteEslReadingAttempt
} from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { evaluateEslReadingAttempt } from "~/utils/esl-reading-eval.server";
import {
  formatDuration,
  isSupportedEslAudioMime,
  isSupportedReadingMode,
  MAX_ESL_READING_AUDIO_BYTES,
  parseEslReadingEvaluationOutput,
  type EslLearnerProfileData,
  type EslReadingEvaluationOutput,
  type EslReadingMode
} from "~/utils/esl-reading";
import * as React from "react";

type ActionData = { error?: string };

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString(undefined, {
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
  "audio/webm": "webm", "audio/mp4": "mp4", "audio/mpeg": "mp3", "audio/mp3": "mp3",
  "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg", "audio/aac": "aac", "audio/flac": "flac"
};

const audioMimeByFormat: Record<string, string> = {
  webm: "audio/webm", mp4: "audio/mp4", mp3: "audio/mpeg", wav: "audio/wav",
  ogg: "audio/ogg", aac: "audio/aac", flac: "audio/flac"
};

const inferAudioFormat = (mimeType: string, fileName: string): string | null => {
  const normalized = mimeType.split(";")[0].trim().toLowerCase();
  if (audioFormatByMime[normalized]) return audioFormatByMime[normalized];
  const ext = fileName.trim().toLowerCase().split(".").pop();
  if (!ext) return null;
  if (["webm", "mp4", "mp3", "wav", "ogg", "aac", "flac", "m4a"].includes(ext)) return ext === "m4a" ? "mp4" : ext;
  return null;
};

const recorderMimeCandidates = [
  "audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"
];

const pickRecorderMimeType = (): string | null => {
  if (typeof MediaRecorder === "undefined") return null;
  for (const c of recorderMimeCandidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return null;
};

const extensionFromMimeType = (mimeType: string): string => {
  const n = mimeType.toLowerCase();
  if (n.includes("webm")) return "webm";
  if (n.includes("mp4")) return "mp4";
  if (n.includes("mpeg") || n.includes("mp3")) return "mp3";
  if (n.includes("wav")) return "wav";
  if (n.includes("ogg")) return "ogg";
  if (n.includes("aac")) return "aac";
  if (n.includes("flac")) return "flac";
  return "webm";
};

// ---------- Loader ----------

export const loader = async ({ request, context, params }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const passageId = params.id;
  if (!passageId) throw new Response("Not found", { status: 404 });

  const passage = await getEslPassageById(context.env.DB, passageId, { includeDeleted: true });
  if (!passage || passage.user_id !== user.id || passage.deleted_at) {
    throw new Response("Not found", { status: 404 });
  }

  const attempts = await listEslReadingAttemptsByPassage(context.env.DB, { userId: user.id, passageId });
  const evaluations = await Promise.all(
    attempts.map((a) => getLatestEslReadingEvaluationByAttemptId(context.env.DB, a.id))
  );

  const attemptsWithEval = attempts.map((attempt, i) => {
    const evaluation = evaluations[i];
    const parsed = evaluation ? parseEslReadingEvaluationOutput(evaluation.output_json) : null;
    return {
      id: attempt.id,
      mode: attempt.mode,
      createdAt: attempt.created_at,
      durationMs: attempt.duration_ms,
      score: parsed?.scores.overall ?? null,
      modelName: evaluation?.model_name ?? null
    };
  });

  // Selected attempt (default: latest)
  const url = new URL(request.url);
  const selectedAttemptId = url.searchParams.get("attempt") || attemptsWithEval[0]?.id || null;
  const selectedAttempt = selectedAttemptId
    ? attempts.find((a) => a.id === selectedAttemptId) ?? null
    : null;
  const selectedEvaluation = selectedAttempt
    ? await getLatestEslReadingEvaluationByAttemptId(context.env.DB, selectedAttempt.id)
    : null;
  const selectedOutput = selectedEvaluation
    ? parseEslReadingEvaluationOutput(selectedEvaluation.output_json)
    : null;

  // Score trend for sparkline
  const scoreTrend = [...attemptsWithEval]
    .reverse()
    .map((a) => ({ score: a.score, mode: a.mode }));

  return json({
    passage,
    attempts: attemptsWithEval,
    scoreTrend,
    selected: selectedAttempt
      ? {
          id: selectedAttempt.id,
          mode: selectedAttempt.mode,
          createdAt: selectedAttempt.created_at,
          durationMs: selectedAttempt.duration_ms,
          audioUrl: `/esl/audio/${selectedAttempt.id}`,
          evaluation: selectedOutput,
          modelName: selectedEvaluation?.model_name ?? null
        }
      : null
  });
};

// ---------- Action ----------

export const action = async ({ request, context, params }: ActionFunctionArgs) => {
  const user = await requireUser(request, context);
  const passageId = params.id;
  if (!passageId) throw new Response("Not found", { status: 404 });

  const passage = await getEslPassageById(context.env.DB, passageId, { includeDeleted: true });
  if (!passage || passage.user_id !== user.id || passage.deleted_at) {
    throw new Response("Not found", { status: 404 });
  }

  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "submitAttempt");

  if (intent === "deleteAttempt") {
    const attemptId = String(formData.get("attemptId") ?? "");
    if (!attemptId) return json<ActionData>({ error: "Missing attempt id." }, { status: 400 });
    const attempt = await getEslReadingAttemptById(context.env.DB, attemptId, { includeDeleted: true });
    if (!attempt || attempt.user_id !== user.id || attempt.passage_id !== passage.id || attempt.deleted_at) {
      return json<ActionData>({ error: "Attempt not found." }, { status: 404 });
    }
    try {
      await context.env.R2.delete(attempt.r2_key);
      await softDeleteEslReadingAttempt(context.env.DB, { id: attempt.id, userId: user.id });
      return redirect(`/esl/reading/${passage.id}`);
    } catch {
      return json<ActionData>({ error: "Failed to delete. Please try again." }, { status: 500 });
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

  const durationMsRaw = formData.get("durationMs");
  const durationMs = durationMsRaw ? Number(durationMsRaw) : null;

  const file = formData.get("audioFile");
  if (!(file instanceof File) || file.size <= 0) {
    return json<ActionData>({ error: "Please record audio first." }, { status: 400 });
  }
  if (file.size > MAX_ESL_READING_AUDIO_BYTES) {
    return json<ActionData>(
      { error: `Audio exceeds ${(MAX_ESL_READING_AUDIO_BYTES / (1024 * 1024)).toFixed(0)}MB.` },
      { status: 400 }
    );
  }

  const providedMimeType = file.type || "application/octet-stream";
  if (file.type && !isSupportedEslAudioMime(file.type)) {
    return json<ActionData>({ error: "Unsupported audio format." }, { status: 400 });
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
      audioBytes: audioBuffer.byteLength,
      durationMs: durationMs && Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs) : null
    });
  } catch {
    return json<ActionData>({ error: "Failed to submit. Please retry." }, { status: 500 });
  }

  // Build history context for evaluation
  const allAttempts = await listEslReadingAttemptsByPassage(context.env.DB, { userId: user.id, passageId });
  const pastAttempts = allAttempts.filter((a) => a.id !== attemptId);
  const historyEntries = await Promise.all(
    pastAttempts.map(async (a) => {
      const ev = await getLatestEslReadingEvaluationByAttemptId(context.env.DB, a.id);
      const parsed = ev ? parseEslReadingEvaluationOutput(ev.output_json) : null;
      return {
        date: a.created_at,
        mode: a.mode,
        overallScore: parsed?.scores.overall ?? 0,
        durationSeconds: a.duration_ms != null ? a.duration_ms / 1000 : null,
        fullEvaluation: parsed ?? undefined
      };
    })
  );

  // Learner profile
  const profile = await getEslLearnerProfile(context.env.DB, user.id);
  let learnerProfile: EslLearnerProfileData | null = null;
  if (profile) {
    try {
      learnerProfile = {
        persistent_issues: JSON.parse(profile.persistent_issues_json),
        strengths: JSON.parse(profile.strengths_json)
      };
    } catch { /* ignore */ }
  }

  try {
    const evaluation = await evaluateEslReadingAttempt({
      env: context.env,
      passageText: passage.content_text,
      mode,
      audioBytes: new Uint8Array(audioBuffer),
      audioMimeType: canonicalMimeType,
      durationMs: durationMs && Number.isFinite(durationMs) ? Math.round(durationMs) : null,
      history: historyEntries,
      learnerProfile
    });
    await createEslReadingEvaluation(context.env.DB, {
      attemptId,
      userId: user.id,
      modelName: evaluation.modelName,
      rubricVersion: evaluation.output.rubric_version,
      outputJson: JSON.stringify(evaluation.output)
    });

    // Increment learner profile counters
    const practiceSeconds = durationMs ? Math.round(durationMs / 1000) : 0;
    await incrementEslLearnerProfileCounters(context.env.DB, { userId: user.id, practiceSeconds });
  } catch {
    // Keep the attempt even if evaluation fails
  }

  return redirect(`/esl/reading/${passage.id}?attempt=${attemptId}`);
};

// ---------- Component ----------

type RecordingState = "idle" | "recording" | "preview" | "submitting";

export default function EslReadingPracticePage() {
  const { passage, attempts, scoreTrend, selected } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [mode, setMode] = React.useState<EslReadingMode>("reading");
  const [recordingState, setRecordingState] = React.useState<RecordingState>("idle");
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = React.useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const mediaStreamRef = React.useRef<MediaStream | null>(null);
  const recordedChunksRef = React.useRef<BlobPart[]>([]);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = React.useRef<number>(0);
  const durationMsRef = React.useRef<number>(0);

  const hideText = mode === "recitation";

  const cleanupAudio = React.useCallback(() => {
    if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
    setRecordedAudioUrl(null);
  }, [recordedAudioUrl]);

  const stopMediaStream = React.useCallback(() => {
    const stream = mediaStreamRef.current;
    if (!stream) return;
    for (const track of stream.getTracks()) track.stop();
    mediaStreamRef.current = null;
  }, []);

  const stopTimer = React.useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    return () => {
      if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
      stopMediaStream();
      stopTimer();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = React.useCallback(async () => {
    if (recordingState !== "idle") return;
    if (!navigator.mediaDevices?.getUserMedia) return;

    try {
      cleanupAudio();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      recordedChunksRef.current = [];

      const mimeType = pickRecorderMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        durationMsRef.current = Date.now() - startTimeRef.current;
        stopTimer();

        const blobType =
          recordedChunksRef.current[0] instanceof Blob && recordedChunksRef.current[0].type
            ? recordedChunksRef.current[0].type
            : recorder.mimeType || mimeType || "audio/webm";
        const ext = extensionFromMimeType(blobType);
        const blob = new Blob(recordedChunksRef.current, { type: blobType });
        const file = new File([blob], `reading-${Date.now()}.${ext}`, { type: blobType });

        if (fileInputRef.current) {
          const transfer = new DataTransfer();
          transfer.items.add(file);
          fileInputRef.current.files = transfer.files;
        }

        setRecordedAudioUrl(URL.createObjectURL(file));
        setRecordingState("preview");
        mediaRecorderRef.current = null;
        stopMediaStream();
      };

      recorder.onerror = () => {
        stopTimer();
        setRecordingState("idle");
        mediaRecorderRef.current = null;
        stopMediaStream();
      };

      startTimeRef.current = Date.now();
      setElapsedMs(0);
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current);
      }, 200);

      recorder.start(200);
      setRecordingState("recording");
    } catch {
      setRecordingState("idle");
      stopMediaStream();
    }
  }, [cleanupAudio, recordingState, stopMediaStream, stopTimer]);

  const stopRecording = React.useCallback(() => {
    if (recordingState !== "recording") return;
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setRecordingState("idle");
      return;
    }
    recorder.stop();
  }, [recordingState]);

  const discardRecording = React.useCallback(() => {
    cleanupAudio();
    if (fileInputRef.current) fileInputRef.current.value = "";
    durationMsRef.current = 0;
    setElapsedMs(0);
    setRecordingState("idle");
  }, [cleanupAudio]);

  const scoreBarWidth = (score: number) => `${Math.max(4, score)}%`;

  return (
    <div className="esl-practice-layout">
      {/* ===== CENTER: Passage + Recording ===== */}
      <div className="esl-center-panel">
        <div className="esl-passage-header">
          <Link to="/esl/reading" className="posts-link esl-mobile-back">
            &larr; Passages
          </Link>
          <h1>{passage.title || "Untitled passage"}</h1>
        </div>

        {/* Passage text */}
        <Card className="tool-card-stack esl-passage-card-main">
          {hideText ? (
            <div className="esl-passage-hidden">
              Text hidden for recitation mode. Try reciting from memory.
            </div>
          ) : (
            <div className="esl-passage-body">{passage.content_text}</div>
          )}
        </Card>

        {/* Mode toggle */}
        <div className="esl-mode-toggle">
          <button
            type="button"
            className={`esl-mode-btn ${mode === "reading" ? "is-active" : ""}`}
            onClick={() => setMode("reading")}
          >
            Reading
          </button>
          <button
            type="button"
            className={`esl-mode-btn ${mode === "recitation" ? "is-active" : ""}`}
            onClick={() => setMode("recitation")}
          >
            Recitation
          </button>
        </div>

        {/* Recording area */}
        <div className="esl-record-area">
          {recordingState === "idle" && (
            <button type="button" className="esl-record-btn" onClick={() => void startRecording()}>
              <span className="esl-record-btn-inner" />
            </button>
          )}

          {recordingState === "recording" && (
            <>
              <button type="button" className="esl-record-btn is-recording" onClick={stopRecording}>
                <span className="esl-record-btn-stop" />
              </button>
              <div className="esl-record-timer">{formatDuration(elapsedMs)}</div>
            </>
          )}

          {recordingState === "preview" && recordedAudioUrl && (
            <div className="esl-preview-area">
              <audio controls src={recordedAudioUrl} className="esl-audio-player" />
              <div className="esl-preview-meta">
                {formatDuration(durationMsRef.current)}
              </div>
              <div className="esl-preview-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={discardRecording}>
                  Re-record
                </button>
                <form method="post" encType="multipart/form-data">
                  <input type="hidden" name="_intent" value="submitAttempt" />
                  <input type="hidden" name="mode" value={mode} />
                  <input type="hidden" name="durationMs" value={String(durationMsRef.current)} />
                  <input
                    ref={fileInputRef}
                    name="audioFile"
                    type="file"
                    accept="audio/*"
                    className="esl-hidden-input"
                  />
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Submitting..." : "Submit"}
                  </Button>
                </form>
              </div>
            </div>
          )}

          {recordingState === "idle" && !recordedAudioUrl && (
            <div className="esl-record-hint">Tap to start recording</div>
          )}
        </div>

        {actionData?.error ? <div className="form-error">{actionData.error}</div> : null}
      </div>

      {/* ===== RIGHT: Evaluation Panel ===== */}
      <aside className="esl-eval-panel">
        {selected?.evaluation ? (
          <EvalPanel
            evaluation={selected.evaluation}
            attemptId={selected.id}
            mode={selected.mode}
            createdAt={selected.createdAt}
            durationMs={selected.durationMs}
            audioUrl={selected.audioUrl}
            modelName={selected.modelName}
            passageId={passage.id}
            scoreBarWidth={scoreBarWidth}
          />
        ) : selected ? (
          <div className="esl-eval-empty">
            <audio controls src={selected.audioUrl} className="esl-audio-player" />
            <p className="post-meta">Evaluation not available for this attempt.</p>
          </div>
        ) : attempts.length === 0 ? (
          <div className="esl-eval-empty">
            <div className="esl-eval-empty-title">No attempts yet</div>
            <p className="esl-eval-empty-desc">Record your first reading to see AI feedback here.</p>
          </div>
        ) : null}

        {/* Score trend */}
        {scoreTrend.length > 1 && (
          <div className="esl-trend">
            <div className="esl-eval-subtitle">Progress</div>
            <div className="esl-trend-row">
              {scoreTrend.map((point, i) => (
                <div key={i} className="esl-trend-point">
                  <div
                    className="esl-trend-bar"
                    style={{ height: `${Math.max(4, (point.score ?? 0) * 0.6)}px` }}
                  />
                  <span className="esl-trend-score">{point.score ?? "–"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Attempt history */}
        {attempts.length > 0 && (
          <div className="esl-history">
            <div className="esl-eval-subtitle">History ({attempts.length})</div>
            <div className="esl-history-list">
              {attempts.map((a) => (
                <Link
                  key={a.id}
                  to={`/esl/reading/${passage.id}?attempt=${a.id}`}
                  className={`esl-history-item ${selected?.id === a.id ? "is-active" : ""}`}
                >
                  <span className="esl-history-score">{a.score ?? "–"}</span>
                  <span className="esl-history-mode">{a.mode === "recitation" ? "Rec" : "Read"}</span>
                  <span className="esl-history-date">{formatDateTime(a.createdAt)}</span>
                  {a.durationMs ? (
                    <span className="esl-history-dur">{formatDuration(a.durationMs)}</span>
                  ) : null}
                </Link>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function EvalPanel(props: {
  evaluation: EslReadingEvaluationOutput;
  attemptId: string;
  mode: string;
  createdAt: string;
  durationMs: number | null;
  audioUrl: string;
  modelName: string | null;
  passageId: string;
  scoreBarWidth: (score: number) => string;
}) {
  const { evaluation: ev, scoreBarWidth } = props;

  const dimensions = [
    { label: "Pronunciation", score: ev.scores.pronunciation },
    { label: "Fluency", score: ev.scores.fluency },
    { label: "Stress / Rhythm", score: ev.scores.stress_rhythm },
    { label: "Clarity", score: ev.scores.clarity }
  ];

  return (
    <div className="esl-eval-content">
      <div className="esl-eval-head">
        <div className="esl-eval-overall">{ev.scores.overall}</div>
        <div className="esl-eval-overall-label">
          Overall
          {ev.cefr_guess ? ` · ${ev.cefr_guess}` : ""}
        </div>
      </div>

      <audio controls src={props.audioUrl} className="esl-audio-player" />

      <div className="esl-eval-meta">
        <span>{props.mode === "recitation" ? "Recitation" : "Reading"}</span>
        <span>{formatDateTime(props.createdAt)}</span>
        {props.durationMs ? <span>{formatDuration(props.durationMs)}</span> : null}
      </div>

      {/* Score bars */}
      <div className="esl-score-bars">
        {dimensions.map((d) => (
          <div key={d.label} className="esl-score-bar-row">
            <span className="esl-score-bar-label">{d.label}</span>
            <div className="esl-score-bar-track">
              <div className="esl-score-bar-fill" style={{ width: scoreBarWidth(d.score) }} />
            </div>
            <span className="esl-score-bar-value">{d.score}</span>
          </div>
        ))}
      </div>

      {/* Commentary */}
      {ev.commentary_zh ? (
        <div className="esl-eval-commentary">{ev.commentary_zh}</div>
      ) : null}

      {/* Progress vs last */}
      {ev.progress_vs_last.length > 0 && (
        <div className="esl-eval-progress">
          {ev.progress_vs_last.map((item, i) => (
            <div key={i} className="esl-eval-progress-item">{item}</div>
          ))}
        </div>
      )}

      {/* Top actions */}
      {ev.top_actions_zh.length > 0 && (
        <>
          <div className="esl-eval-subtitle">Actions</div>
          <ul className="esl-eval-list">
            {ev.top_actions_zh.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      )}

      {/* Highlights */}
      {ev.highlights.length > 0 && (
        <>
          <div className="esl-eval-subtitle">Highlights</div>
          <div className="esl-highlights">
            {ev.highlights.map((h, i) => (
              <div key={i} className={`esl-highlight sev-${h.severity}`}>
                <span className="esl-highlight-kind">{h.kind}</span>
                <span className="esl-highlight-note">{h.note_zh}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Delete */}
      <form
        method="post"
        className="esl-eval-delete"
        onSubmit={(e) => {
          if (!confirm("Delete this attempt?")) e.preventDefault();
        }}
      >
        <input type="hidden" name="_intent" value="deleteAttempt" />
        <input type="hidden" name="attemptId" value={props.attemptId} />
        <button type="submit" className="btn btn-ghost btn-sm esl-delete-btn">Delete attempt</button>
      </form>
    </div>
  );
}
