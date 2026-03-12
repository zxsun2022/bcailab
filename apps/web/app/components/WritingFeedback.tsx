import type {
  WritingFeedback as WritingFeedbackType,
  WritingAnnotation,
  WritingDelta
} from "~/utils/writing-eval.server";

type WritingFeedbackProps = {
  feedback: WritingFeedbackType;
  roundNumber: number;
};

const severityConfig = {
  critical: { label: "Critical", className: "is-critical" },
  improvement: { label: "Improvement", className: "is-improvement" },
  strength: { label: "Strength", className: "is-strength" }
} as const;

function AnnotationCard({ annotation }: { annotation: WritingAnnotation }) {
  const config = severityConfig[annotation.severity];
  return (
    <div className={`writing-annotation ${config.className}`}>
      <div className="writing-annotation-head">
        <span className={`writing-annotation-badge ${config.className}`}>{config.label}</span>
        <span className="writing-annotation-dimension">{annotation.dimension}</span>
      </div>
      {annotation.quoted_text ? (
        <blockquote className="writing-annotation-quote">"{annotation.quoted_text}"</blockquote>
      ) : null}
      <p className="writing-annotation-diagnosis">{annotation.diagnosis}</p>
      {annotation.guiding_question ? (
        <p className="writing-annotation-question">{annotation.guiding_question}</p>
      ) : null}
    </div>
  );
}

function DeltaSection({ delta }: { delta: WritingDelta }) {
  if (!delta.resolved.length && !delta.new_issues.length && !delta.improvement_note) {
    return null;
  }

  return (
    <div className="writing-delta">
      <h4 className="writing-section-title">Progress since last round</h4>
      {delta.improvement_note ? (
        <p className="writing-delta-note">{delta.improvement_note}</p>
      ) : null}
      {delta.resolved.length > 0 ? (
        <div className="writing-delta-group">
          <span className="writing-delta-label is-resolved">Resolved</span>
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
          <span className="writing-delta-label is-new">New</span>
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

export function WritingFeedbackPanel({ feedback, roundNumber }: WritingFeedbackProps) {
  const grouped = {
    critical: feedback.annotations.filter((a) => a.severity === "critical"),
    improvement: feedback.annotations.filter((a) => a.severity === "improvement"),
    strength: feedback.annotations.filter((a) => a.severity === "strength")
  };

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
          <span className="writing-summary-band">
            Band {feedback.round_summary.band_estimate}
          </span>
          <span className="writing-summary-counts">
            <span className="is-critical">{feedback.round_summary.critical_count} critical</span>
            {" · "}
            <span className="is-improvement">
              {feedback.round_summary.improvement_count} improvements
            </span>
            {" · "}
            <span className="is-strength">{feedback.round_summary.strengths_count} strengths</span>
          </span>
        </div>
        {feedback.round_summary.overall_comment ? (
          <p className="writing-summary-comment">{feedback.round_summary.overall_comment}</p>
        ) : null}
      </div>
    </div>
  );
}
