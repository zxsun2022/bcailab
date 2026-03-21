import * as React from "react";
import { Link } from "@remix-run/react";
import { formatWritingAssessment } from "~/utils/writing-agents";

export type AsideRound = {
  id: string;
  round_number: number;
  feedback_status: "pending" | "completed" | "failed";
  band_estimate: string | null;
};

type WritingDetailAsideProps = {
  articleId: string;
  rounds: AsideRound[];
  activeRound: number | null;
  latestRound: number;
  isComposeView: boolean;
  disableNewRevision: boolean;
  collapsed: boolean;
  onToggle: () => void;
  assessmentPrefix?: string | null;
  children?: React.ReactNode;
};

export function WritingDetailAside({
  articleId,
  rounds,
  activeRound,
  latestRound,
  isComposeView,
  disableNewRevision,
  collapsed,
  onToggle,
  assessmentPrefix,
  children,
}: WritingDetailAsideProps) {
  const sortedRounds = [...rounds].sort((a, b) => b.round_number - a.round_number);
  const latestEntry = rounds.find((round) => round.round_number === latestRound) ?? null;
  const newRevisionHref = disableNewRevision ? "#" : `/writing/${articleId}?compose=1`;
  const isNewRevisionActive = isComposeView;

  return (
    <aside className={`writing-detail-aside${collapsed ? " is-collapsed" : ""}`}>
      <div className="writing-aside-toolbar">
        <button
          type="button"
          className="writing-aside-toggle-btn"
          aria-label={collapsed ? "Expand feedback panel" : "Collapse feedback panel"}
          onClick={onToggle}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="16" height="16">
            {collapsed ? (
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        </button>
        {collapsed ? (
          <Link
            to={newRevisionHref}
            className={`writing-aside-icon-btn${disableNewRevision ? " is-disabled" : ""}${isNewRevisionActive ? " is-active" : ""}`}
            aria-label="New Revision"
            onClick={(e) => { if (disableNewRevision) e.preventDefault(); }}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="16" height="16">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </Link>
        ) : null}
      </div>

      <div
        className={`writing-aside-content${collapsed ? " is-hidden" : ""}`}
        aria-hidden={collapsed}
      >
        <div className="writing-aside-rounds">
          <Link
            to={newRevisionHref}
            className={`writing-aside-new-btn${disableNewRevision ? " is-disabled" : ""}${isNewRevisionActive ? " is-active" : ""}`}
            aria-disabled={disableNewRevision}
            onClick={(e) => { if (disableNewRevision) e.preventDefault(); }}
          >
            New Revision
          </Link>
          {sortedRounds.map((round) => {
            const isActive = !isComposeView && activeRound === round.round_number;
            const isLatest = round.round_number === latestRound;
            const scoreText = round.band_estimate
              ? formatWritingAssessment(round.band_estimate, assessmentPrefix)
              : null;
            const statusLabel = isLatest ? "Latest" : `Round ${round.round_number}`;
            return (
              <Link
                key={round.id}
                to={isLatest ? `/writing/${articleId}` : `/writing/${articleId}?round=${round.round_number}`}
                className={`writing-aside-pill${isActive ? " is-active" : ""}${round.feedback_status === "pending" ? " is-pending" : ""}${round.feedback_status === "failed" ? " is-failed" : ""}`}
                title={`${statusLabel}${scoreText ? ` — ${scoreText}` : ""}`}
              >
                {round.round_number}
              </Link>
            );
          })}
        </div>

        {latestEntry?.feedback_status === "pending" ? (
          <div className="writing-aside-note">Finish the latest round analysis before starting a new revision.</div>
        ) : null}

        <div className="writing-aside-body">
          {children}
        </div>
      </div>
    </aside>
  );
}
