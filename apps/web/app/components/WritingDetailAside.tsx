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
  panelId: string;
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
  panelId,
  assessmentPrefix,
  children,
}: WritingDetailAsideProps) {
  const sortedRounds = [...rounds].sort((a, b) => b.round_number - a.round_number);
  const latestEntry = rounds.find((round) => round.round_number === latestRound) ?? null;
  const newRevisionHref = disableNewRevision ? "#" : `/writing/${articleId}?compose=1`;
  const isNewRevisionActive = isComposeView;

  return (
    <aside
      id={panelId}
      className={`writing-detail-aside${collapsed ? " is-collapsed" : ""}`}
    >
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
