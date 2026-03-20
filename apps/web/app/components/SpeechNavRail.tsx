import * as React from "react";
import { useLocation } from "@remix-run/react";
import { ToolNavRail, NavRailItem, IconNew, type NavUser } from "~/components/ToolNavRail";

type HistoryItem = {
  id: string;
  inputText: string;
  languageCode: string;
  createdAt: string;
};

type SpeechNavRailProps = {
  history: HistoryItem[];
  activeId: string | null;
  user: NavUser;
};

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

export function SpeechNavRail({ history, activeId, user }: SpeechNavRailProps) {
  const location = useLocation();
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setOpenMenuId(null);
  }, [location.pathname, location.search]);

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
    { icon: <IconNew />, label: "New Task", to: "/speech" },
  ];

  return (
    <ToolNavRail
      toolName="Speech"
      collapsedKey="speech-nav-rail-collapsed"
      pinnedActions={pinnedActions}
      settingsTo="/speech/settings"
      user={user}
    >
      {history.length === 0 ? (
        <div className="nav-rail-empty">No tasks yet</div>
      ) : (
        history.map((item) => (
          <NavRailItem
            key={item.id}
            to={`/speech?record=${item.id}`}
            isActive={activeId === item.id}
            title={item.inputText.slice(0, 60) || "Untitled"}
            meta={
              <>
                <span className="nav-rail-agent-badge">{item.languageCode}</span>
                <span>{formatDate(item.createdAt)}</span>
              </>
            }
            menuOpen={openMenuId === item.id}
            onMenuOpen={() =>
              setOpenMenuId((cur) => (cur === item.id ? null : item.id))
            }
            menuContent={
              <form
                method="post"
                action="/speech"
                onSubmit={(e) => {
                  if (!confirm("Delete this generation? This cannot be undone.")) e.preventDefault();
                }}
              >
                <input type="hidden" name="_intent" value="delete" />
                <input type="hidden" name="id" value={item.id} />
                <button type="submit" className="nav-rail-item-menu-option is-danger">
                  Delete
                </button>
              </form>
            }
          />
        ))
      )}
    </ToolNavRail>
  );
}
