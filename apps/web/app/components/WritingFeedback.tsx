import type {
  WritingFeedback as WritingFeedbackType,
  WritingAnnotation,
  WritingDelta
} from "~/utils/writing-eval.server";
import { useT } from "~/i18n/context";
import { writingAssessmentLabel, writingDimensionLabel } from "~/utils/writing-agent-copy";

type WritingFeedbackProps = {
  feedback: WritingFeedbackType;
  roundNumber: number;
  assessmentPrefix?: string | null;
};

const severityConfig = {
  critical: { labelKey: "writingFeedback.critical", className: "is-critical" },
  improvement: { labelKey: "writingFeedback.improvement", className: "is-improvement" },
  strength: { labelKey: "writingFeedback.strength", className: "is-strength" }
} as const;

function AnnotationCard({ annotation }: { annotation: WritingAnnotation }) {
  const t = useT();
  const config = severityConfig[annotation.severity];
  return (
    <div className={`writing-annotation ${config.className}`}>
      <div className="writing-annotation-head">
        <span className={`writing-annotation-badge ${config.className}`}>{t(config.labelKey)}</span>
        <span className="writing-annotation-dimension">{writingDimensionLabel(t, annotation.dimension)}</span>
      </div>
      {annotation.quoted_text ? (
        <blockquote className="writing-annotation-quote" lang="en">"{annotation.quoted_text}"</blockquote>
      ) : null}
      <p className="writing-annotation-diagnosis">{annotation.diagnosis}</p>
      {annotation.guiding_question ? (
        <p className="writing-annotation-question">{annotation.guiding_question}</p>
      ) : null}
    </div>
  );
}

function DeltaSection({ delta }: { delta: WritingDelta }) {
  const t = useT();
  if (!delta.resolved.length && !delta.new_issues.length && !delta.improvement_note) {
    return null;
  }

  return (
    <div className="writing-delta">
      <h4 className="writing-section-title">{t("writingFeedback.progressSinceLast")}</h4>
      {delta.improvement_note ? (
        <p className="writing-delta-note">{delta.improvement_note}</p>
      ) : null}
      {delta.resolved.length > 0 ? (
        <div className="writing-delta-group">
          <span className="writing-delta-label is-resolved">{t("writingFeedback.resolved")}</span>
          <ul className="writing-delta-list">
            {delta.resolved.map((item, i) => (
              <li key={i} className="is-resolved">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {delta.new_issues.length > 0 ? (
        <div className="writing-delta-group">
          <span className="writing-delta-label is-new">{t("writingFeedback.new")}</span>
          <ul className="writing-delta-list">
            {delta.new_issues.map((item, i) => (
              <li key={i} className="is-new">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function WritingFeedbackPanel({
  feedback,
  roundNumber,
  assessmentPrefix
}: WritingFeedbackProps) {
  void roundNumber;
  const t = useT();
  const grouped = {
    critical: feedback.annotations.filter((a) => a.severity === "critical"),
    improvement: feedback.annotations.filter((a) => a.severity === "improvement"),
    strength: feedback.annotations.filter((a) => a.severity === "strength")
  };
  const assessmentText = writingAssessmentLabel(
    t,
    feedback.round_summary.band_estimate,
    assessmentPrefix
  );

  return (
    <div className="writing-feedback">
      {feedback.delta ? <DeltaSection delta={feedback.delta} /> : null}

      {(["critical", "improvement", "strength"] as const).map((severity) => {
        const items = grouped[severity];
        if (items.length === 0) return null;
        return (
          <div key={severity} className="writing-annotation-group">
            {items.map((annotation, i) => (
              <AnnotationCard key={i} annotation={annotation} />
            ))}
          </div>
        );
      })}

      <div className="writing-round-summary">
        <div className="writing-summary-head">
          {assessmentText ? (
            <span className="writing-summary-band">{assessmentText}</span>
          ) : null}
          <span className="writing-summary-counts">
            <span className="is-critical">
              {t("writingFeedback.criticalCount", { count: feedback.round_summary.critical_count })}
            </span>
            {" · "}
            <span className="is-improvement">
              {t("writingFeedback.improvementCount", { count: feedback.round_summary.improvement_count })}
            </span>
            {" · "}
            <span className="is-strength">
              {t("writingFeedback.strengthCount", { count: feedback.round_summary.strengths_count })}
            </span>
          </span>
        </div>
        {feedback.round_summary.overall_comment ? (
          <p className="writing-summary-comment">{feedback.round_summary.overall_comment}</p>
        ) : null}
      </div>
    </div>
  );
}
