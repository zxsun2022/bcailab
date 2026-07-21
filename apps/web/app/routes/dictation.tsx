import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Outlet, useLoaderData, useLocation } from "@remix-run/react";
import { listDictationAttemptsByUser, listLibraryPassages } from "@bcailab/db";
import { getOptionalUser } from "~/utils/auth.server";
import { DictationNavRail } from "~/components/DictationNavRail";

export const handle = {
  breadcrumb: { label: "dictation", href: "/dictation" },
  hideHeader: true,
  hideHeaderUserMenu: true
};

/**
 * Dictation tool shell. Unlike Speech/Writing this layout is **public** — the tool is
 * anonymous-friendly (same acquisition role as Translate), so it uses
 * `getOptionalUser` and the rail renders a sign-in prompt for anonymous visitors.
 * Attempt history only exists for signed-in users.
 */
export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await getOptionalUser(request, context);

  const [passages, attempts] = await Promise.all([
    listLibraryPassages(context.env.DB, { requireSentenceAudio: true }),
    user ? listDictationAttemptsByUser(context.env.DB, { userId: user.id, limit: 30 }) : []
  ]);

  const titleById = new Map(passages.map((passage) => [passage.id, passage]));

  return json({
    user: user
      ? { name: user.name, email: user.email, avatar_url: user.avatar_url }
      : null,
    history: attempts.map((attempt) => ({
      id: attempt.id,
      passageId: attempt.passage_id,
      title: titleById.get(attempt.passage_id)?.title ?? "Passage",
      band: titleById.get(attempt.passage_id)?.band ?? "",
      accuracy: attempt.accuracy,
      createdAt: attempt.created_at
    }))
  });
};

export default function DictationLayout() {
  const { user, history } = useLoaderData<typeof loader>();
  const location = useLocation();
  const isLibrary = location.pathname === "/dictation";

  return (
    <div className="writing-shell">
      <DictationNavRail history={history} user={user} isLibrary={isLibrary} />
      <div className="writing-main">
        <div className="dictation-canvas">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
