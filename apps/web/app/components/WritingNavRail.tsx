import * as React from "react";
import { Link, useLocation } from "@remix-run/react";
import { ToolNavRail, NavRailItem, IconNew, IconProgress, type NavUser } from "~/components/ToolNavRail";

type ArticleSummary = {
  id: string;
  title: string | null;
  agentLabel: string;
  updated_at: string;
};

type WritingNavRailProps = {
  articles: ArticleSummary[];
  activeId: string | null;
  user: NavUser;
};

export function WritingNavRail({ articles, activeId, user }: WritingNavRailProps) {
  const location = useLocation();
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setOpenMenuId(null);
  }, [location.pathname]);

  React.useEffect(() => {
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".nav-rail-item-actions")) return;
      setOpenMenuId(null);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const pinnedActions = [
    { icon: <IconNew />, label: "New Article", to: "/writing" },
    { icon: <IconProgress />, label: "Progress", to: "/writing/progress" },
  ];

  return (
    <ToolNavRail
      toolName="Writing"
      collapsedKey="writing-nav-rail-collapsed"
      pinnedActions={pinnedActions}
      settingsTo="/writing/settings"
      user={user}
    >
      {articles.length === 0 ? (
        <div className="nav-rail-empty">No articles yet</div>
      ) : (
        articles.map((article) => (
          <NavRailItem
            key={article.id}
            to={`/writing/${article.id}`}
            isActive={activeId === article.id}
            title={article.title || "Untitled"}
            menuOpen={openMenuId === article.id}
            onMenuOpen={() =>
              setOpenMenuId((cur) => (cur === article.id ? null : article.id))
            }
            menuContent={
              <form
                method="post"
                action={`/writing/${article.id}`}
                onSubmit={(e) => {
                  if (!confirm("Delete this article and all its revisions?")) e.preventDefault();
                }}
              >
                <input type="hidden" name="_intent" value="deleteArticle" />
                <button type="submit" className="nav-rail-item-menu-option is-danger">
                  Delete article
                </button>
              </form>
            }
          />
        ))
      )}
    </ToolNavRail>
  );
}
