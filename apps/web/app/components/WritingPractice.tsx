import * as React from "react";
import { useFetcher } from "@remix-run/react";
import { useT } from "~/i18n/context";
import type { WritingAnnotation } from "~/utils/writing-eval.server";
import { writingDimensionLabel } from "~/utils/writing-agent-copy";
import { MAX_ANSWER_CHARS, MAX_ATTEMPTS_PER_STEP, type PracticeStep, type PracticeView } from "~/utils/writing-practice";
import type { PracticeActionData } from "~/routes/writing.$id_.practice";

type Props = {
  articleId: string;
  revisionId: string;
  annotationIndex: number;
  annotation: WritingAnnotation;
  item: PracticeView | null;
  feedbackLanguage: "en" | "zh";
  onItem: (item: PracticeView) => void;
  onClose: () => void;
};

/**
 * Targeted practice on one annotation, in the center stage: fix the quoted text, then use the
 * same point in a new situation. The learner always writes before any reference is shown.
 */
export function WritingPractice({
  articleId,
  revisionId,
  annotationIndex,
  annotation,
  item,
  feedbackLanguage,
  onItem,
  onClose
}: Props) {
  const t = useT();
  const fetcher = useFetcher<PracticeActionData>();
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const busy = fetcher.state !== "idle";
  const action = `/writing/${articleId}/practice`;
  const headingId = `writing-practice-${annotationIndex}`;

  // The answer box starts from the original text on step 1 (the learner edits it) and empty on
  // step 2. It is local state, so a failed call never loses what the learner typed.
  const awaiting = item?.awaiting ?? null;
  const stepAttempts = item && awaiting ? item.attempts.filter((a) => a.step === awaiting) : [];
  const seed = awaiting === "fix" ? (stepAttempts.at(-1)?.answer ?? annotation.quoted_text) : (stepAttempts.at(-1)?.answer ?? "");
  const [answer, setAnswer] = React.useState(seed);
  const seedKey = `${item?.id ?? "new"}:${awaiting ?? "none"}:${stepAttempts.length}`;
  React.useEffect(() => setAnswer(seed), [seedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hand each response to the page once; the page owns the item so the feedback cards update too.
  const applied = React.useRef<PracticeActionData | undefined>(undefined);
  React.useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data?.item || applied.current === fetcher.data) return;
    applied.current = fetcher.data;
    onItem(fetcher.data.item);
  }, [fetcher.state, fetcher.data, onItem]);

  React.useEffect(() => {
    headingRef.current?.focus();
  }, [annotationIndex]);

  const post = (fields: Record<string, string>) =>
    fetcher.submit(fields, { method: "post", action });

  const submitAnswer = () => {
    if (!item || !answer.trim() || busy) return;
    post({ _intent: "answer", itemId: item.id, answer });
  };

  const stepBlock = (step: PracticeStep) => {
    if (!item) return null;
    const attempts = item.attempts.filter((a) => a.step === step);
    const isAwaiting = item.awaiting === step;
    const remaining = MAX_ATTEMPTS_PER_STEP - attempts.length;
    return (
      <div className="writing-practice-step">
        <h3 className="writing-practice-step-title">
          {step === "fix" ? t("writingPractice.step1") : t("writingPractice.step2")}
        </h3>
        {step === "fix" ? (
          <p className="writing-practice-task">{t("writingPractice.fixTask")}</p>
        ) : (
          <p className="writing-practice-task">{item.transferPrompt}</p>
        )}
        {attempts.map((attempt, i) => (
          <div key={i} className={`writing-practice-attempt ${attempt.acceptable ? "is-pass" : "is-miss"}`}>
            <p className="writing-practice-answer" lang="en">{attempt.answer}</p>
            <p className="writing-practice-verdict">
              <span className="writing-practice-verdict-label">
                {attempt.acceptable ? t("writingPractice.pass") : t("writingPractice.miss")}
              </span>{" "}
              {attempt.reason}
            </p>
          </div>
        ))}
        {item.references[step] ? (
          <p className="writing-practice-reference">
            <span className="writing-practice-reference-label">{t("writingPractice.reference")}</span>{" "}
            <span lang="en">{item.references[step]}</span>
          </p>
        ) : null}
        {isAwaiting ? (
          <div className="writing-practice-compose">
            <label className="writing-practice-label" htmlFor={`${headingId}-${step}`}>
              {t("writingPractice.yourAnswer")}
            </label>
            <textarea
              id={`${headingId}-${step}`}
              className="writing-practice-input"
              lang="en"
              rows={3}
              maxLength={MAX_ANSWER_CHARS}
              value={answer}
              onChange={(e) => setAnswer(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submitAnswer();
                }
              }}
            />
            <div className="writing-practice-actions">
              <button type="button" className="btn btn-primary btn-sm" disabled={busy || !answer.trim()} onClick={submitAnswer}>
                {busy ? t("writingPractice.checking") : t("writingPractice.check")}
              </button>
              <span className="writing-practice-hint">
                {attempts.length > 0 ? t("writingPractice.lastTry") : t("writingPractice.tries", { count: remaining })}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const ended = item && (item.status === "finished" || item.status === "skipped" || item.status === "disputed");

  return (
    <section className="writing-practice" aria-labelledby={headingId}>
      <div className="writing-practice-head">
        <h2 id={headingId} ref={headingRef} tabIndex={-1} className="writing-practice-title">
          {t("writingPractice.title")}
          <span className="writing-annotation-dimension"> · {writingDimensionLabel(t, annotation.dimension)}</span>
        </h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          {t("writingPractice.close")}
        </button>
      </div>
      <blockquote className="writing-annotation-quote" lang="en">"{annotation.quoted_text}"</blockquote>
      <p className="writing-annotation-diagnosis">{annotation.diagnosis}</p>

      {!item ? (
        <div className="writing-practice-intro">
          <p>{t("writingPractice.intro")}</p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => post({
              _intent: "start",
              revisionId,
              annotationIndex: String(annotationIndex),
              feedbackLanguage
            })}
          >
            {t("writingPractice.start")}
          </button>
        </div>
      ) : (
        <>
          {stepBlock("fix")}
          {item.needsTransferPrompt ? (
            <div className="writing-practice-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy}
                onClick={() => post({ _intent: "transfer", itemId: item.id })}
              >
                {busy ? t("writingPractice.preparing") : t("writingPractice.toStep2")}
              </button>
            </div>
          ) : null}
          {item.transferPrompt ? stepBlock("transfer") : null}
        </>
      )}

      <div role="status" aria-live="polite" className="writing-practice-status">
        {item?.status === "finished" ? t("writingPractice.finished") : null}
        {item?.status === "skipped" ? t("writingPractice.skipped") : null}
        {item?.status === "disputed" ? t("writingPractice.disputed") : null}
      </div>
      {fetcher.state === "idle" && fetcher.data?.error ? (
        <p role="alert" className="form-error">{fetcher.data.error}</p>
      ) : null}

      {item && !ended ? (
        <div className="writing-practice-footer">
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
            onClick={() => post({ _intent: "skip", itemId: item.id })}>
            {t("writingPractice.skip")}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
            onClick={() => post({ _intent: "dispute", itemId: item.id })}>
            {t("writingPractice.dispute")}
          </button>
        </div>
      ) : null}
    </section>
  );
}
