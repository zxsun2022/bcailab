import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Outlet, useLoaderData } from "@remix-run/react";
import { requireUser } from "~/utils/auth.server";
import { SpeechNavRail } from "~/components/SpeechNavRail";

export const handle = {
  breadcrumb: { label: "speech", href: "/speech" },
  hideHeader: true,
  hideHeaderUserMenu: true,
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  return json({
    user: {
      name: user.name,
      email: user.email,
      avatar_url: user.avatar_url,
    },
  });
};

export default function TtsLayout() {
  const { user } = useLoaderData<typeof loader>();

  return (
    <div className="writing-shell">
      <SpeechNavRail user={user} />
      <div className="writing-main">
        <div className="speech-canvas">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
