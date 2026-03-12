import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, Outlet, useLoaderData, useParams } from "@remix-run/react";
import * as React from "react";
import { listWritingArticlesByUser } from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { getWritingAgentOrDefault } from "~/utils/writing-agents";
import type { WritingFeedback } from "~/utils/writing-eval.server";

export const handle = {
  breadcrumb: { label: "writing", href: "/writing" }
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const articles = await listWritingArticlesByUser(context.env.DB, user.id);

  const articleSummaries = articles.map((a) => ({
    id: a.id,
    title: a.title,
    agent_type: a.agent_type,
    agentLabel: getWritingAgentOrDefault(a.agent_type).label,
    updated_at: a.updated_at
  }));

  return json({ articles: articleSummaries });
};

export default function WritingLayout() {
  const { articles } = useLoaderData<typeof loader>();
  const params = useParams();
  const activeId = params.id ?? null;
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  React.useEffect(() => {
    const closeMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".writing-sidebar-item-actions")) return;
      setOpenMenuId(null);
    };
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, []);

  React.useEffect(() => {
    setSidebarOpen(false);
  }, [activeId]);

  return (
    <div className="writing-shell">
      <button
        type="button"
        className="writing-sidebar-toggle"
        aria-label="Toggle article list"
        onClick={() => setSidebarOpen((o) => !o)}
      >
        <span /><span /><span />
      </button>

      <aside className={`writing-sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="writing-sidebar-header">
          <Link to="/writing" className="btn btn-primary btn-sm writing-sidebar-new">
            + New article
          </Link>
        </div>
        <nav className="writing-sidebar-list">
          {articles.length === 0 ? (
            <div className="writing-sidebar-empty">No articles yet</div>
          ) : (
            articles.map((article) => (
              <div
                key={article.id}
                className={`writing-sidebar-item-shell ${activeId === article.id ? "is-active" : ""} ${
                  openMenuId === article.id ? "is-menu-open" : ""
                }`}
              >
                <Link
                  to={`/writing/${article.id}`}
                  className={`writing-sidebar-item ${activeId === article.id ? "is-active" : ""}`}
                  onClick={() => setOpenMenuId(null)}
                >
                  <div className="writing-sidebar-item-title">
                    {article.title || "Untitled"}
                  </div>
                  <div className="writing-sidebar-item-meta">
                    <span className="writing-sidebar-agent-badge">{article.agentLabel}</span>
                  </div>
                </Link>

                <div
                  className={`writing-sidebar-item-actions ${
                    openMenuId === article.id ? "is-open" : ""
                  }`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    className="writing-sidebar-item-menu-btn"
                    aria-label="Open article menu"
                    aria-expanded={openMenuId === article.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenMenuId((current) => (current === article.id ? null : article.id));
                    }}
                  >
                    <span /><span /><span />
                  </button>

                  {openMenuId === article.id ? (
                    <div className="writing-sidebar-item-menu">
                      <form
                        method="post"
                        action={`/writing/${article.id}`}
                        onSubmit={(event) => {
                          if (!confirm("Delete this article and all its revisions?")) {
                            event.preventDefault();
                          }
                        }}
                      >
                        <input type="hidden" name="_intent" value="deleteArticle" />
                        <button type="submit" className="writing-sidebar-item-menu-option is-danger">
                          Delete article
                        </button>
                      </form>
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </nav>
      </aside>

      <div className="writing-main">
        <Outlet />
      </div>
    </div>
  );
}
