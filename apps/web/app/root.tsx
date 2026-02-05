import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  LiveReload,
  useLoaderData
} from "@remix-run/react";
import globalStyles from "~/styles/global.css?url";
import { Header } from "~/components/Header";
import { getOptionalUser } from "~/utils/auth.server";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: globalStyles }];

export const meta: MetaFunction = () => [
  { title: "bcailab" },
  { name: "description", content: "Personal tools lab" }
];

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await getOptionalUser(request, context);
  return json({ user });
};

export default function App() {
  const { user } = useLoaderData<typeof loader>();
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <Meta />
        <Links />
      </head>
      <body>
        <Header user={user} />
        <main className="container">
          <Outlet context={{ user }} />
        </main>
        <footer className="footer">
          <div className="container footer-inner">
            <span>© {new Date().getFullYear()} bcailab · Burnaby, British Columbia, Canada</span>
            <a href="https://x.com/Zhongxing_Sun" target="_blank" rel="noopener noreferrer" className="footer-link">X</a>
          </div>
        </footer>
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}
