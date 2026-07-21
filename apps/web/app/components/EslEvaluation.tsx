import type { EslReadingEvaluationOutput } from "~/utils/esl-reading";
import { clipText } from "~/utils/esl-reading";

/**
 * Renders a reading/recitation evaluation: score summary, commentary, actions, and
 * passage highlights.
 *
 * Extracted from `reading.$id.tsx` so the anonymous trial page (`/reading/trial`)
 * can render the same result without an attempt row behind it. Presentation only —
 * it takes the evaluation output and the passage text, and knows nothing about
 * where either came from.
 */

const HIGHLIGHT_KIND_LABELS: Record<EslReadingEvaluationOutput["highlights"][number]["kind"], string> = {
  mispronunciation: "Mispronunciation",
  stress: "Stress",
  pause: "Pause",
  intonation: "Intonation"
};

const HIGHLIGHT_QUOTE_REGEX = /['"“”‘’]([^'"“”‘’]{2,80})['"“”‘’]/g;
const HIGHLIGHT_WORD_CHAR_REGEX = /[A-Za-z0-9]/;

const normalizeHighlightText = (input: string) => input.replace(/\s+/g, " ").trim();

const isHighlightWordChar = (value: string | undefined) =>
  typeof value === "string" && HIGHLIGHT_WORD_CHAR_REGEX.test(value);

const findHighlightTargetInPassage = (passageText: string, candidate: string) => {
  const normalizedCandidate = normalizeHighlightText(candidate);
  if (!normalizedCandidate) return "";
  const matchIndex = passageText.toLowerCase().indexOf(normalizedCandidate.toLowerCase());
  if (matchIndex < 0) return "";
  return clipText(
    normalizeHighlightText(passageText.slice(matchIndex, matchIndex + normalizedCandidate.length)),
    72
  );
};

const extractQuotedHighlightCandidates = (note: string) => {
  const candidates: string[] = [];
  for (const match of note.matchAll(HIGHLIGHT_QUOTE_REGEX)) {
    const candidate = normalizeHighlightText(match[1] ?? "");
    if (candidate.length >= 2) candidates.push(candidate);
  }
  return candidates;
};

const getSpanTargetText = (
  passageText: string,
  span: EslReadingEvaluationOutput["highlights"][number]["text_span"]
) => {
  const start = Math.max(0, span.start);
  const end = Math.max(start, span.end);
  const raw = passageText.slice(start, end);
  const normalized = normalizeHighlightText(raw);
  if (!normalized) return "";
  if (isHighlightWordChar(passageText[start]) && isHighlightWordChar(passageText[start - 1])) return "";
  if (isHighlightWordChar(passageText[end - 1]) && isHighlightWordChar(passageText[end])) return "";
  return clipText(normalized, 72);
};

const getHighlightTargetText = (
  passageText: string,
  highlight: EslReadingEvaluationOutput["highlights"][number]
) => {
  const candidates = [
    highlight.text_quote ?? "",
    ...extractQuotedHighlightCandidates(highlight.note_zh)
  ];
  for (const candidate of candidates) {
    const matched = findHighlightTargetInPassage(passageText, candidate);
    if (matched) return matched;
  }
  return getSpanTargetText(passageText, highlight.text_span);
};

export function EslEvaluation(props: { evaluation: EslReadingEvaluationOutput; passageText: string }) {
  const { evaluation, passageText } = props;
  const dimensions = [
    { label: "Pronunciation", score: evaluation.scores.pronunciation },
    { label: "Fluency", score: evaluation.scores.fluency },
    { label: "Stress / Rhythm", score: evaluation.scores.stress_rhythm },
    { label: "Clarity", score: evaluation.scores.clarity }
  ];

  return (
    <div className="esl-eval-content">
      <div className="esl-score-summary">
        <div className="esl-score-overview">
          <div className="esl-score-overview-label">Overall</div>
          <div className="esl-score-overview-value">{evaluation.scores.overall}</div>
          <div className="esl-score-overview-meta">
            {evaluation.cefr_guess ? `CEFR ${evaluation.cefr_guess}` : "Speaking score"}
          </div>
        </div>

        <div className="esl-score-grid">
          {dimensions.map((dimension) => (
            <div key={dimension.label} className="esl-score-card">
              <div className="esl-score-card-top">
                <span className="esl-score-card-label">{dimension.label}</span>
                <span className="esl-score-card-value">{dimension.score}</span>
              </div>
              <div className="esl-score-card-track">
                <div
                  className="esl-score-card-fill"
                  style={{ width: `${Math.max(4, dimension.score)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {evaluation.commentary_zh ? (
        <div className="esl-eval-commentary">{evaluation.commentary_zh}</div>
      ) : null}

      {evaluation.progress_vs_last.length > 0 && (
        <div className="esl-eval-progress">
          {evaluation.progress_vs_last.map((item, index) => (
            <div key={index} className="esl-eval-progress-item">
              {item}
            </div>
          ))}
        </div>
      )}

      {evaluation.top_actions_zh.length > 0 && (
        <>
          <div className="esl-eval-subtitle">Actions</div>
          <ul className="esl-eval-list">
            {evaluation.top_actions_zh.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      )}

      {evaluation.highlights.length > 0 && (
        <>
          <div className="esl-eval-subtitle">Highlights</div>
          <div className="esl-highlights">
            {evaluation.highlights.map((highlight, index) => {
              const targetText = getHighlightTargetText(passageText, highlight);
              return (
                <div key={index} className={`esl-highlight sev-${highlight.severity}`}>
                  <div className="esl-highlight-head">
                    <span className="esl-highlight-kind">{HIGHLIGHT_KIND_LABELS[highlight.kind]}</span>
                    {targetText ? (
                      <span className="esl-highlight-target" title={targetText}>
                        {targetText}
                      </span>
                    ) : null}
                  </div>
                  <div className="esl-highlight-note">{highlight.note_zh}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
