import * as React from "react";
import { Link } from "@remix-run/react";
import { LocalDateTime } from "~/components/LocalDateTime";
import { formatDuration } from "~/utils/esl-reading";
import { ConfirmSubmitButton } from "~/components/ConfirmDialog";
import { useT } from "~/i18n/context";
import type { Translate } from "~/i18n/translate";

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
  collapsed: boolean;
  onToggle: () => void;
};

const getHistoryScoreLabel = (attempt: HistoryAttempt) => {
  if (attempt.evaluationStatus === "pending") return "AI…";
  if (attempt.evaluationStatus === "failed") return "ERR";
  return attempt.score ?? "–";
};

const getHistoryMetaLabel = (attempt: HistoryAttempt, t: Translate) => {
  if (attempt.evaluationStatus === "pending") return t("reading.history.pending");
  if (attempt.evaluationStatus === "failed") return t("reading.history.failed");
  if (attempt.mode === "recitation") return t("reading.history.recite");
  return null;
};

export function EslReadingHistoryRail(props: EslReadingHistoryRailProps) {
  const {
    passageId,
    attempts,
    selectedAttemptId,
    isComposeView = false,
    disableNewAttempt = false,
    collapsed,
    onToggle,
  } = props;
  const t = useT();
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);
  const [isDesktop, setIsDesktop] = React.useState(false);
  const sortedAttempts = React.useMemo(
    () => [...attempts].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [attempts]
  );
  const isEmpty = sortedAttempts.length === 0;
  const newAttemptHref = disableNewAttempt || !passageId ? "#" : `/reading/${passageId}?compose=1`;
  const effectiveCollapsed = collapsed && isDesktop;

  React.useEffect(() => {
    const closeMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".esl-history-item-actions")) return;
      setOpenMenuId(null);
    };
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, []);

  React.useEffect(() => {
    try {
      const mediaQuery = window.matchMedia("(min-width: 1024px)");
      const handleChange = () => setIsDesktop(mediaQuery.matches);
      handleChange();
      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
      }
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    } catch {
      return undefined;
    }
  }, []);

  React.useEffect(() => {
    if (effectiveCollapsed) setOpenMenuId(null);
  }, [effectiveCollapsed]);

  return (
    <aside className={`esl-history-rail${effectiveCollapsed ? " is-collapsed" : ""}${isEmpty ? " is-empty" : ""}`}>
      <div className="esl-history-toolbar">
        <button
          type="button"
          className="esl-history-toggle-btn"
          aria-label={effectiveCollapsed ? t("reading.history.expand") : t("reading.history.collapse")}
          onClick={onToggle}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="16" height="16">
            {effectiveCollapsed ? (
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        </button>

        {effectiveCollapsed ? (
          <Link
            to={newAttemptHref}
            className={`esl-history-icon-btn${disableNewAttempt ? " is-disabled" : ""}${isComposeView ? " is-active" : ""}`}
            aria-label={t("reading.history.newAttempt")}
            aria-disabled={disableNewAttempt}
            onClick={(event) => {
              if (disableNewAttempt) event.preventDefault();
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="16" height="16">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </Link>
        ) : null}
      </div>

      <div
        className={`esl-history-rail-content${effectiveCollapsed ? " is-hidden" : ""}${isEmpty ? " is-empty" : ""}`}
        aria-hidden={effectiveCollapsed}
      >
        <div className="esl-history-rail-header">
          {passageId ? (
            <Link
              to={newAttemptHref}
              className={`btn btn-ghost btn-sm esl-history-new ${disableNewAttempt ? "is-disabled" : ""}${isComposeView ? " is-active" : ""}`}
              aria-disabled={disableNewAttempt}
              onClick={(event) => {
                if (disableNewAttempt) event.preventDefault();
              }}
            >
              {t("reading.history.newAttempt")}
            </Link>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm esl-history-new is-disabled" disabled>
              {t("reading.history.newAttempt")}
            </button>
          )}
        </div>

        <div className="esl-eval-subtitle">{t("reading.history.title", { count: attempts.length })}</div>

        {isEmpty ? (
          <div className="esl-history-empty">
            <svg className="esl-history-empty-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 18.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z" stroke="currentColor" strokeWidth="1.4" />
              <path d="M12 9v4l2.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{t("reading.history.empty")}</span>
          </div>
        ) : (
          <div className="esl-history-list">
            {sortedAttempts.map((attempt) => {
              const metaLabel = getHistoryMetaLabel(attempt, t);
              return (
                <div
                  key={attempt.id}
                  className={`esl-history-item-shell ${
                    !isComposeView && selectedAttemptId === attempt.id ? "is-active" : ""
                  } ${openMenuId === attempt.id ? "is-menu-open" : ""}`}
                >
                  <Link
                    to={`/reading/${passageId}?attempt=${attempt.id}`}
                    className={`esl-history-item ${
                      !isComposeView && selectedAttemptId === attempt.id ? "is-active" : ""
                    }`}
                    onClick={() => setOpenMenuId(null)}
                  >
                    <span className="esl-history-score">{getHistoryScoreLabel(attempt)}</span>
                    {metaLabel ? <span className="esl-history-mode">{metaLabel}</span> : null}
                    <LocalDateTime value={attempt.createdAt} className="esl-history-date" />
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
                      aria-label={t("reading.history.openMenu")}
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
                        <form method="post" action={`/reading/${passageId}`}>
                          <input type="hidden" name="_intent" value="deleteAttempt" />
                          <input type="hidden" name="attemptId" value={attempt.id} />
                          <ConfirmSubmitButton
                            className="esl-history-item-menu-option is-danger"
                            dialogTitle={t("reading.history.deleteTitle")}
                            dialogDescription={t("reading.history.deleteDescription")}
                          >
                            {t("reading.history.deleteAttempt")}
                          </ConfirmSubmitButton>
                        </form>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
