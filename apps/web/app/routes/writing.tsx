import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Outlet, useLoaderData, useParams } from "@remix-run/react";
import { listWritingArticlesByUser } from "@bcailab/db";
import { WritingNavRail } from "~/components/WritingNavRail";
import { WritingUnavailableState } from "~/components/WritingUnavailableState";
import { requireUser } from "~/utils/auth.server";
import { getWritingAgentOrDefault } from "~/utils/writing-agents";
import { isWritingSchemaMissingError, logWritingSchemaMissing } from "~/utils/writing-schema.server";

export const handle = {
  breadcrumb: { label: "writing", href: "/writing" },
  hideHeaderUserMenu: true,
  hideHeader: true
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  try {
    const articles = await listWritingArticlesByUser(context.env.DB, user.id);

    const articleSummaries = articles.map((a) => ({
      id: a.id,
      title: a.title,
      agent_type: a.agent_type,
      agentLabel: getWritingAgentOrDefault(a.agent_type).label,
      updated_at: a.updated_at
    }));

    return json({
      articles: articleSummaries,
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
        articles: [],
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
  const { articles, user, schemaReady } = useLoaderData<typeof loader>();
  const params = useParams();
  const activeId = params.id ?? null;
  const canvasClassName = `writing-canvas${activeId ? " is-detail" : ""}`;
  const mainClassName = `writing-main${activeId ? " is-detail" : ""}`;

  if (!schemaReady) {
    return (
      <div className="writing-shell">
        <div className="writing-main">
          <WritingUnavailableState />
        </div>
      </div>
    );
  }

  return (
    <div className="writing-shell">
      <WritingNavRail articles={articles} activeId={activeId} user={user} />
      <div className={mainClassName}>
        <div className={canvasClassName}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
