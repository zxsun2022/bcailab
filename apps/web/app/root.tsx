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
  useMatches
} from "@remix-run/react";
import globalStyles from "~/styles/global.css?url";
import { AppErrorBoundary } from "~/components/AppErrorBoundary";
import { Header } from "~/components/Header";
import { getOptionalUser } from "~/utils/auth.server";

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

export const meta: MetaFunction = () => [
  { title: "bcailab" },
  { name: "description", content: "Personal tools lab" }
];

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await getOptionalUser(request, context);
  return json({ user });
};

function Document({
  children,
  bodyClassName
}: {
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head suppressHydrationWarning>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <Meta />
        <Links />
      </head>
      <body className={bodyClassName}>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const { user } = useLoaderData<typeof loader>();
  const location = useLocation();
  const matches = useMatches();
  const showFooter =
    location.pathname === "/" ||
    location.pathname === "/about" ||
    location.pathname === "/english";
  const hideHeader = matches.some((m) => (m.handle as RouteHandle)?.hideHeader);

  return (
    <Document bodyClassName={hideHeader ? "tool-body" : undefined}>
      {hideHeader ? null : <Header user={user} />}
      <main className={hideHeader ? "tool-main" : "container"}>
        <Outlet context={{ user }} />
      </main>
      {showFooter ? (
        <footer className="footer">
          <div className="container footer-inner">
            <span>© {new Date().getFullYear()} bcailab · Burnaby, British Columbia, Canada</span>
            <div className="footer-links">
              <a href="/about" className="footer-link">About</a>
              <a href="https://x.com/Zhongxing_Sun" target="_blank" rel="noopener noreferrer" className="footer-link">X</a>
            </div>
          </div>
        </footer>
      ) : null}
    </Document>
  );
}

/**
 * Root-level errors lose the loader data the app shell depends on, so this renders
 * the document itself rather than reusing `App`.
 */
export function ErrorBoundary() {
  return (
    <Document>
      {/* No loader data here, so the header renders signed-out. It is still worth
          keeping: an error page without the site chrome reads as a dead end. */}
      <Header user={null} />
      <main className="container">
        <AppErrorBoundary />
      </main>
    </Document>
  );
}
