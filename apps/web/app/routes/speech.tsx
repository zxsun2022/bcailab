import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Outlet, useLoaderData, useSearchParams } from "@remix-run/react";
import { listTtsGenerationsByUser } from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { SpeechNavRail } from "~/components/SpeechNavRail";

export const handle = {
  breadcrumb: { label: "speech", href: "/speech" },
  hideHeader: true,
  hideHeaderUserMenu: true,
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const generations = await listTtsGenerationsByUser(context.env.DB, user.id);
  const history = generations.map((g) => ({
    id: g.id,
    inputText: g.input_text,
    languageCode: g.language_code,
    createdAt: g.created_at,
  }));
  return json({
    history,
    user: {
      name: user.name,
      email: user.email,
      avatar_url: user.avatar_url,
    },
  });
};

export default function TtsLayout() {
  const { history, user } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const activeId = searchParams.get("record");

  return (
    <div className="writing-shell">
      <SpeechNavRail history={history} activeId={activeId} user={user} />
      <div className="writing-main">
        <Outlet />
      </div>
    </div>
  );
}
