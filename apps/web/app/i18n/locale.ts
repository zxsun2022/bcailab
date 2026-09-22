/**
 * Interface locale negotiation. Pure: no request objects, no DOM, no clock.
 *
 * One URL renders in either language (ADR 0011), so the locale is the only thing that decides
 * which copy a visitor reads. Its failure is invisible — a wrong answer is a perfectly valid
 * page in the wrong language — which is why this lives apart from any framework code and is
 * unit-tested on its own. Design: `docs/chinese-ui-design.md` §3.1–§3.2.
 */

export const LOCALES = ["en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "bcailab_locale";

/** One year: a language choice is a standing preference, not a session. */
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** The language each locale is called in itself — what a switcher offers. */
export const LOCALE_AUTONYMS: Record<Locale, string> = {
  en: "English",
  zh: "中文"
};

export const isLocale = (value: unknown): value is Locale =>
  value === "en" || value === "zh";

export const parseLocale = (value: unknown): Locale => (isLocale(value) ? value : DEFAULT_LOCALE);

/**
 * The `Intl` locale for dates and numbers. The English interface keeps the browser's own
 * conventions (unchanged from before there was a Chinese interface); the Chinese interface
 * formats as Chinese, whatever the browser says.
 */
export const intlLocale = (locale: Locale): string | undefined =>
  locale === "zh" ? "zh-CN" : undefined;

/** The other locale. With two locales a switcher always offers exactly one. */
export const otherLocale = (locale: Locale): Locale => (locale === "zh" ? "en" : "zh");

/**
 * Maps one BCP 47 tag to a supported locale, or null.
 *
 * Every Chinese variant resolves to `zh`, including Traditional (`zh-TW`, `zh-HK`, `zh-Hant`):
 * only Simplified copy exists (design D4), and Simplified is closer to a Traditional reader
 * than English is.
 */
const localeForTag = (tag: string): Locale | null => {
  const primary = tag.trim().toLowerCase().split("-")[0];
  if (primary === "zh") return "zh";
  if (primary === "en") return "en";
  return null;
};

/**
 * The supported locale an `Accept-Language` header prefers most, or null when it names
 * neither. Weights decide; ties keep header order. Malformed entries are skipped rather than
 * thrown on — a bad header must never fail a page.
 */
export const negotiateAcceptLanguage = (header: string | null | undefined): Locale | null => {
  if (!header) return null;

  const candidates: Array<{ locale: Locale; weight: number; order: number }> = [];
  header.split(",").forEach((entry, order) => {
    const [rawTag, ...params] = entry.split(";");
    const locale = rawTag ? localeForTag(rawTag) : null;
    if (!locale) return;

    let weight = 1;
    for (const param of params) {
      const [name, value] = param.split("=").map((part) => part.trim());
      if (name !== "q") continue;
      const parsed = Number(value);
      weight = Number.isFinite(parsed) ? parsed : 0;
    }
    // q=0 means "not acceptable" (RFC 9110 §12.4.2), not "least preferred".
    if (weight <= 0 || weight > 1) return;
    candidates.push({ locale, weight, order });
  });

  candidates.sort((a, b) => b.weight - a.weight || a.order - b.order);
  return candidates[0]?.locale ?? null;
};

/** Reads one cookie's value from a `Cookie` header. */
export const readCookie = (header: string | null | undefined, name: string): string | null => {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const raw = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
};

/**
 * The locale a request renders in. Precedence is fixed: an explicit choice (the cookie)
 * outranks the browser's header, which outranks the default. An invalid cookie is ignored
 * rather than trusted, so a stale or hand-edited value falls through to negotiation.
 */
export const resolveLocale = (input: {
  cookie: string | null | undefined;
  acceptLanguage: string | null | undefined;
}): Locale => {
  if (isLocale(input.cookie)) return input.cookie;
  return negotiateAcceptLanguage(input.acceptLanguage) ?? DEFAULT_LOCALE;
};

/** Hosts where a `Secure` cookie would never be sent back — mirrors the session cookie. */
const isInsecureHost = (hostname: string): boolean =>
  hostname === "localhost" ||
  hostname.endsWith(".localhost") ||
  /^\d+\.\d+\.\d+\.\d+$/.test(hostname);

/**
 * The `Set-Cookie` value for an explicit choice. Host-only (no `Domain`), like the session
 * cookie, so it never reaches Mapdown's host. `HttpOnly` because only the server reads it.
 */
export const serializeLocaleCookie = (locale: Locale, hostname: string): string =>
  [
    `${LOCALE_COOKIE}=${locale}`,
    "Path=/",
    `Max-Age=${LOCALE_COOKIE_MAX_AGE}`,
    "SameSite=Lax",
    "HttpOnly",
    ...(isInsecureHost(hostname) ? [] : ["Secure"])
  ].join("; ");

/**
 * Where the switcher may send a visitor back to. Only a same-site path is accepted;
 * anything that could leave the site — `//evil.example`, `/\evil.example`, an absolute URL —
 * becomes `/`, so the switcher cannot be used as an open redirect.
 */
export const safeReturnPath = (raw: unknown): string => {
  if (typeof raw !== "string") return "/";
  const path = raw.trim();
  if (!path.startsWith("/")) return "/";
  if (path.startsWith("//") || path.includes("\\")) return "/";
  // Control characters have no place in a path and are how header-splitting starts.
  for (let index = 0; index < path.length; index += 1) {
    const code = path.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return "/";
  }
  return path;
};
