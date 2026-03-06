import type { AppLoadContext } from "@remix-run/cloudflare";
import {
  getEslPassageById,
  markEslPassageReferenceTtsCompleted,
  markEslPassageReferenceTtsFailed,
  markEslPassageReferenceTtsPending,
  type EslPassage
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

const buildReferenceR2Key = (userId: string, passageId: string): string => {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `esl/reference/${userId}/${year}/${month}/${passageId}.mp3`;
};

const loadActivePassage = async (
  context: AppLoadContext,
  input: { passageId: string; userId: string }
): Promise<EslPassage | null> => {
  const passage = await getEslPassageById(context.env.DB, input.passageId, {
    includeDeleted: true
  });
  if (!passage || passage.user_id !== input.userId || passage.deleted_at) return null;
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
  input: { passageId: string; userId: string }
) => {
  let passage = await loadActivePassage(context, input);
  if (!passage) return;
  if (passage.reference_tts_status === "completed" && passage.reference_tts_r2_key) return;

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

  const r2Key = buildReferenceR2Key(input.userId, input.passageId);
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

  const saved = await markEslPassageReferenceTtsCompleted(context.env.DB, {
    id: input.passageId,
    userId: input.userId,
    voiceName: voice.name,
    r2Key,
    audioBytes: synthesized.audioBytes.byteLength
  });
  if (!saved) {
    await context.env.R2.delete(r2Key).catch(() => undefined);
  }
};

export const schedulePassageReferenceSynthesis = async (
  context: AppLoadContext,
  input: { userId: string; passage: EslPassage }
): Promise<boolean> => {
  if (input.passage.reference_tts_status === "completed" && input.passage.reference_tts_r2_key) {
    return true;
  }

  const supported = await markEslPassageReferenceTtsPending(context.env.DB, {
    id: input.passage.id,
    userId: input.userId
  });
  if (!supported) return false;

  const task = runPassageReferenceSynthesis(context, {
    passageId: input.passage.id,
    userId: input.userId
  }).catch(async () => {
    await markEslPassageReferenceTtsFailed(context.env.DB, {
      id: input.passage.id,
      userId: input.userId
    }).catch(() => undefined);
  });

  if (context.ctx?.waitUntil) {
    context.ctx.waitUntil(task);
  } else {
    await task;
  }

  return true;
};
