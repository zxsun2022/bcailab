import { Link } from "@remix-run/react";
import { ToolNavRail, type NavUser } from "~/components/ToolNavRail";

type HistoryItem = {
  id: string;
  passageId: string;
  title: string;
  band: string;
  accuracy: number;
  status: string;
  sentencesDone: number;
  sentenceCount: number;
  createdAt: string;
};

type DictationNavRailProps = {
  history: HistoryItem[];
  user: NavUser | null;
};

const formatAccuracy = (accuracy: number): string => `${Math.round(accuracy * 100)}%`;

/**
 * Left rail for the dictation shell: library nav plus attempt history.
 *
 * History is signed-in only, so the rail has three states — signed out (sign-in
 * nudge), signed in with no attempts, and signed in with history. Attempts are
 * read-only records, so unlike Speech/Writing the items have no per-item menu.
 */
export function DictationNavRail({ history, user }: DictationNavRailProps) {
  // No pinned actions. Unlike Reading/Writing/Speech, dictation has nothing for the
  // learner to create — bring-your-own-text is a later roadmap item — and no progress
  // route of its own. A "Library" link here would carry the `+` create icon, duplicate
  // the Practice > Dictation entry that is already marked current, and (because this
  // rail only renders on `/dictation`) always point at the page you are on.
  return (
    <ToolNavRail
      toolName="Dictation"
      collapsedKey="dictation-nav-rail-collapsed"
      pinnedActions={[]}
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
                {/* An unfinished attempt's accuracy covers only the sentences checked so
                    far, so showing it as a score would misrepresent it. */}
                {item.status === "in_progress"
                  ? `${item.band} · ${item.sentencesDone}/${item.sentenceCount} · resume`
                  : `${item.band} · ${formatAccuracy(item.accuracy)}`}
              </div>
            </Link>
          </div>
        ))
      )}
    </ToolNavRail>
  );
}
