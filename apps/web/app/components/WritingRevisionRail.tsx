import * as React from "react";
import { Link } from "@remix-run/react";
import { LocalDateTime } from "~/components/LocalDateTime";
import { formatWritingAssessment } from "~/utils/writing-agents";

export type RevisionEntry = {
  id: string;
  round_number: number;
  word_count: number;
  feedback_status: "pending" | "completed" | "failed";
  band_estimate: string | null;
  created_at: string;
};

type WritingRevisionRailProps = {
  articleId: string;
  revisions: RevisionEntry[];
  activeRound: number | null;
  latestRound: number;
  isComposeView?: boolean;
  disableNewRevision?: boolean;
  assessmentPrefix?: string | null;
};

const COLLAPSED_KEY = "writing-revision-rail-collapsed";

function IconNewSmall() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="16" height="16">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CollapseToggle({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="writing-rail-collapse-btn"
      aria-label={collapsed ? "Expand panel" : "Collapse panel"}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="16" height="16">
        {collapsed ? (
          /* Collapsed: chevron-left to indicate "expand from right" */
          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          /* Expanded: chevron-right to indicate "collapse to right" */
          <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </button>
  );
}

export function WritingRevisionRail({
  articleId,
  revisions,
  activeRound,
  latestRound,
  isComposeView = false,
  disableNewRevision = false,
  assessmentPrefix
}: WritingRevisionRailProps) {
  const [collapsed, setCollapsed] = React.useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === "true"; } catch { return false; }
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(COLLAPSED_KEY, String(next)); } catch {}
      return next;
    });
  };

  return (
    <aside className={`writing-revision-rail${collapsed ? " is-collapsed" : ""}`}>
      <div className="writing-rail-toolbar">
        <CollapseToggle collapsed={collapsed} onClick={toggleCollapsed} />
        {collapsed ? (
          /* Collapsed: icon-only New Revision button */
          <Link
            to={disableNewRevision ? "#" : `/writing/${articleId}?compose=1`}
            className={`writing-rail-icon-btn${disableNewRevision ? " is-disabled" : ""}`}
            aria-label="New Revision"
            aria-disabled={disableNewRevision}
            title="New Revision"
            onClick={(event) => {
              if (disableNewRevision) event.preventDefault();
            }}
          >
            <IconNewSmall />
          </Link>
        ) : (
          <Link
            to={disableNewRevision ? "#" : `/writing/${articleId}?compose=1`}
            className={`btn btn-ghost btn-sm ${disableNewRevision ? "is-disabled" : ""}`}
            aria-disabled={disableNewRevision}
            onClick={(event) => {
              if (disableNewRevision) event.preventDefault();
            }}
          >
            New Revision
          </Link>
        )}
      </div>
      {!collapsed ? (
        <>
          <div className="writing-rail-header">
            <h3 className="writing-rail-title">Revisions</h3>
            <span className="writing-rail-count">{revisions.length}</span>
          </div>
          <nav className="writing-rail-list">
            {revisions.length === 0 ? (
              <div className="writing-rail-empty">No revisions yet</div>
            ) : (
              revisions.map((rev) => {
                const isActive = !isComposeView && activeRound === rev.round_number;
                const isLatest = rev.round_number === latestRound;
                return (
                  <Link
                    key={rev.id}
                    to={
                      isLatest
                        ? `/writing/${articleId}`
                        : `/writing/${articleId}?round=${rev.round_number}`
                    }
                    className={`writing-rail-item ${isActive ? "is-active" : ""}`}
                  >
                    <div className="writing-rail-item-head">
                      <span className="writing-rail-round">Round {rev.round_number}</span>
                      {rev.feedback_status === "pending" ? (
                        <span className="writing-rail-badge is-pending">Analyzing</span>
                      ) : rev.feedback_status === "failed" ? (
                        <span className="writing-rail-badge is-failed">Failed</span>
                      ) : rev.band_estimate ? (
                        <span className="writing-rail-badge is-score">
                          {formatWritingAssessment(rev.band_estimate, assessmentPrefix)}
                        </span>
                      ) : null}
                    </div>
                    <div className="writing-rail-item-meta">
                      <span>{rev.word_count}w</span>
                      <LocalDateTime value={rev.created_at} />
                    </div>
                  </Link>
                );
              })
            )}
          </nav>
        </>
      ) : null}
    </aside>
  );
}
