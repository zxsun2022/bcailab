import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Outlet, useLoaderData, useParams } from "@remix-run/react";
import { requireUser } from "~/utils/auth.server";
import { ReadingNavRail } from "~/components/ReadingNavRail";
import { StudioShell } from "~/components/StudioShell";

export const handle = {
  breadcrumb: { label: "reading", href: "/reading" },
  hideHeader: true,
  hideHeaderUserMenu: true,
};

/**
 * The layout no longer fetches passages: the rail is navigation only, and the catalogue
 * fetches what it renders. This removes a duplicated pair of queries — the layout and the
 * index each used to load the learner's passages *and* the whole library on every
 * `/reading` request.
 */
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

export default function EslReadingLayout() {
  const { user } = useLoaderData<typeof loader>();
  const params = useParams();
  const activeId = params.id ?? null;
  // Only a live reading session owns its own inner scroll regions. Catalogue, progress,
  // settings and creation pages use the shell's single main-content scroller.
  const isWorkspaceRoute = activeId !== null;
  const canvasClassName = `reading-canvas${isWorkspaceRoute ? " is-workspace" : ""}${activeId ? " is-detail" : ""}`;

  return (
    <StudioShell
      navigation={<ReadingNavRail user={user} />}
      mainClassName={isWorkspaceRoute ? "is-workspace" : undefined}
      canvasClassName={canvasClassName}
    >
      <Outlet />
    </StudioShell>
  );
}
