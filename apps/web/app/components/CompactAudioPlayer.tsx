import * as React from "react";

type CompactAudioPlayerProps = {
  label: string;
  src?: string | null;
  status?: "ready" | "pending" | "failed" | "missing";
  onRequestSource?: (() => void) | null;
  autoPlayToken?: number | null;
};

const AUDIO_PLAY_EVENT = "bcailab-compact-audio-play";

export function CompactAudioPlayer(props: CompactAudioPlayerProps) {
  const {
    label,
    src = null,
    status = "ready",
    onRequestSource = null,
    autoPlayToken = null
  } = props;
  const playerId = React.useId();
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [playState, setPlayState] = React.useState<"idle" | "playing" | "paused">("idle");
  const [playError, setPlayError] = React.useState<string | null>(null);
  const handledAutoPlayTokenRef = React.useRef<number | null>(null);

  const stopPlayback = React.useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setPlayState("idle");
  }, []);

  const playAudio = React.useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !src || status !== "ready") return;

    window.dispatchEvent(
      new CustomEvent(AUDIO_PLAY_EVENT, { detail: { playerId } })
    );

    try {
      await audio.play();
      setPlayError(null);
    } catch {
      setPlayError("Unavailable");
      setPlayState("idle");
    }
  }, [playerId, src, status]);

  React.useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  React.useEffect(() => {
    setPlayError(null);
    setPlayState("idle");
    handledAutoPlayTokenRef.current = null;
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }, [src, stopPlayback]);

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setPlayState("playing");
    const handlePause = () => {
      if (audio.currentTime > 0 && !audio.ended) {
        setPlayState("paused");
      } else {
        setPlayState("idle");
      }
    };
    const handleEnded = () => {
      audio.currentTime = 0;
      setPlayState("idle");
    };
    const handleError = () => {
      setPlayError("Unavailable");
      setPlayState("idle");
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, []);

  React.useEffect(() => {
    const handleOtherPlayer = (event: Event) => {
      const customEvent = event as CustomEvent<{ playerId?: string }>;
      if (customEvent.detail?.playerId === playerId) return;
      stopPlayback();
    };
    window.addEventListener(AUDIO_PLAY_EVENT, handleOtherPlayer);
    return () => window.removeEventListener(AUDIO_PLAY_EVENT, handleOtherPlayer);
  }, [playerId, stopPlayback]);

  React.useEffect(() => {
    if (
      autoPlayToken == null ||
      handledAutoPlayTokenRef.current === autoPlayToken ||
      !src ||
      status !== "ready"
    ) {
      return;
    }
    handledAutoPlayTokenRef.current = autoPlayToken;
    void playAudio();
  }, [autoPlayToken, playAudio, src, status]);

  const handlePrimaryAction = async () => {
    if (status !== "ready") {
      if ((status === "missing" || status === "failed") && onRequestSource) {
        onRequestSource();
      }
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;

    if (!audio.paused && !audio.ended) {
      audio.pause();
      return;
    }
    await playAudio();
  };

  const indicatorState =
    status === "pending"
      ? "pending"
      : playState === "playing"
        ? "playing"
        : status === "failed" || Boolean(playError)
          ? "failed"
          : status === "missing"
            ? "missing"
            : playState === "paused"
              ? "paused"
              : "idle";
  const primaryLabel =
    status === "ready"
      ? playState === "playing"
        ? "Pause"
        : "Play"
      : status === "pending"
        ? "Preparing..."
        : "Play";
  const canRequestSource = Boolean(onRequestSource) && (status === "missing" || status === "failed");
  const primaryDisabled =
    status === "pending" || (status !== "ready" && !canRequestSource);

  return (
    <div className={`compact-audio-player is-${status} is-${indicatorState}`}>
      <audio ref={audioRef} src={src ?? undefined} preload="none" />
      <div className="compact-audio-copy">
        <div className="compact-audio-label-row">
          <span className={`compact-audio-indicator is-${indicatorState}`} />
          <div className="compact-audio-label">{label}</div>
        </div>
      </div>
      <div className="compact-audio-actions">
        <button
          type="button"
          className="compact-audio-btn"
          onClick={() => void handlePrimaryAction()}
          disabled={primaryDisabled}
        >
          {primaryLabel}
        </button>
        <button
          type="button"
          className="compact-audio-btn compact-audio-btn-secondary"
          onClick={stopPlayback}
          disabled={!src || playState === "idle" || status !== "ready"}
        >
          Stop
        </button>
      </div>
    </div>
  );
}
