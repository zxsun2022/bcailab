import type { AppLoadContext } from "@remix-run/cloudflare";
import { getOptionalUser } from "~/utils/auth.server";
import {
  TRANSLATE_TIERS,
  ensureAnonId,
  getClientIp,
  getTranslateQuotaStatus
} from "~/utils/translate-quota.server";
import { isTranslateLanguageCode, type TranslateLanguageCode } from "~/utils/translate-languages";

/**
 * Validation + quota gate shared by the two translate entry points: the `/translate`
 * action (whole-response JSON, the no-JS fallback) and `/translate/stream` (SSE).
 * Both must agree on limits and counters, so the checks live here rather than in
 * either route.
 */

export type TranslateRequestError = {
  ok: false;
  status: number;
  error: string;
  code?: "quota_exceeded" | "too_long";
  setCookie: string | null;
};

export type TranslateRequestReady = {
  ok: true;
  identity: { userId: string | null; anonId: string; ip: string };
  task: (typeof TRANSLATE_TIERS)[keyof typeof TRANSLATE_TIERS]["task"];
  text: string;
  sourceLang: TranslateLanguageCode | "auto";
  targetLang: TranslateLanguageCode;
  remainingToday: number;
  setCookie: string | null;
};

export const prepareTranslateRequest = async (
  request: Request,
  context: AppLoadContext,
  formData: FormData
): Promise<TranslateRequestError | TranslateRequestReady> => {
  const user = await getOptionalUser(request, context);
  const { anonId, setCookie } = ensureAnonId(request);
  const identity = { userId: user?.id ?? null, anonId, ip: getClientIp(request) };
  const tierConfig = user ? TRANSLATE_TIERS.free : TRANSLATE_TIERS.anonymous;
  const fail = (error: string, status: number, code?: TranslateRequestError["code"]) =>
    ({ ok: false as const, status, error, code, setCookie });

  const text = String(formData.get("text") ?? "");
  const sourceRaw = String(formData.get("source") ?? "auto");
  const targetRaw = String(formData.get("target") ?? "en");

  if (!text.trim()) return fail("Enter some text to translate.", 400);
  if (text.length > tierConfig.maxChars) {
    return fail(
      user
        ? `Text is too long (max ${tierConfig.maxChars.toLocaleString()} characters).`
        : `Text is too long for anonymous use (max ${tierConfig.maxChars.toLocaleString()} characters). Sign in to translate up to ${TRANSLATE_TIERS.free.maxChars.toLocaleString()}.`,
      400,
      "too_long"
    );
  }

  const sourceLang =
    sourceRaw === "auto" || !isTranslateLanguageCode(sourceRaw) ? "auto" : sourceRaw;
  if (!isTranslateLanguageCode(targetRaw)) return fail("Unsupported target language.", 400);
  if (sourceLang !== "auto" && sourceLang === targetRaw) {
    return fail("Source and target languages are the same.", 400);
  }

  const quota = await getTranslateQuotaStatus(context.env.DB, identity);
  if (quota.remainingToday <= 0) {
    return fail(
      user
        ? "Daily translation limit reached. Please come back tomorrow."
        : "You've used today's free translations. Sign in to continue — it's free.",
      429,
      "quota_exceeded"
    );
  }

  return {
    ok: true,
    identity,
    task: tierConfig.task,
    text,
    sourceLang,
    targetLang: targetRaw,
    remainingToday: quota.remainingToday,
    setCookie
  };
};
