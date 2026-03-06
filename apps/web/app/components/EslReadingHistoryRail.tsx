import * as React from "react";
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
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const closeMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".esl-history-item-actions")) return;
      setOpenMenuId(null);
    };
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, []);

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
            <div
              key={attempt.id}
              className={`esl-history-item-shell ${
                !isComposeView && selectedAttemptId === attempt.id ? "is-active" : ""
              } ${openMenuId === attempt.id ? "is-menu-open" : ""}`}
            >
              <Link
                to={`/esl/reading/${passageId}?attempt=${attempt.id}`}
                className={`esl-history-item ${
                  !isComposeView && selectedAttemptId === attempt.id ? "is-active" : ""
                }`}
                onClick={() => setOpenMenuId(null)}
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

              <div
                className={`esl-history-item-actions ${openMenuId === attempt.id ? "is-open" : ""}`}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="esl-history-item-menu-btn"
                  aria-label="Open attempt menu"
                  aria-expanded={openMenuId === attempt.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpenMenuId((current) => (current === attempt.id ? null : attempt.id));
                  }}
                >
                  <span />
                  <span />
                  <span />
                </button>

                {openMenuId === attempt.id && passageId ? (
                  <div className="esl-history-item-menu">
                    <form
                      method="post"
                      action={`/esl/reading/${passageId}`}
                      onSubmit={(event) => {
                        if (!confirm("Delete this attempt and its AI feedback?")) {
                          event.preventDefault();
                        }
                      }}
                    >
                      <input type="hidden" name="_intent" value="deleteAttempt" />
                      <input type="hidden" name="attemptId" value={attempt.id} />
                      <button type="submit" className="esl-history-item-menu-option is-danger">
                        Delete attempt
                      </button>
                    </form>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
