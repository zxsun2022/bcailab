import * as React from "react";
import { Link, useLocation } from "@remix-run/react";
import { ToolNavRail, NavRailItem, IconNew, IconProgress, type NavUser } from "~/components/ToolNavRail";

type PassageSummary = {
  id: string;
  title: string | null;
  content_text: string;
};

type LibrarySummary = {
  id: string;
  title: string;
  band: string | null;
  topic: string | null;
};

type ReadingNavRailProps = {
  passages: PassageSummary[];
  /** Graded global material. Read-only: there is no delete affordance for it. */
  library: LibrarySummary[];
  activeId: string | null;
  user: NavUser;
};

function getPassageTitle(title: string | null, contentText: string): string {
  if (title) return title;
  const firstLine = contentText.trim().split("\n")[0] ?? "";
  return firstLine.slice(0, 60) || "Untitled";
}

export function ReadingNavRail({ passages, library, activeId, user }: ReadingNavRailProps) {
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
    { icon: <IconNew />, label: "New Passage", to: "/reading" },
    { icon: <IconProgress />, label: "Progress", to: "/reading/progress" },
  ];

  return (
    <ToolNavRail
      toolName="Reading"
      collapsedKey="reading-nav-rail-collapsed"
      pinnedActions={pinnedActions}
      settingsTo="/reading/settings"
      user={user}
    >
      <div className="nav-rail-section-label">Your passages</div>
      {passages.length === 0 ? (
        <div className="nav-rail-empty">No passages yet</div>
      ) : (
        passages.map((passage) => (
          <NavRailItem
            key={passage.id}
            to={`/reading/${passage.id}`}
            isActive={activeId === passage.id}
            title={getPassageTitle(passage.title, passage.content_text)}
            menuOpen={openMenuId === passage.id}
            onMenuOpen={() =>
              setOpenMenuId((cur) => (cur === passage.id ? null : passage.id))
            }
            menuContent={
              <form
                method="post"
                action={`/reading/${passage.id}`}
                onSubmit={(e) => {
                  if (
                    !confirm(
                      "Delete this passage, its reference audio, all recordings, and all AI feedback?"
                    )
                  )
                    e.preventDefault();
                }}
              >
                <input type="hidden" name="_intent" value="deletePassage" />
                <button type="submit" className="nav-rail-item-menu-option is-danger">
                  Delete passage
                </button>
              </form>
            }
          />
        ))
      )}

      {library.length > 0 ? (
        <>
          <div className="nav-rail-section-label">Library</div>
          {library.map((passage) => (
            // Plain link, not NavRailItem: library material is global content and has
            // no per-item menu, because a learner must not be able to delete it.
            <div key={passage.id} className="nav-rail-item-shell">
              <Link
                to={`/reading/${passage.id}`}
                className={`nav-rail-item${activeId === passage.id ? " is-active" : ""}`}
              >
                <div className="nav-rail-item-title">{passage.title}</div>
                <div className="nav-rail-item-meta">
                  {[passage.band, passage.topic].filter(Boolean).join(" · ")}
                </div>
              </Link>
            </div>
          ))}
        </>
      ) : null}
    </ToolNavRail>
  );
}
