import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Outlet, useLoaderData, useParams } from "@remix-run/react";
import { listWritingArticlesByUser } from "@bcailab/db";
import { WritingNavRail } from "~/components/WritingNavRail";
import { WritingUnavailableState } from "~/components/WritingUnavailableState";
import { requireUser } from "~/utils/auth.server";
import { isWritingSchemaMissingError, logWritingSchemaMissing } from "~/utils/writing-schema.server";
import { StudioShell } from "~/components/StudioShell";

export const handle = {
  breadcrumb: { label: "writing", href: "/writing" },
  hideHeaderUserMenu: true,
  hideHeader: true
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  try {
    await listWritingArticlesByUser(context.env.DB, user.id);

    return json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar_url: user.avatar_url
      },
      schemaReady: true as const
    });
  } catch (error) {
    if (!isWritingSchemaMissingError(error)) throw error;
    logWritingSchemaMissing("writing.loader", error);
    return json(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar_url: user.avatar_url
        },
        schemaReady: false as const
      },
      { status: 503 }
    );
  }
};

export default function WritingLayout() {
  const { user, schemaReady } = useLoaderData<typeof loader>();
  const params = useParams();
  const activeId = params.id ?? null;
  const canvasClassName = `writing-canvas${activeId ? " is-detail" : ""}`;

  if (!schemaReady) {
    return (
      <StudioShell user={user}>
        <WritingUnavailableState />
      </StudioShell>
    );
  }

  return (
    <StudioShell
      navigation={<WritingNavRail user={user} />}
      mainClassName={activeId ? "is-detail" : undefined}
      canvasClassName={canvasClassName}
    >
      <Outlet />
    </StudioShell>
  );
}
