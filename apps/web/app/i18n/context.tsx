import * as React from "react";
import { DEFAULT_LOCALE, type Locale } from "./locale";
import {
  createTranslator,
  splitTemplate,
  type MessageKey,
  type Translate
} from "./translate";

type LocaleContextValue = { locale: Locale; t: Translate };

const LocaleContext = React.createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  t: createTranslator(DEFAULT_LOCALE)
});

/**
 * Provides the request's locale to everything below the document.
 *
 * Deliberately separate from the root `<Outlet context={{ user }} />`: that type is consumed
 * by many routes, and widening it would touch every one for no benefit (design §3.4).
 */
export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = React.useMemo(() => ({ locale, t: createTranslator(locale) }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export const useLocale = (): Locale => React.useContext(LocaleContext).locale;

export const useT = (): Translate => React.useContext(LocaleContext).t;

/**
 * Renders a message whose placeholders are React nodes, for copy where the element's
 * position differs by language (a name in `<strong>`, a link inside a sentence).
 */
export function RichMessage({
  id,
  values
}: {
  id: MessageKey;
  values: Record<string, React.ReactNode>;
}) {
  const t = useT();
  return (
    <>
      {splitTemplate(t(id)).map((part, index) =>
        part.kind === "text" ? (
          <React.Fragment key={index}>{part.value}</React.Fragment>
        ) : (
          <React.Fragment key={index}>{values[part.name] ?? `{${part.name}}`}</React.Fragment>
        )
      )}
    </>
  );
}
