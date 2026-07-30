import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Outlet, useLoaderData, useLocation } from "@remix-run/react";
import { getOptionalUser } from "~/utils/auth.server";
import { DictationNavRail } from "~/components/DictationNavRail";
import { StudioShell } from "~/components/StudioShell";

export const handle = {
  breadcrumb: { label: "dictation", href: "/dictation" },
  hideHeader: true,
  hideHeaderUserMenu: true
};

/**
 * Dictation tool shell. Unlike Speech/Writing this layout is **public** — the tool is
 * anonymous-friendly (same acquisition role as Translate), so it uses
 * `getOptionalUser` and the shared rail renders a sign-in prompt for anonymous visitors.
 */
export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await getOptionalUser(request, context);

  return json({
    user: user
      ? { name: user.name, email: user.email, avatar_url: user.avatar_url }
      : null
  });
};

export default function DictationLayout() {
  const { user } = useLoaderData<typeof loader>();
  const location = useLocation();
  const isLibrary = location.pathname === "/dictation";

  return (
    <StudioShell
      navigation={<DictationNavRail user={user} />}
      canvasClassName={`dictation-canvas${isLibrary ? "" : " is-session"}`}
    >
      <Outlet />
    </StudioShell>
  );
}
