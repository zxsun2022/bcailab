import type { AppLoadContext } from "@remix-run/cloudflare";
import {
  getOwnedPassage,
  markPassageReferenceAudioCompleted,
  markPassageReferenceAudioFailed,
  markPassageReferenceAudioPending,
  type Passage
} from "@bcailab/db";
import {
  getVoicesByLanguage,
  synthesizeSpeech,
  type SpeechVoiceOption
} from "~/utils/google-tts.server";
import { SUPPORTED_SPEECH_LANGUAGES } from "~/utils/tts";
import { buildSpeechPlan } from "~/utils/tts.server";

const ESL_REFERENCE_LANGUAGE = SUPPORTED_SPEECH_LANGUAGES.filter(
  (language) => language.code === "en-US"
);

export const buildReferenceFallbackR2Key = (userId: string, passageId: string): string =>
  `esl/reference/${userId}/${passageId}.mp3`;

const loadActivePassage = async (
  context: AppLoadContext,
  input: { passageId: string; userId: string }
): Promise<Passage | null> => {
  const passage = await getOwnedPassage(context.env.DB, {
    id: input.passageId,
    userId: input.userId
  });
  if (!passage || passage.deleted_at) return null;
  return passage;
};

const pickReferenceVoice = async (context: AppLoadContext): Promise<SpeechVoiceOption | null> => {
  const voiceMap = await getVoicesByLanguage(context.env, ESL_REFERENCE_LANGUAGE);
  const enUsVoices = voiceMap["en-US"] ?? [];

  const preferenceChain: Array<(voice: SpeechVoiceOption) => boolean> = [
    (voice) =>
      voice.languageCode === "en-US" &&
      voice.family === "chirp3" &&
      voice.ssmlGender === "MALE",
    (voice) => voice.languageCode === "en-US" && voice.family === "chirp3",
    (voice) =>
      voice.languageCode === "en-US" &&
      voice.family === "neural2" &&
      voice.ssmlGender === "MALE",
    (voice) => voice.languageCode === "en-US" && voice.family === "neural2"
  ];

  for (const predicate of preferenceChain) {
    const match = enUsVoices.find(predicate);
    if (match) return match;
  }

  return null;
};

const runPassageReferenceSynthesis = async (
  context: AppLoadContext,
  input: { passageId: string; userId: string; persistStatus: boolean }
) => {
  let passage = await loadActivePassage(context, input);
  if (!passage) return;
  if (passage.reference_audio_status === "completed" && passage.reference_audio_r2_key) return;

  const r2Key = input.persistStatus && passage.reference_audio_r2_key
    ? passage.reference_audio_r2_key
    : buildReferenceFallbackR2Key(input.userId, input.passageId);
  const existing = await context.env.R2.head(r2Key).catch(() => null);
  if (existing) return;

  const voice = await pickReferenceVoice(context);
  if (!voice) {
    throw new Error("No supported American English voice is available.");
  }

  const plan = buildSpeechPlan({
    content: passage.content_text,
    languageCode: voice.languageCode,
    withTiming: false
  });
  const synthesized = await synthesizeSpeech({
    env: context.env,
    input: { type: "text", value: plan.processedText },
    languageCode: voice.languageCode,
    voiceName: voice.name,
    enableTimePointing: false
  });

  passage = await loadActivePassage(context, input);
  if (!passage) return;

  await context.env.R2.put(r2Key, synthesized.audioBytes, {
    httpMetadata: {
      contentType: "audio/mpeg",
      contentDisposition: `inline; filename="reference-${input.passageId}.mp3"`
    }
  });

  const activePassage = await loadActivePassage(context, input);
  if (!activePassage) {
    await context.env.R2.delete(r2Key).catch(() => undefined);
    return;
  }

  const saved = await markPassageReferenceAudioCompleted(context.env.DB, {
    id: input.passageId,
    userId: input.userId,
    voiceName: voice.name,
    r2Key,
    audioBytes: synthesized.audioBytes.byteLength
  });
  if (input.persistStatus && !saved) {
    await context.env.R2.delete(r2Key).catch(() => undefined);
  }
};

export const schedulePassageReferenceSynthesis = async (
  context: AppLoadContext,
  input: { userId: string; passage: Passage }
): Promise<boolean> => {
  if (input.passage.reference_audio_status === "completed" && input.passage.reference_audio_r2_key) {
    return true;
  }

  const supported = await markPassageReferenceAudioPending(context.env.DB, {
    id: input.passage.id,
    userId: input.userId
  });

  const task = runPassageReferenceSynthesis(context, {
    passageId: input.passage.id,
    userId: input.userId,
    persistStatus: supported
  }).catch(async () => {
    if (supported) {
      await markPassageReferenceAudioFailed(context.env.DB, {
        id: input.passage.id,
        userId: input.userId
      }).catch(() => undefined);
    }
  });

  if (context.ctx?.waitUntil) {
    context.ctx.waitUntil(task);
  } else {
    await task;
  }

  return true;
};
