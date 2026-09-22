import { useLocation } from "@remix-run/react";
import { useLocale, useT } from "~/i18n/context";
import { LOCALE_AUTONYMS, otherLocale } from "~/i18n/locale";

/** What the collapsed rail can fit: one mark, like a module's initial. */
const LOCALE_MARKS = { en: "EN", zh: "中" } as const;

/**
 * Offers the other interface language, named in that language ("中文" / "English"), so a
 * visitor who cannot read the current interface can still find the way out of it.
 *
 * A plain `<form>` posting to `/locale`, not a client-side toggle: it works without
 * JavaScript, and the server re-renders the whole document — `<html lang>` included — in the
 * new language (design §3.2). The hidden `returnTo` is rendered on the server, so even a
 * no-JS visitor comes back to the page they were on.
 */
export function LanguageSwitcher({ variant }: { variant: "header" | "rail" }) {
  const locale = useLocale();
  const t = useT();
  const location = useLocation();
  const target = otherLocale(locale);
  const autonym = LOCALE_AUTONYMS[target];

  return (
    <form
      method="post"
      action="/locale"
      className={variant === "rail" ? "locale-switch-form is-rail" : "locale-switch-form"}
      aria-label={t("locale.formLabel")}
    >
      <input type="hidden" name="locale" value={target} />
      <input type="hidden" name="returnTo" value={`${location.pathname}${location.search}`} />
      {variant === "rail" ? (
        <button
          type="submit"
          className="nav-rail-studio-item locale-switch-rail"
          title={t("locale.switchTo", { language: autonym })}
        >
          <span className="nav-rail-module-mark" aria-hidden="true">
            {LOCALE_MARKS[target]}
          </span>
          <span className="nav-rail-label" lang={target}>
            {autonym}
          </span>
        </button>
      ) : (
        <button
          type="submit"
          className="locale-switch"
          lang={target}
          title={t("locale.switchTo", { language: autonym })}
        >
          {autonym}
        </button>
      )}
    </form>
  );
}
