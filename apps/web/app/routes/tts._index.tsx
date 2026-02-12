import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useActionData, useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import { Button, Card } from "@bcailab/ui";
import {
  createTtsGeneration,
  getTtsGenerationById,
  listTtsGenerationsByUser,
  softDeleteTtsGeneration
} from "@bcailab/db";
import { AutosizeTextarea } from "~/components/AutosizeTextarea";
import { requireUser } from "~/utils/auth.server";
import {
  getVoicesByLanguage,
  synthesizeSpeech,
  type SpeechVoiceOption
} from "~/utils/google-tts.server";
import {
  AUDIO_FORMAT,
  SUPPORTED_SPEECH_LANGUAGES,
  type SpeechAlignment
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
  voices: SpeechVoiceOption[];
};

type HistoryItem = {
  id: string;
  inputText: string;
  languageCode: string;
  voiceName: string;
  createdAt: string;
};

type SelectedRecord = {
  id: string;
  inputText: string;
  processedText: string;
  languageCode: string;
  voiceName: string;
  createdAt: string;
  audioUrl: string;
  downloadUrl: string;
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
const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });

type PlaybackState = {
  currentChar: number;
  currentTokenIndex: number;
};

type TranscriptSegment = {
  kind: "token" | "gap";
  text: string;
  start: number;
  end: number;
  tokenIndex: number | null;
  lineIndex: number;
  isLineBreak: boolean;
};

type TranscriptModel = {
  segments: TranscriptSegment[];
  tokenToLine: Map<number, number>;
};

const markNameToTokenIndex = (name: string): number | null => {
  const match = /^m_(\d+)$/.exec(name);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
};

const splitGapWithLineBreaks = (input: {
  text: string;
  start: number;
  end: number;
}): Array<Omit<TranscriptSegment, "lineIndex">> => {
  if (!input.text) return [];

  const parts: Array<Omit<TranscriptSegment, "lineIndex">> = [];
  let cursor = 0;

  while (cursor < input.text.length) {
    const breakIndex = input.text.indexOf("\n", cursor);
    if (breakIndex === -1) {
      const text = input.text.slice(cursor);
      if (text) {
        parts.push({
          kind: "gap",
          text,
          start: input.start + cursor,
          end: input.end,
          tokenIndex: null,
          isLineBreak: false
        });
      }
      break;
    }

    if (breakIndex > cursor) {
      const text = input.text.slice(cursor, breakIndex);
      parts.push({
        kind: "gap",
        text,
        start: input.start + cursor,
        end: input.start + breakIndex,
        tokenIndex: null,
        isLineBreak: false
      });
    }

    parts.push({
      kind: "gap",
      text: "\n",
      start: input.start + breakIndex,
      end: input.start + breakIndex + 1,
      tokenIndex: null,
      isLineBreak: true
    });

    cursor = breakIndex + 1;
  }

  return parts;
};

const buildTranscriptModel = (alignment: SpeechAlignment): TranscriptModel => {
  const marks = [...alignment.marks].sort((a, b) => a.startChar - b.startChar);
  const rawSegments: Array<Omit<TranscriptSegment, "lineIndex">> = [];
  let cursor = 0;

  for (let i = 0; i < marks.length; i += 1) {
    const mark = marks[i];
    if (mark.startChar > cursor) {
      rawSegments.push(
        ...splitGapWithLineBreaks({
          text: alignment.displayText.slice(cursor, mark.startChar),
          start: cursor,
          end: mark.startChar
        })
      );
    }

    const tokenText = alignment.displayText.slice(mark.startChar, mark.endChar);
    if (tokenText) {
      rawSegments.push({
        kind: "token",
        text: tokenText,
        start: mark.startChar,
        end: mark.endChar,
        tokenIndex: markNameToTokenIndex(mark.name) ?? i,
        isLineBreak: false
      });
    }
    cursor = mark.endChar;
  }

  if (cursor < alignment.displayText.length) {
    rawSegments.push(
      ...splitGapWithLineBreaks({
        text: alignment.displayText.slice(cursor),
        start: cursor,
        end: alignment.displayText.length
      })
    );
  }

  const tokenToLine = new Map<number, number>();
  const segments: TranscriptSegment[] = [];
  let lineIndex = 0;
  for (const segment of rawSegments) {
    segments.push({
      ...segment,
      lineIndex
    });
    if (segment.kind === "token" && segment.tokenIndex !== null && !tokenToLine.has(segment.tokenIndex)) {
      tokenToLine.set(segment.tokenIndex, lineIndex);
    }
    if (segment.isLineBreak) {
      lineIndex += 1;
    }
  }

  return {
    segments,
    tokenToLine
  };
};

const computePlaybackState = (input: {
  alignment: SpeechAlignment;
  currentTime: number;
  duration: number;
}): PlaybackState => {
  const textLength = input.alignment.displayText.length;
  if (textLength <= 0 || input.alignment.marks.length === 0) {
    return {
      currentChar: 0,
      currentTokenIndex: -1
    };
  }

  const marks = input.alignment.marks;
  if (input.currentTime <= marks[0].startSec) {
    return {
      currentChar: clamp(marks[0].startChar, 0, textLength),
      currentTokenIndex: markNameToTokenIndex(marks[0].name) ?? 0
    };
  }

  for (let i = 0; i < marks.length - 1; i += 1) {
    const current = marks[i];
    const next = marks[i + 1];
    if (input.currentTime < next.startSec) {
      const segmentDuration = Math.max(next.startSec - current.startSec, 0.001);
      const ratio = clamp((input.currentTime - current.startSec) / segmentDuration, 0, 1);
      const charPos = current.startChar + (next.startChar - current.startChar) * ratio;
      return {
        currentChar: clamp(charPos, 0, textLength),
        currentTokenIndex: markNameToTokenIndex(current.name) ?? i
      };
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
    return {
      currentChar: clamp(charPos, 0, textLength),
      currentTokenIndex: markNameToTokenIndex(last.name) ?? marks.length - 1
    };
  }

  return {
    currentChar: clamp(last.endChar, 0, textLength),
    currentTokenIndex: markNameToTokenIndex(last.name) ?? marks.length - 1
  };
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const generations = await listTtsGenerationsByUser(context.env.DB, user.id);
  const url = new URL(request.url);
  const selectedId = url.searchParams.get("record");
  const selectedRow =
    selectedId ? generations.find((generation) => generation.id === selectedId) : null;
  const selected: SelectedRecord | null = selectedRow
    ? {
        id: selectedRow.id,
        inputText: selectedRow.input_text,
        processedText: selectedRow.processed_text,
        languageCode: selectedRow.language_code,
        voiceName: selectedRow.voice_name,
        createdAt: selectedRow.created_at,
        audioUrl: `/tts/audio/${selectedRow.id}`,
        downloadUrl: `/tts/audio/${selectedRow.id}?download=1`
      }
    : null;
  const history: HistoryItem[] = generations.map((generation) => ({
    id: generation.id,
    inputText: generation.input_text,
    languageCode: generation.language_code,
    voiceName: generation.voice_name,
    createdAt: generation.created_at
  }));

  let voiceError: string | null = null;
  let voicesByLanguage: Record<string, SpeechVoiceOption[]> = {};
  try {
    voicesByLanguage = await getVoicesByLanguage(context.env, SUPPORTED_SPEECH_LANGUAGES);
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
    voiceError,
    history,
    selected
  });
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const user = await requireUser(request, context);
  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "generate");

  if (intent === "delete") {
    const id = String(formData.get("id") ?? "");
    if (!id) {
      return json<ActionError>({ error: "Missing record id." }, { status: 400 });
    }

    const generation = await getTtsGenerationById(context.env.DB, id, {
      includeDeleted: true
    });
    if (!generation || generation.user_id !== user.id || generation.deleted_at) {
      return json<ActionError>({ error: "Not found." }, { status: 404 });
    }

    try {
      await context.env.R2.delete(generation.r2_key);
      await softDeleteTtsGeneration(context.env.DB, { id, userId: user.id });
      const generations = await listTtsGenerationsByUser(context.env.DB, user.id);
      const next = generations.find((item) => item.id !== id);
      return redirect(next ? `/tts?record=${next.id}` : "/tts");
    } catch {
      return json<ActionError>(
        { error: "Failed to delete the audio asset. Please try again." },
        { status: 500 }
      );
    }
  }

  if (intent !== "generate") {
    return json<ActionError>({ error: "Unsupported action." }, { status: 400 });
  }

  const content = String(formData.get("content") ?? "");
  const languageCode = String(formData.get("languageCode") ?? "");
  const voiceName = String(formData.get("voiceName") ?? "");

  if (!SUPPORTED_SPEECH_LANGUAGES.some((language) => language.code === languageCode)) {
    return json<ActionError>({ error: "Unsupported language." }, { status: 400 });
  }

  try {
    const voiceMap = await getVoicesByLanguage(context.env, SUPPORTED_SPEECH_LANGUAGES);
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
      languageCode,
      withTiming: selectedVoice.family !== "chirp3"
    });

    const synthesized = await synthesizeSpeech({
      env: context.env,
      input:
        selectedVoice.family === "chirp3"
          ? { type: "text", value: plan.processedText }
          : { type: "ssml", value: plan.ssml },
      languageCode,
      voiceName: selectedVoice.name,
      enableTimePointing: selectedVoice.family !== "chirp3"
    });

    const generationId = crypto.randomUUID();
    const r2Key = buildR2Key(user.id, generationId);
    await context.env.R2.put(r2Key, synthesized.audioBytes, {
      httpMetadata: {
        contentType: "audio/mpeg",
        contentDisposition: `inline; filename="speech-${generationId}.mp3"`
      }
    });

    const alignment =
      selectedVoice.family === "chirp3"
        ? { displayText: plan.displayText, marks: [] }
        : buildSpeechAlignment({
            displayText: plan.displayText,
            tokens: plan.tokens,
            timepoints: synthesized.timepoints
          });

    await createTtsGeneration(context.env.DB, {
      id: generationId,
      userId: user.id,
      inputText: content,
      processedText: plan.processedText,
      inputMode: "rendered",
      languageCode,
      voiceName: selectedVoice.name,
      audioFormat: AUDIO_FORMAT,
      r2Key,
      audioBytes: synthesized.audioBytes.byteLength
    });

    const warning =
      selectedVoice.family !== "chirp3" && alignment.marks.length < 2
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
  const { languages, voiceError, history, selected } = useLoaderData<typeof loader>();
  const routeActionData = useActionData<typeof action>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const transcriptBodyRef = React.useRef<HTMLDivElement | null>(null);
  const currentWordRef = React.useRef<HTMLSpanElement | null>(null);
  const autoSelectedGenerationRef = React.useRef<string | null>(null);

  const [content, setContent] = React.useState("");
  const [languageCode, setLanguageCode] = React.useState(() => {
    const withVoices = languages.find((language) => language.voices.length > 0);
    return withVoices?.code ?? languages[0]?.code ?? "";
  });
  const [voiceName, setVoiceName] = React.useState("");
  const [currentChar, setCurrentChar] = React.useState(0);
  const [currentTokenIndex, setCurrentTokenIndex] = React.useState<number>(-1);
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);
  const [mobileHistoryOpen, setMobileHistoryOpen] = React.useState(false);

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
  const generation = actionData && "generation" in actionData ? actionData.generation : null;
  const alignment = actionData && "alignment" in actionData ? actionData.alignment : null;
  const warning = actionData && "warning" in actionData ? actionData.warning : undefined;
  const errorMessage = actionData && "error" in actionData ? actionData.error : undefined;
  const deleteErrorMessage =
    routeActionData &&
    typeof routeActionData === "object" &&
    "error" in routeActionData &&
    typeof routeActionData.error === "string"
      ? routeActionData.error
      : undefined;

  const selectedId = selected?.id ?? null;
  const activeAlignment =
    selectedId !== null
      ? generation && alignment && generation.id === selectedId
        ? alignment
        : null
      : alignment;
  const activeWarning =
    selectedId !== null
      ? generation && alignment && generation.id === selectedId
        ? warning
        : undefined
      : warning;
  const canHighlight = activeAlignment ? activeAlignment.marks.length >= 2 : false;
  const isSubmitting = fetcher.state !== "idle";
  const canGenerate = !!voiceName && !isSubmitting;
  const transcriptModel = React.useMemo(
    () => (activeAlignment ? buildTranscriptModel(activeAlignment) : null),
    [activeAlignment]
  );
  const currentLineIndex = transcriptModel?.tokenToLine.get(currentTokenIndex) ?? -1;

  React.useEffect(() => {
    if (!generation?.id) return;
    if (autoSelectedGenerationRef.current === generation.id) return;
    autoSelectedGenerationRef.current = generation.id;
    if (selectedId === generation.id) return;
    navigate(`/tts?record=${generation.id}`);
  }, [generation?.id, navigate, selectedId]);

  React.useEffect(() => {
    setCurrentChar(0);
    setCurrentTokenIndex(-1);
  }, [generation?.id, selectedId]);

  React.useEffect(() => {
    const audio = audioRef.current;
    if (
      !audio ||
      !activeAlignment ||
      activeAlignment.displayText.length === 0 ||
      activeAlignment.marks.length < 2
    ) {
      return;
    }

    let frameId = 0;
    const tick = () => {
      const state = computePlaybackState({
        alignment: activeAlignment,
        currentTime: audio.currentTime ?? 0,
        duration: Number.isFinite(audio.duration) ? audio.duration : 0
      });
      setCurrentChar(state.currentChar);
      setCurrentTokenIndex(state.currentTokenIndex);

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
  }, [activeAlignment]);

  React.useEffect(() => {
    if (!canHighlight) return;
    const element = currentWordRef.current;
    const container = transcriptBodyRef.current;
    if (!element || !container) return;
    element.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: prefersReducedMotion ? "auto" : "smooth"
    });
  }, [currentTokenIndex, canHighlight, prefersReducedMotion]);

  const renderTranscript = (displayText: string) => {
    if (!canHighlight) {
      return <div className="tts-transcript-fallback">{displayText}</div>;
    }

    return (
      <div className="tts-transcript">
        <div className="tts-transcript-title">Synced transcript</div>
        <div className="tts-transcript-body" ref={transcriptBodyRef}>
          {transcriptModel?.segments.map((segment, index) => {
            const isRead = segment.end <= currentChar;
            const isCurrentLine =
              currentLineIndex >= 0 &&
              segment.lineIndex === currentLineIndex &&
              !segment.isLineBreak;
            const isCurrentWord =
              segment.kind === "token" &&
              segment.tokenIndex !== null &&
              segment.tokenIndex === currentTokenIndex;

            const className = [
              "tts-segment",
              isRead ? "is-read" : "",
              isCurrentLine ? "is-current-line" : "",
              isCurrentWord ? "is-current-word" : ""
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <span
                key={`${segment.start}-${segment.end}-${index}`}
                className={className}
                ref={
                  isCurrentWord
                    ? (node) => {
                        currentWordRef.current = node;
                      }
                    : undefined
                }
              >
                {segment.text}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="tool-page tts-shell">
      <aside className="tts-sidebar">
        <div className="tts-sidebar-header">
          <Link to="/tts" className="btn btn-primary">
            New task
          </Link>
        </div>
        <div className="tts-sidebar-list">
          {history.length === 0 ? (
            <div className="tts-sidebar-empty">No tasks yet.</div>
          ) : (
            history.map((item) => (
              <Link
                key={item.id}
                to={`/tts?record=${item.id}`}
                className={`tts-sidebar-item ${selectedId === item.id ? "is-active" : ""}`}
              >
                <div className="tts-sidebar-item-title">
                  {item.inputText.slice(0, 80)}
                  {item.inputText.length > 80 ? "..." : ""}
                </div>
                <div className="tts-sidebar-item-meta">
                  <span>{item.languageCode}</span>
                  <span>{formatDate(item.createdAt)}</span>
                </div>
              </Link>
            ))
          )}
        </div>
      </aside>

      <div className={`tts-main ${mobileHistoryOpen ? "is-history-open" : ""}`}>
        <div className="tts-mobile-actions">
          <Link
            to="/tts"
            className="btn btn-ghost btn-sm tts-mobile-action"
            onClick={() => setMobileHistoryOpen(false)}
          >
            New task
          </Link>
          <button
            type="button"
            className="btn btn-ghost btn-sm tts-mobile-action"
            onClick={() => setMobileHistoryOpen((prev) => !prev)}
            aria-expanded={mobileHistoryOpen}
            aria-controls="tts-mobile-history"
          >
            {mobileHistoryOpen ? "Hide history" : "History"}
            <span className="tts-mobile-count">{history.length}</span>
          </button>
        </div>
        {mobileHistoryOpen ? (
          <div id="tts-mobile-history" className="tts-mobile-history-panel">
            {history.length === 0 ? (
              <div className="tts-sidebar-empty">No tasks yet.</div>
            ) : (
              <div className="tts-mobile-history-list">
                {history.map((item) => (
                  <Link
                    key={item.id}
                    to={`/tts?record=${item.id}`}
                    className={`tts-sidebar-item ${selectedId === item.id ? "is-active" : ""}`}
                    onClick={() => setMobileHistoryOpen(false)}
                  >
                    <div className="tts-sidebar-item-title">
                      {item.inputText.slice(0, 80)}
                      {item.inputText.length > 80 ? "..." : ""}
                    </div>
                    <div className="tts-sidebar-item-meta">
                      <span>{item.languageCode}</span>
                      <span>{formatDate(item.createdAt)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : null}
        <div className="tts-primary-content">
          {voiceError ? (
            <div className="banner tts-warning">
              Voice list could not be loaded: {voiceError}
            </div>
          ) : null}
          {deleteErrorMessage ? <div className="form-error">{deleteErrorMessage}</div> : null}

          {!selected ? (
            <Card className="tool-card-stack tts-primary-card">
              <fetcher.Form method="post" className="tts-form">
                <input type="hidden" name="_intent" value="generate" />
                <AutosizeTextarea
                  name="content"
                  placeholder="Enter text for speech generation..."
                  value={content}
                  onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setContent(event.currentTarget.value)
                  }
                />
                <div className="textarea-meta">
                  <span>Markdown syntax is cleaned automatically before synthesis.</span>
                  <span className="textarea-count">{content.length.toLocaleString()} chars</span>
                </div>

                <div className="tts-controls">
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
                          <option
                            key={language.code}
                            value={language.code}
                            disabled={language.voices.length === 0}
                          >
                            {language.label}
                            {language.voices.length === 0 ? " (no supported voice available)" : ""}
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
                          <option value="">No supported voice available</option>
                        ) : null}
                        {voiceOptions.map((voice) => (
                          <option key={voice.name} value={voice.name}>
                            {voice.family === "chirp3" ? "Chirp3 · " : "Neural2 · "}
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
                </div>
              </fetcher.Form>
            </Card>
          ) : null}

          {selected ? (
            <Card className="tool-card-stack tts-primary-card">
              <div className="tts-result-header">
                <strong>Task details</strong>
                <div className="tts-history-actions">
                  <a className="btn btn-ghost btn-sm" href={selected.downloadUrl}>
                    Download MP3
                  </a>
                  <form
                    method="post"
                    onSubmit={(event) => {
                      if (!confirm("Delete this generation? This cannot be undone.")) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="_intent" value="delete" />
                    <input type="hidden" name="id" value={selected.id} />
                    <Button type="submit" variant="danger" size="sm">
                      Delete
                    </Button>
                  </form>
                </div>
              </div>
              <audio
                ref={audioRef}
                className="tts-audio"
                controls
                preload="metadata"
                src={selected.audioUrl}
              />
              <div className="tts-history-meta" style={{ marginTop: "12px" }}>
                <span>{selected.languageCode}</span>
                <span>{selected.voiceName}</span>
                <span>{formatDate(selected.createdAt)}</span>
              </div>
              {activeAlignment
                ? renderTranscript(activeAlignment.displayText)
                : (
                  <div className="tts-transcript-fallback">{selected.processedText}</div>
                  )}
              {activeWarning ? <div className="banner tts-warning">{activeWarning}</div> : null}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
