import * as React from "react";

type CompactAudioPlayerProps = {
  label: string;
  src?: string | null;
  status?: "ready" | "pending" | "failed" | "missing";
  description?: string;
};

const AUDIO_PLAY_EVENT = "bcailab-compact-audio-play";

export function CompactAudioPlayer(props: CompactAudioPlayerProps) {
  const {
    label,
    src = null,
    status = "ready",
    description
  } = props;
  const playerId = React.useId();
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [playState, setPlayState] = React.useState<"idle" | "playing" | "paused">("idle");
  const [playError, setPlayError] = React.useState<string | null>(null);

  const stopPlayback = React.useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setPlayState("idle");
  }, []);

  React.useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  React.useEffect(() => {
    setPlayError(null);
    setPlayState("idle");
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

  const handleTogglePlayback = async () => {
    if (!src || status !== "ready") return;
    const audio = audioRef.current;
    if (!audio) return;

    if (!audio.paused && !audio.ended) {
      audio.pause();
      return;
    }

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
  };

  const statusText =
    status === "pending"
      ? "Preparing"
      : status === "failed"
        ? "Unavailable"
        : status === "missing"
          ? "Not ready"
        : playError
          ? playError
          : playState === "playing"
            ? "Playing"
            : playState === "paused"
              ? "Paused"
              : "Ready";
  const displayText = description ? `${statusText} · ${description}` : statusText;

  return (
    <div className={`compact-audio-player is-${status}`}>
      <audio ref={audioRef} src={src ?? undefined} preload="none" />
      <div className="compact-audio-copy">
        <div className="compact-audio-label">{label}</div>
        <div className="compact-audio-status">{displayText}</div>
      </div>
      <div className="compact-audio-actions">
        <button
          type="button"
          className="compact-audio-btn"
          onClick={() => void handleTogglePlayback()}
          disabled={!src || status !== "ready"}
        >
          {playState === "playing" ? "Pause" : "Play"}
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
