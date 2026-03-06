import { Link } from "@remix-run/react";
import { formatDuration } from "~/utils/esl-reading";

type HistoryAttempt = {
  id: string;
  mode: string;
  createdAt: string;
  durationMs: number | null;
  score: number | null;
  evaluationStatus: "pending" | "completed" | "failed";
};

type EslReadingHistoryRailProps = {
  passageId?: string | null;
  attempts: HistoryAttempt[];
  selectedAttemptId?: string | null;
  isComposeView?: boolean;
  disableNewAttempt?: boolean;
};

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

const getHistoryScoreLabel = (attempt: HistoryAttempt) => {
  if (attempt.evaluationStatus === "pending") return "AI…";
  if (attempt.evaluationStatus === "failed") return "ERR";
  return attempt.score ?? "–";
};

export function EslReadingHistoryRail(props: EslReadingHistoryRailProps) {
  const { passageId, attempts, selectedAttemptId, isComposeView = false, disableNewAttempt = false } = props;

  return (
    <aside className="esl-history-rail">
      <div className="esl-history-rail-header">
        {passageId ? (
          <Link
            to={disableNewAttempt ? "#" : `/esl/reading/${passageId}?compose=1`}
            className={`btn btn-primary btn-sm esl-history-new ${disableNewAttempt ? "is-disabled" : ""}`}
            aria-disabled={disableNewAttempt}
            onClick={(event) => {
              if (disableNewAttempt) event.preventDefault();
            }}
          >
            New Attempt
          </Link>
        ) : (
          <button type="button" className="btn btn-primary btn-sm esl-history-new is-disabled" disabled>
            New Attempt
          </button>
        )}
      </div>

      <div className="esl-eval-subtitle">History ({attempts.length})</div>

      {attempts.length === 0 ? (
        <div className="esl-history-empty">No attempts yet</div>
      ) : (
        <div className="esl-history-list">
          {attempts.map((attempt) => (
            <Link
              key={attempt.id}
              to={`/esl/reading/${passageId}?attempt=${attempt.id}`}
              className={`esl-history-item ${
                !isComposeView && selectedAttemptId === attempt.id ? "is-active" : ""
              }`}
            >
              <span className="esl-history-score">{getHistoryScoreLabel(attempt)}</span>
              <span className="esl-history-mode">
                {attempt.evaluationStatus === "pending"
                  ? "Pending"
                  : attempt.evaluationStatus === "failed"
                    ? "Failed"
                    : attempt.mode === "recitation"
                      ? "Rec"
                      : "Read"}
              </span>
              <span className="esl-history-date">{formatDateTime(attempt.createdAt)}</span>
              {attempt.durationMs ? (
                <span className="esl-history-dur">{formatDuration(attempt.durationMs)}</span>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </aside>
  );
}
