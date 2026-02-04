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
import globalStyles from "~/styles/global.css";
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
        <Meta />
        <Links />
      </head>
      <body>
        <Header user={user} />
        <main className="container">
          <Outlet />
        </main>
        <footer className="footer">
          <div className="container">bcailab · built on Cloudflare</div>
        </footer>
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}
