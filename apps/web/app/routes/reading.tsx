import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Outlet, useLoaderData, useLocation, useParams } from "@remix-run/react";
import { listLibraryPassages, listPassagesByUser } from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { ReadingNavRail } from "~/components/ReadingNavRail";

export const handle = {
  breadcrumb: { label: "reading", href: "/reading" },
  hideHeader: true,
  hideHeaderUserMenu: true,
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  // Two sources, one table: the learner's own passages and the graded global library.
  // The library is signed-in only (design §13.1), which requireUser above enforces.
  const [passages, library] = await Promise.all([
    listPassagesByUser(context.env.DB, user.id),
    listLibraryPassages(context.env.DB)
  ]);
  return json({
    passages: passages.map((p) => ({
      id: p.id,
      title: p.title,
      content_text: p.content_text,
    })),
    library: library.map((p) => ({
      id: p.id,
      title: p.title,
      band: p.band,
      topic: p.topic,
    })),
    user: {
      name: user.name,
      email: user.email,
      avatar_url: user.avatar_url,
    },
  });
};

export default function EslReadingLayout() {
  const { passages, library, user } = useLoaderData<typeof loader>();
  const params = useParams();
  const location = useLocation();
  const activeId = params.id ?? null;
  const isWorkspaceRoute = location.pathname === "/reading" || activeId !== null;
  const mainClassName = `writing-main${isWorkspaceRoute ? " is-workspace" : ""}`;
  const canvasClassName = `reading-canvas${isWorkspaceRoute ? " is-workspace" : ""}${activeId ? " is-detail" : ""}`;

  return (
    <div className="writing-shell">
      <ReadingNavRail passages={passages} library={library} activeId={activeId} user={user} />
      <div className={mainClassName}>
        <div className={canvasClassName}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
