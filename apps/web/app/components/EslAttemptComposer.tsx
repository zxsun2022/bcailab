import * as React from "react";
import { Button } from "@bcailab/ui";
import { useFetcher, useNavigate } from "@remix-run/react";
import { formatDuration, type EslReadingMode } from "~/utils/esl-reading";
import { useReadingOutputLanguage } from "~/utils/use-reading-output-language";
import { useT } from "~/i18n/context";

type RecordingState = "idle" | "recording" | "preview";

type EslAttemptComposerProps = {
  action?: string;
  submitLabel: string;
  canSubmit?: boolean;
  mode?: EslReadingMode;
  onModeChange?: (mode: EslReadingMode) => void;
  /**
   * Called with the action's payload when it returns a result instead of a
   * `redirectTo`. The anonymous trial uses this to render an evaluation inline,
   * since it has no attempt page to navigate to.
   */
  onResult?: (data: unknown) => void;
  children: (args: {
    mode: EslReadingMode;
    hideText: boolean;
    recordingState: RecordingState;
    recorder: React.ReactNode;
  }) => React.ReactNode;
};

type SubmitResult = {
  error?: string;
  redirectTo?: string;
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

export function EslAttemptComposer(props: EslAttemptComposerProps) {
  const {
    action,
    submitLabel,
    canSubmit = true,
    mode: controlledMode,
    onModeChange,
    onResult,
    children
  } = props;
  const fetcher = useFetcher<SubmitResult>();
  const navigate = useNavigate();
  const t = useT();
  const [outputLanguage] = useReadingOutputLanguage();

  const [internalMode, setInternalMode] = React.useState<EslReadingMode>("reading");
  const mode = controlledMode ?? internalMode;
  const setMode = onModeChange ?? setInternalMode;
  void setMode;
  const [recordingState, setRecordingState] = React.useState<RecordingState>("idle");
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = React.useState<string | null>(null);
  const [recordingError, setRecordingError] = React.useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const mediaStreamRef = React.useRef<MediaStream | null>(null);
  const recordedChunksRef = React.useRef<BlobPart[]>([]);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = React.useRef<number>(0);
  const durationMsRef = React.useRef<number>(0);

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
  }, [recordedAudioUrl, stopMediaStream, stopTimer]);

  React.useEffect(() => {
    if (!fetcher.data) return;
    const redirectTo = fetcher.data.redirectTo;
    if (!redirectTo) {
      // No navigation target: hand the payload to the caller to render in place.
      onResult?.(fetcher.data);
      return;
    }
    const timeoutId = window.setTimeout(() => {
      React.startTransition(() => {
        navigate(redirectTo);
      });
    }, 0);
    return () => window.clearTimeout(timeoutId);
    // `onResult` is intentionally excluded: callers pass inline closures, and
    // re-firing on every render would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data, navigate]);

  const startRecording = React.useCallback(async () => {
    if (recordingState !== "idle") return;
    setRecordingError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordingError(t("reading.recorder.unsupported"));
      return;
    }

    try {
      cleanupAudio();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      recordedChunksRef.current = [];

      const mimeType = pickRecorderMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) recordedChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        durationMsRef.current = Date.now() - startTimeRef.current;
        stopTimer();

        const blobType =
          recordedChunksRef.current[0] instanceof Blob && recordedChunksRef.current[0].type
            ? recordedChunksRef.current[0].type
            : recorder.mimeType || mimeType || "audio/webm";
        const extension = extensionFromMimeType(blobType);
        const blob = new Blob(recordedChunksRef.current, { type: blobType });
        const file = new File([blob], `reading-${Date.now()}.${extension}`, { type: blobType });

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
        setRecordingError(t("reading.recorder.stopped"));
      };

      startTimeRef.current = Date.now();
      setElapsedMs(0);
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current);
      }, 200);

      recorder.start(200);
      setRecordingState("recording");
    } catch (error) {
      setRecordingState("idle");
      stopMediaStream();
      setRecordingError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? t("reading.recorder.denied")
          : t("reading.recorder.failed")
      );
    }
  }, [cleanupAudio, recordingState, stopMediaStream, stopTimer, t]);

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

  const isUploading = fetcher.state === "submitting";
  const submitError = fetcher.data?.error;
  const submitButtonLabel = isUploading ? t("reading.recorder.submitting") : submitLabel;
  const recorder = (
    <div className="esl-compose-footer">
      {recordingState === "recording" ? (
        <div className="esl-compose-footer-top">
          <div className="esl-record-timer">{formatDuration(elapsedMs)}</div>
        </div>
      ) : null}

      {recordingState === "preview" && recordedAudioUrl ? (
        <div className="esl-preview-area">
          <audio
            controls
            src={recordedAudioUrl}
            className="esl-audio-player"
            aria-label={t("reading.recorder.preview")}
          />
          <div className="esl-preview-side">
            <div className="esl-preview-meta">{formatDuration(durationMsRef.current)}</div>
            <div className="esl-preview-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={discardRecording}
                disabled={isUploading}
              >
                {t("reading.recorder.reRecord")}
              </button>
              <Button type="submit" disabled={isUploading || !canSubmit}>
                {submitButtonLabel}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className={`esl-record-panel ${recordingState === "recording" ? "is-recording" : ""}`}>
          <div className="esl-record-copy">
            <div className="esl-record-label">
              {recordingState === "recording" ? t("reading.recorder.recording") : t("reading.recorder.ready")}
            </div>
            <div className="esl-record-hint">
              {recordingState === "recording" ? t("reading.recorder.tapStop") : t("reading.recorder.tapStart")}
            </div>
          </div>

          {recordingState === "idle" ? (
            <button
              type="button"
              className="esl-record-btn"
              aria-label={t("reading.recorder.start")}
              onClick={() => void startRecording()}
            >
              <span className="esl-record-btn-inner" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              className="esl-record-btn is-recording"
              aria-label={t("reading.recorder.stop")}
              onClick={stopRecording}
            >
              <span className="esl-record-btn-stop" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {recordingError ? <div className="form-error" role="alert">{recordingError}</div> : null}
    </div>
  );

  return (
    <fetcher.Form
      method="post"
      encType="multipart/form-data"
      action={action}
      className="esl-compose-form"
    >
      <input type="hidden" name="outputLanguage" value={outputLanguage} />
      <div className="esl-compose-main">
        {children({
          mode,
          hideText: mode === "recitation",
          recordingState,
          recorder
        })}
      </div>
      <input type="hidden" name="_intent" value="submitAttempt" />
      <input type="hidden" name="_transport" value="fetcher" />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="durationMs" value={String(durationMsRef.current)} />
      <input
        ref={fileInputRef}
        name="audioFile"
        type="file"
        accept="audio/*"
        className="esl-hidden-input"
      />

      {submitError ? <div className="form-error">{submitError}</div> : null}
    </fetcher.Form>
  );
}

export function EslModeToggle(props: {
  mode: EslReadingMode;
  onModeChange: (mode: EslReadingMode) => void;
}) {
  const t = useT();
  return (
    <div className="esl-mode-toggle">
      <button
        type="button"
        className={`esl-mode-btn ${props.mode === "reading" ? "is-active" : ""}`}
        onClick={() => props.onModeChange("reading")}
      >
        {t("reading.mode.read")}
      </button>
      <button
        type="button"
        className={`esl-mode-btn ${props.mode === "recitation" ? "is-active" : ""}`}
        onClick={() => props.onModeChange("recitation")}
      >
        {t("reading.mode.recite")}
      </button>
    </div>
  );
}
