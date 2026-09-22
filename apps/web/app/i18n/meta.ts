import { parseLocale, type Locale } from "./locale";
import { createTranslator, type Translate } from "./translate";

type MatchLike = { id: string; data?: unknown };

/**
 * Route `meta` functions run outside React, so they cannot read the locale from context.
 * The root loader returns it; this reads it back from the matches `meta` receives.
 */
export const localeFromMatches = (matches: readonly MatchLike[]): Locale => {
  const root = matches.find((match) => match.id === "root");
  return parseLocale((root?.data as { locale?: unknown } | undefined)?.locale);
};

export const metaTranslator = (matches: readonly MatchLike[]): Translate =>
  createTranslator(localeFromMatches(matches));
