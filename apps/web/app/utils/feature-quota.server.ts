import { getFeatureUsage, incrementFeatureUsage, type Db } from "@bcailab/db";
import {
  ensureAnonId,
  getClientIp,
  readAnonId,
  subjectsFor,
  todayUtc
} from "~/utils/translate-quota.server";

/**
 * Generic per-feature daily quotas, backed by the `feature_usage` table.
 *
 * This generalizes the translate-quota pattern: same subject scheme (`user:` /
 * `anon:` / `ip:`), same anonymous-identity primitives, but keyed by feature so a
 * new gated feature only needs an entry in `FEATURE_QUOTAS`. `translate_usage`
 * stays on its own table (consolidating it is a Later engineering item).
 *
 * A `null` limit means "not capped for this tier".
 */

export type FeatureName = "dictation" | "reading_trial" | "writing_trial";

export const FEATURE_QUOTAS: Record<
  FeatureName,
  { anonymous: number; signedIn: number | null }
> = {
  // Dictation audio is pre-generated, so a session costs ~nothing at runtime (LLM
  // feedback is signed-in only). Generous caps that only bound scripted abuse.
  // Numbers set by owner 2026-07-20 (design §9 originally said 1 / 30).
  dictation: { anonymous: 30, signedIn: 100 },
  // Appendix A trials: anonymous only — signed-in users use the real tools. 5/day so
  // a mis-click doesn't burn the whole trial (owner, 2026-07-20; originally 1).
  reading_trial: { anonymous: 5, signedIn: null },
  writing_trial: { anonymous: 5, signedIn: null }
};

export type QuotaSubject = {
  userId: string | null;
  anonId: string;
  ip: string;
};

export type FeatureQuotaStatus = {
  feature: FeatureName;
  tier: "anonymous" | "free";
  dailyLimit: number | null;
  usedToday: number;
  /** `null` when the tier is uncapped. */
  remainingToday: number | null;
  allowed: boolean;
};

/**
 * Resolves the quota identity for a request, minting an anonymous cookie if needed.
 * Callers must attach `setCookie` (when non-null) to their response headers,
 * otherwise anonymous users get a fresh identity — and a fresh quota — every request.
 */
export const resolveQuotaSubject = (
  request: Request,
  userId: string | null
): QuotaSubject & { setCookie: string | null } => {
  const ip = getClientIp(request);
  if (userId) {
    return { userId, anonId: readAnonId(request) ?? "", ip, setCookie: null };
  }
  const { anonId, setCookie } = ensureAnonId(request);
  return { userId: null, anonId, ip, setCookie };
};

export const getFeatureQuotaStatus = async (
  db: Db,
  feature: FeatureName,
  subject: QuotaSubject
): Promise<FeatureQuotaStatus> => {
  const tier = subject.userId ? "free" : "anonymous";
  const dailyLimit = subject.userId
    ? FEATURE_QUOTAS[feature].signedIn
    : FEATURE_QUOTAS[feature].anonymous;
  const usage = await getFeatureUsage(db, feature, subjectsFor(subject), todayUtc());
  // Take the max across subjects: an anonymous user counts against both their cookie
  // and their IP, and the stricter of the two is the effective usage.
  const usedToday = usage.reduce((max, row) => Math.max(max, row.requests), 0);
  return {
    feature,
    tier,
    dailyLimit,
    usedToday,
    remainingToday: dailyLimit === null ? null : Math.max(0, dailyLimit - usedToday),
    allowed: dailyLimit === null || usedToday < dailyLimit
  };
};

/**
 * Counts one use of `feature`. `units` is a feature-defined magnitude (characters,
 * sentences, …) recorded alongside the request count; features that only need
 * request counting can leave it at 0.
 */
export const recordFeatureUsage = async (
  db: Db,
  feature: FeatureName,
  subject: QuotaSubject & { units?: number }
): Promise<void> => {
  await incrementFeatureUsage(
    db,
    feature,
    subjectsFor(subject),
    todayUtc(),
    subject.units ?? 0
  );
};
