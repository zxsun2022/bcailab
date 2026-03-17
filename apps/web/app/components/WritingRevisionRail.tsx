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

export function WritingRevisionRail({
  articleId,
  revisions,
  activeRound,
  latestRound,
  isComposeView = false,
  disableNewRevision = false,
  assessmentPrefix
}: WritingRevisionRailProps) {
  return (
    <aside className="writing-revision-rail">
      <div className="writing-rail-header">
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
      </div>
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
    </aside>
  );
}
