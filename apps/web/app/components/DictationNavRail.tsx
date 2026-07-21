import { Link } from "@remix-run/react";
import { ToolNavRail, IconNew, type NavUser } from "~/components/ToolNavRail";

type HistoryItem = {
  id: string;
  passageId: string;
  title: string;
  band: string;
  accuracy: number;
  createdAt: string;
};

type DictationNavRailProps = {
  history: HistoryItem[];
  user: NavUser | null;
  isLibrary: boolean;
};

const formatAccuracy = (accuracy: number): string => `${Math.round(accuracy * 100)}%`;

/**
 * Left rail for the dictation shell: library nav plus attempt history.
 *
 * History is signed-in only, so the rail has three states — signed out (sign-in
 * nudge), signed in with no attempts, and signed in with history. Attempts are
 * read-only records, so unlike Speech/Writing the items have no per-item menu.
 */
export function DictationNavRail({ history, user, isLibrary }: DictationNavRailProps) {
  const pinnedActions = [
    {
      icon: <IconNew />,
      label: "Library",
      to: "/dictation",
      active: isLibrary
    }
  ];

  return (
    <ToolNavRail
      toolName="Dictation"
      collapsedKey="dictation-nav-rail-collapsed"
      pinnedActions={pinnedActions}
      user={user}
    >
      {!user ? (
        <div className="nav-rail-empty">Sign in to save your attempts</div>
      ) : history.length === 0 ? (
        <div className="nav-rail-empty">No attempts yet</div>
      ) : (
        history.map((item) => (
          <div key={item.id} className="nav-rail-item-shell">
            <Link to={`/dictation/${item.passageId}`} className="nav-rail-item">
              <div className="nav-rail-item-title">{item.title}</div>
              <div className="nav-rail-item-meta">
                {item.band} · {formatAccuracy(item.accuracy)}
              </div>
            </Link>
          </div>
        ))
      )}
    </ToolNavRail>
  );
}
