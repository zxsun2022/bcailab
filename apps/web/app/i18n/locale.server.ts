import { LOCALE_COOKIE, readCookie, resolveLocale, type Locale } from "./locale";
import { createTranslator, type Translate } from "./translate";

/** The locale this request renders in: explicit cookie, then `Accept-Language`, then `en`. */
export const getRequestLocale = (request: Request): Locale =>
  resolveLocale({
    cookie: readCookie(request.headers.get("Cookie"), LOCALE_COOKIE),
    acceptLanguage: request.headers.get("Accept-Language")
  });

/** For loaders and actions that return learner-facing text, such as validation errors. */
export const getRequestTranslator = (request: Request): Translate =>
  createTranslator(getRequestLocale(request));

/**
 * One URL serves two languages, so any cache between the server and the visitor must key on
 * what decides the language (design §3.5).
 */
export const LOCALE_VARY = "Cookie, Accept-Language";
