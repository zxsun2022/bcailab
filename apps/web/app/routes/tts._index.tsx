import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useFetcher, useLoaderData } from "@remix-run/react";
import { Button, Card } from "@bcailab/ui";
import { createTtsGeneration, listTtsGenerationsByUser } from "@bcailab/db";
import { AutosizeTextarea } from "~/components/AutosizeTextarea";
import { requireUser } from "~/utils/auth.server";
import {
  getNeural2VoicesByLanguage,
  synthesizeNeural2Speech
} from "~/utils/google-tts.server";
import {
  AUDIO_FORMAT,
  MAX_TTS_SSML_BYTES,
  SUPPORTED_SPEECH_LANGUAGES,
  type SpeechAlignment,
  type SpeechInputMode
} from "~/utils/tts";
import {
  TtsValidationError,
  buildSpeechAlignment,
  buildSpeechPlan
} from "~/utils/tts.server";
import * as React from "react";

type LoaderLanguage = {
  code: string;
  label: string;
  voices: Array<{
    name: string;
    label: string;
  }>;
};

type ActionError = { error: string };
type ActionSuccess = {
  generation: {
    id: string;
    audioUrl: string;
    downloadUrl: string;
  };
  alignment: SpeechAlignment;
  warning?: string;
};

const INPUT_MODES: Array<{ value: SpeechInputMode; label: string }> = [
  { value: "markdown", label: "Markdown cleanup" },
  { value: "plain", label: "Plain text" }
];

const formatError = (error: unknown): string => {
  if (error instanceof TtsValidationError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Failed to generate speech.";
};

const buildR2Key = (userId: string, generationId: string): string => {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `tts/${userId}/${year}/${month}/${generationId}.mp3`;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const computeProgressPercent = (input: {
  alignment: SpeechAlignment;
  currentTime: number;
  duration: number;
}): number => {
  const textLength = input.alignment.displayText.length;
  if (textLength <= 0 || input.alignment.marks.length === 0) return 0;

  const marks = input.alignment.marks;
  if (input.currentTime <= marks[0].startSec) {
    return clamp((marks[0].startChar / textLength) * 100, 0, 100);
  }

  for (let i = 0; i < marks.length - 1; i += 1) {
    const current = marks[i];
    const next = marks[i + 1];
    if (input.currentTime < next.startSec) {
      const segmentDuration = Math.max(next.startSec - current.startSec, 0.001);
      const ratio = clamp((input.currentTime - current.startSec) / segmentDuration, 0, 1);
      const charPos = current.startChar + (next.startChar - current.startChar) * ratio;
      return clamp((charPos / textLength) * 100, 0, 100);
    }
  }

  const last = marks[marks.length - 1];
  if (input.duration > last.startSec) {
    const ratio = clamp(
      (input.currentTime - last.startSec) / Math.max(input.duration - last.startSec, 0.001),
      0,
      1
    );
    const charPos = last.startChar + (textLength - last.startChar) * ratio;
    return clamp((charPos / textLength) * 100, 0, 100);
  }

  return clamp((last.endChar / textLength) * 100, 0, 100);
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const historyCount = (await listTtsGenerationsByUser(context.env.DB, user.id)).length;

  let voiceError: string | null = null;
  let voicesByLanguage: Record<string, Array<{ name: string; label: string }>> = {};
  try {
    voicesByLanguage = await getNeural2VoicesByLanguage(context.env, SUPPORTED_SPEECH_LANGUAGES);
  } catch (error) {
    voiceError = formatError(error);
  }

  const languages: LoaderLanguage[] = SUPPORTED_SPEECH_LANGUAGES.map((language) => ({
    code: language.code,
    label: language.label,
    voices: voicesByLanguage[language.code] ?? []
  }));

  return json({
    languages,
    historyCount,
    voiceError
  });
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const user = await requireUser(request, context);
  const formData = await request.formData();

  const content = String(formData.get("content") ?? "");
  const inputMode = String(formData.get("inputMode") ?? "markdown");
  const languageCode = String(formData.get("languageCode") ?? "");
  const voiceName = String(formData.get("voiceName") ?? "");

  if (inputMode !== "markdown" && inputMode !== "plain") {
    return json<ActionError>({ error: "Invalid input mode." }, { status: 400 });
  }

  if (!SUPPORTED_SPEECH_LANGUAGES.some((language) => language.code === languageCode)) {
    return json<ActionError>({ error: "Unsupported language." }, { status: 400 });
  }

  try {
    const voiceMap = await getNeural2VoicesByLanguage(context.env, SUPPORTED_SPEECH_LANGUAGES);
    const languageVoices = voiceMap[languageCode] ?? [];
    const selectedVoice = languageVoices.find((voice) => voice.name === voiceName);

    if (!selectedVoice) {
      return json<ActionError>(
        { error: "Selected voice is invalid or unavailable for the chosen language." },
        { status: 400 }
      );
    }

    const plan = buildSpeechPlan({
      content,
      mode: inputMode,
      languageCode
    });

    if (new TextEncoder().encode(plan.ssml).length > MAX_TTS_SSML_BYTES) {
      return json<ActionError>(
        { error: "Input exceeds the single-request synthesis limit." },
        { status: 400 }
      );
    }

    const synthesized = await synthesizeNeural2Speech({
      env: context.env,
      ssml: plan.ssml,
      languageCode,
      voiceName: selectedVoice.name
    });

    const generationId = crypto.randomUUID();
    const r2Key = buildR2Key(user.id, generationId);
    await context.env.R2.put(r2Key, synthesized.audioBytes, {
      httpMetadata: {
        contentType: "audio/mpeg",
        contentDisposition: `inline; filename="speech-${generationId}.mp3"`
      }
    });

    const alignment = buildSpeechAlignment({
      displayText: plan.displayText,
      tokens: plan.tokens,
      timepoints: synthesized.timepoints
    });

    await createTtsGeneration(context.env.DB, {
      id: generationId,
      userId: user.id,
      inputText: content,
      processedText: plan.processedText,
      inputMode,
      languageCode,
      voiceName: selectedVoice.name,
      audioFormat: AUDIO_FORMAT,
      r2Key,
      audioBytes: synthesized.audioBytes.byteLength
    });

    const warning =
      alignment.marks.length < 2
        ? "Current response did not include enough timing points for word-level highlighting."
        : undefined;

    return json<ActionSuccess>({
      generation: {
        id: generationId,
        audioUrl: `/tts/audio/${generationId}`,
        downloadUrl: `/tts/audio/${generationId}?download=1`
      },
      alignment,
      warning
    });
  } catch (error) {
    return json<ActionError>({ error: formatError(error) }, { status: 400 });
  }
};

export default function TtsIndexPage() {
  const { languages, historyCount, voiceError } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const transcriptViewportRef = React.useRef<HTMLDivElement | null>(null);
  const transcriptLineRef = React.useRef<HTMLDivElement | null>(null);

  const [content, setContent] = React.useState("");
  const [inputMode, setInputMode] = React.useState<SpeechInputMode>("markdown");
  const [languageCode, setLanguageCode] = React.useState(() => {
    const withVoices = languages.find((language) => language.voices.length > 0);
    return withVoices?.code ?? languages[0]?.code ?? "";
  });
  const [voiceName, setVoiceName] = React.useState("");
  const [progressPercent, setProgressPercent] = React.useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);

  const selectedLanguage =
    languages.find((language) => language.code === languageCode) ??
    languages.find((language) => language.voices.length > 0) ??
    languages[0];
  const voiceOptions = selectedLanguage?.voices ?? [];

  React.useEffect(() => {
    if (!selectedLanguage && languages.length > 0) {
      setLanguageCode(languages[0].code);
      return;
    }
    if (!selectedLanguage) return;
    if (voiceOptions.some((voice) => voice.name === voiceName)) return;
    setVoiceName(voiceOptions[0]?.name ?? "");
  }, [languages, selectedLanguage, voiceOptions, voiceName]);

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const actionData = fetcher.data;
  const errorMessage =
    actionData && "error" in actionData ? actionData.error : undefined;
  const generation =
    actionData && "generation" in actionData ? actionData.generation : null;
  const alignment =
    actionData && "alignment" in actionData ? actionData.alignment : null;
  const warning =
    actionData && "warning" in actionData ? actionData.warning : undefined;

  const canHighlight = alignment ? alignment.marks.length >= 2 : false;
  const isSubmitting = fetcher.state !== "idle";
  const canGenerate = !!voiceName && !isSubmitting;

  React.useEffect(() => {
    setProgressPercent(0);
  }, [generation?.id]);

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !alignment || alignment.displayText.length === 0 || alignment.marks.length < 2) {
      return;
    }

    let frameId = 0;
    const tick = () => {
      const next = computeProgressPercent({
        alignment,
        currentTime: audio.currentTime ?? 0,
        duration: Number.isFinite(audio.duration) ? audio.duration : 0
      });
      setProgressPercent(next);

      const viewport = transcriptViewportRef.current;
      const line = transcriptLineRef.current;
      if (viewport && line) {
        const maxScroll = Math.max(line.scrollWidth - viewport.clientWidth, 0);
        if (maxScroll > 0) {
          const playheadX = (next / 100) * line.scrollWidth;
          const target = clamp(playheadX - viewport.clientWidth * 0.4, 0, maxScroll);
          if (prefersReducedMotion) {
            viewport.scrollLeft = target;
          } else {
            viewport.scrollLeft += (target - viewport.scrollLeft) * 0.24;
          }
        }
      }

      if (!audio.paused && !audio.ended) {
        frameId = requestAnimationFrame(tick);
      }
    };

    const start = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(frameId);
      tick();
    };

    audio.addEventListener("play", start);
    audio.addEventListener("pause", stop);
    audio.addEventListener("ended", stop);
    audio.addEventListener("seeking", stop);
    audio.addEventListener("seeked", stop);
    audio.addEventListener("timeupdate", stop);

    if (!audio.paused) {
      start();
    } else {
      tick();
    }

    return () => {
      cancelAnimationFrame(frameId);
      audio.removeEventListener("play", start);
      audio.removeEventListener("pause", stop);
      audio.removeEventListener("ended", stop);
      audio.removeEventListener("seeking", stop);
      audio.removeEventListener("seeked", stop);
      audio.removeEventListener("timeupdate", stop);
    };
  }, [alignment, prefersReducedMotion]);

  const transcriptStyle = {
    ["--speech-progress" as string]: `${progressPercent.toFixed(2)}%`
  } as React.CSSProperties;

  return (
    <div className="tool-page">
      <p className="tool-desc">
        Generate Neural2 speech with a synchronized playback transcript.
      </p>

      {voiceError ? (
        <div className="banner tts-warning">
          Voice list could not be loaded: {voiceError}
        </div>
      ) : null}

      <Card className="tool-card-stack">
        <fetcher.Form method="post">
          <AutosizeTextarea
            name="content"
            placeholder="Enter text for speech generation..."
            value={content}
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
              setContent(event.currentTarget.value)
            }
          />
          <div className="textarea-meta">
            <span>SSML limit: {MAX_TTS_SSML_BYTES.toLocaleString()} UTF-8 bytes</span>
            <span className="textarea-count">{content.length.toLocaleString()} chars</span>
          </div>

          <div className="tts-controls">
            <fieldset className="tts-mode-group">
              <legend className="tts-label">Text mode</legend>
              <div className="tts-mode-options">
                {INPUT_MODES.map((mode) => (
                  <label key={mode.value} className="tts-mode-option">
                    <input
                      type="radio"
                      name="inputMode"
                      value={mode.value}
                      checked={inputMode === mode.value}
                      onChange={() => setInputMode(mode.value)}
                    />
                    <span>{mode.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="tts-select-grid">
              <div>
                <label className="tts-label" htmlFor="languageCode">
                  Language
                </label>
                <select
                  id="languageCode"
                  name="languageCode"
                  className="input"
                  value={selectedLanguage?.code ?? ""}
                  onChange={(event) => setLanguageCode(event.currentTarget.value)}
                >
                  {languages.map((language) => (
                    <option key={language.code} value={language.code} disabled={language.voices.length === 0}>
                      {language.label}
                      {language.voices.length === 0 ? " (no Neural2 voice available)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="tts-label" htmlFor="voiceName">
                  Voice
                </label>
                <select
                  id="voiceName"
                  name="voiceName"
                  className="input"
                  value={voiceName}
                  onChange={(event) => setVoiceName(event.currentTarget.value)}
                  disabled={voiceOptions.length === 0}
                >
                  {voiceOptions.length === 0 ? (
                    <option value="">No Neural2 voice available</option>
                  ) : null}
                  {voiceOptions.map((voice) => (
                    <option key={voice.name} value={voice.name}>
                      {voice.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {errorMessage ? <div className="form-error">{errorMessage}</div> : null}

          <div className="form-actions">
            <Button type="submit" disabled={!canGenerate}>
              {isSubmitting ? "Generating..." : "Generate"}
            </Button>
            <Link to="/tts/history" className="posts-link">
              History
              <span className="posts-count">{historyCount}</span>
            </Link>
          </div>
        </fetcher.Form>
      </Card>

      {generation && alignment ? (
        <Card className="tool-card-stack">
          <div className="tts-result-header">
            <strong>Generated audio</strong>
            <a className="btn btn-ghost btn-sm" href={generation.downloadUrl}>
              Download MP3
            </a>
          </div>
          <audio ref={audioRef} className="tts-audio" controls preload="metadata" src={generation.audioUrl} />
          {canHighlight ? (
            <div className="tts-transcript">
              <div className="tts-transcript-title">Synced transcript</div>
              <div className="tts-transcript-viewport" ref={transcriptViewportRef}>
                <div className="tts-transcript-line" ref={transcriptLineRef} style={transcriptStyle}>
                  <span className="tts-transcript-base">{alignment.displayText}</span>
                  <span className="tts-transcript-overlay" aria-hidden>
                    {alignment.displayText}
                  </span>
                  <span className="tts-transcript-playhead" aria-hidden />
                </div>
              </div>
            </div>
          ) : (
            <div className="tts-transcript-fallback">{alignment.displayText}</div>
          )}
          {warning ? <div className="banner tts-warning">{warning}</div> : null}
        </Card>
      ) : null}
    </div>
  );
}
