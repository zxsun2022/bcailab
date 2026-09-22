import type { AppLoadContext } from "@remix-run/cloudflare";
import { getOptionalUser } from "~/utils/auth.server";
import {
  TRANSLATE_TIERS,
  ensureAnonId,
  getClientIp,
  getTranslateQuotaStatus
} from "~/utils/translate-quota.server";
import { isTranslateLanguageCode, type TranslateLanguageCode } from "~/utils/translate-languages";
import { getRequestTranslator } from "~/i18n/locale.server";

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
  // Errors are shown to the visitor as written, in the interface language.
  const t = getRequestTranslator(request);
  const fail = (error: string, status: number, code?: TranslateRequestError["code"]) =>
    ({ ok: false as const, status, error, code, setCookie });

  const text = String(formData.get("text") ?? "");
  const sourceRaw = String(formData.get("source") ?? "auto");
  const targetRaw = String(formData.get("target") ?? "en");

  if (!text.trim()) return fail(t("translate.error.empty"), 400);
  if (text.length > tierConfig.maxChars) {
    return fail(
      user
        ? t("translate.error.tooLong", { max: tierConfig.maxChars.toLocaleString() })
        : t("translate.error.tooLongAnonymous", {
            max: tierConfig.maxChars.toLocaleString(),
            signedInMax: TRANSLATE_TIERS.free.maxChars.toLocaleString()
          }),
      400,
      "too_long"
    );
  }

  const sourceLang =
    sourceRaw === "auto" || !isTranslateLanguageCode(sourceRaw) ? "auto" : sourceRaw;
  if (!isTranslateLanguageCode(targetRaw)) return fail(t("translate.error.unsupportedTarget"), 400);
  if (sourceLang !== "auto" && sourceLang === targetRaw) {
    return fail(t("translate.error.sameLanguage"), 400);
  }

  const quota = await getTranslateQuotaStatus(context.env.DB, identity);
  if (quota.remainingToday <= 0) {
    return fail(
      user ? t("translate.error.quotaSignedIn") : t("translate.error.quotaAnonymous"),
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
