import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";
import { Outlet } from "@remix-run/react";

export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const newPath = url.pathname.replace(/^\/tts/, "/speech");
  return redirect(`${newPath}${url.search}`, 301);
};

export default function TtsRedirectLayout() {
  return <Outlet />;
}
