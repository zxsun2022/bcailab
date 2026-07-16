import { getTranslateUsage, incrementTranslateUsage, type Db } from "@bcailab/db";
import type { LlmTask } from "~/utils/llm.server";

/**
 * Translation quota tiers.
 *
 * Anonymous users are identified by an anonymous cookie AND their IP; both
 * counters are checked and incremented so clearing cookies does not reset the
 * daily quota. Signed-in users get a generous cap that normal use never hits —
 * it exists to bound LLM spend against scripted abuse.
 */

export const TRANSLATE_TIERS = {
  anonymous: {
    maxChars: 5000,
    dailyRequests: 8,
    task: "translate_anonymous" as Extract<LlmTask, "translate" | "translate_anonymous">
  },
  free: {
    maxChars: 20000,
    dailyRequests: 200,
    task: "translate" as Extract<LlmTask, "translate" | "translate_anonymous">
  }
} as const;

export type TranslateTierName = keyof typeof TRANSLATE_TIERS;

export const ANON_COOKIE_NAME = "bcailab_anon";
const ANON_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const getClientIp = (request: Request): string => {
  const cfIp = request.headers.get("CF-Connecting-IP");
  if (cfIp) return cfIp;
  const forwarded = request.headers.get("X-Forwarded-For");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return "local";
};

export const readAnonId = (request: Request): string | null => {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${ANON_COOKIE_NAME}=([^;]+)`));
  const value = match ? decodeURIComponent(match[1]!) : "";
  return /^[0-9a-f-]{36}$/.test(value) ? value : null;
};

/** Returns the existing anon id, or a fresh one plus the Set-Cookie header to persist it. */
export const ensureAnonId = (
  request: Request
): { anonId: string; setCookie: string | null } => {
  const existing = readAnonId(request);
  if (existing) return { anonId: existing, setCookie: null };
  const anonId = crypto.randomUUID();
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return {
    anonId,
    setCookie: `${ANON_COOKIE_NAME}=${anonId}; Path=/; Max-Age=${ANON_COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax${secure}`
  };
};

const todayUtc = (): string => new Date().toISOString().slice(0, 10);

const subjectsFor = (input: { userId: string | null; anonId: string; ip: string }): string[] =>
  input.userId ? [`user:${input.userId}`] : [`anon:${input.anonId}`, `ip:${input.ip}`];

export type TranslateQuotaStatus = {
  tier: TranslateTierName;
  maxChars: number;
  dailyRequests: number;
  usedToday: number;
  remainingToday: number;
};

export const getTranslateQuotaStatus = async (
  db: Db,
  input: { userId: string | null; anonId: string; ip: string }
): Promise<TranslateQuotaStatus> => {
  const tier: TranslateTierName = input.userId ? "free" : "anonymous";
  const config = TRANSLATE_TIERS[tier];
  const usage = await getTranslateUsage(db, subjectsFor(input), todayUtc());
  const usedToday = usage.reduce((max, row) => Math.max(max, row.requests), 0);
  return {
    tier,
    maxChars: config.maxChars,
    dailyRequests: config.dailyRequests,
    usedToday,
    remainingToday: Math.max(0, config.dailyRequests - usedToday)
  };
};

export const recordTranslateUsage = async (
  db: Db,
  input: { userId: string | null; anonId: string; ip: string; chars: number }
): Promise<void> => {
  await incrementTranslateUsage(db, subjectsFor(input), todayUtc(), input.chars);
};
