import type { ReactNode } from "react";
import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useLocation,
  useMatches,
  useRouteLoaderData
} from "@remix-run/react";
import globalStyles from "~/styles/global.css?url";
import { AppErrorBoundary } from "~/components/AppErrorBoundary";
import { Header } from "~/components/Header";
import { getOptionalUser } from "~/utils/auth.server";
import { LocaleProvider, useT } from "~/i18n/context";
import { DEFAULT_LOCALE, type Locale } from "~/i18n/locale";
import { getRequestLocale, LOCALE_VARY } from "~/i18n/locale.server";
import { createTranslator } from "~/i18n/translate";

type RouteHandle = { hideHeader?: boolean };

const themeInitScript = `
(() => {
  try {
    const storageKey = "bcailab-theme-preference";
    const stored = localStorage.getItem(storageKey);
    const preference =
      stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    const resolved =
      preference === "system"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : preference;
    const root = document.documentElement;
    root.dataset.themePreference = preference;
    root.dataset.resolvedTheme = resolved;
  } catch {}
})();
`;

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: globalStyles },
  { rel: "icon", href: "/favicon.ico" },
  { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
  { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
  { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
  { rel: "manifest", href: "/site.webmanifest" }
];

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: "bcailab" },
  {
    name: "description",
    content: createTranslator(data?.locale ?? DEFAULT_LOCALE)("meta.root.description")
  }
];

/**
 * The locale is resolved once here, from the explicit cookie and then `Accept-Language`
 * (ADR 0011), and flows down through `LocaleProvider` and, for `meta`, through the matches.
 * The response varies on both inputs because the same URL renders in either language.
 */
export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await getOptionalUser(request, context);
  const locale = getRequestLocale(request);
  return json({ user, locale }, { headers: { Vary: LOCALE_VARY } });
};

function Document({
  children,
  bodyClassName,
  locale
}: {
  children: ReactNode;
  bodyClassName?: string;
  locale: Locale;
}) {
  return (
    <html lang={locale} suppressHydrationWarning>
      <head suppressHydrationWarning>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <Meta />
        <Links />
      </head>
      <body className={bodyClassName}>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const { user, locale } = useLoaderData<typeof loader>();
  const location = useLocation();
  const matches = useMatches();
  const showFooter =
    location.pathname === "/" ||
    location.pathname === "/about" ||
    location.pathname === "/english";
  const hideHeader = matches.some((m) => (m.handle as RouteHandle)?.hideHeader);

  return (
    <Document bodyClassName={hideHeader ? "tool-body" : undefined} locale={locale}>
      {hideHeader ? null : <Header user={user} />}
      <main className={hideHeader ? "tool-main" : "container"}>
        <Outlet context={{ user }} />
      </main>
      {showFooter ? <Footer /> : null}
    </Document>
  );
}

function Footer() {
  const t = useT();
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <span>{t("footer.location", { year: new Date().getFullYear() })}</span>
        <div className="footer-links">
          <a href="/about" className="footer-link">{t("footer.about")}</a>
          <a href="https://x.com/Zhongxing_Sun" target="_blank" rel="noopener noreferrer" className="footer-link">X</a>
        </div>
      </div>
    </footer>
  );
}

/**
 * Root-level errors lose the loader data the app shell depends on, so this renders
 * the document itself rather than reusing `App`. When a child threw, the root's data is
 * still there and the page keeps the visitor's language; when the root itself failed there
 * is nothing to read, and the page falls back to English.
 */
export function ErrorBoundary() {
  const rootData = useRouteLoaderData<typeof loader>("root");
  return (
    <Document locale={rootData?.locale ?? DEFAULT_LOCALE}>
      {/* No loader data here, so the header renders signed-out. It is still worth
          keeping: an error page without the site chrome reads as a dead end. */}
      <Header user={null} />
      <main className="container">
        <AppErrorBoundary />
      </main>
    </Document>
  );
}
