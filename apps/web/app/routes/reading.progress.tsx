import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { listCompletedEslReadingAttemptsByUser, listPassagesByUser } from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { getDisplayEslPassageTitle, parseEslReadingEvaluationOutput } from "~/utils/esl-reading";

export const handle = {
  breadcrumb: { label: "progress", href: "/reading/progress" }
};

type ScorePoint = {
  attemptId: string;
  passageId: string;
  passageTitle: string;
  overallScore: number;
};

type ScoreAverage = {
  label: string;
  value: number;
};

type ProgressNote = {
  attemptId: string;
  passageId: string;
  passageTitle: string;
  text: string;
};

type RecentPassage = {
  id: string;
  title: string;
  latestAttemptId: string | null;
  latestScore: number | null;
  attemptsCount: number;
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const [passages, attempts] = await Promise.all([
    listPassagesByUser(context.env.DB, user.id),
    listCompletedEslReadingAttemptsByUser(context.env.DB, user.id)
  ]);

  const parsedAttempts = attempts
    .map((attempt) => {
      const evaluation = parseEslReadingEvaluationOutput(attempt.evaluation_output_json);
      if (!evaluation) return null;
      return {
        ...attempt,
        evaluation,
        passageTitle: getDisplayEslPassageTitle(attempt.passage_title, attempt.passage_content_text)
      };
    })
    .filter((attempt): attempt is NonNullable<typeof attempt> => attempt !== null);

  const scorePoints: ScorePoint[] = parsedAttempts.map((attempt) => ({
    attemptId: attempt.id,
    passageId: attempt.passage_id,
    passageTitle: attempt.passageTitle,
    overallScore: attempt.evaluation.scores.overall
  }));

  const totalPassages = passages.length;
  const totalAttempts = parsedAttempts.length;
  const totalPracticeMs = parsedAttempts.reduce((sum, attempt) => sum + (attempt.duration_ms ?? 0), 0);
  const bestScore = scorePoints.reduce((max, point) => Math.max(max, point.overallScore), 0);

  const averages: ScoreAverage[] = [
    {
      label: "Pronunciation",
      value: average(parsedAttempts.map((attempt) => attempt.evaluation.scores.pronunciation))
    },
    {
      label: "Fluency",
      value: average(parsedAttempts.map((attempt) => attempt.evaluation.scores.fluency))
    },
    {
      label: "Stress / Rhythm",
      value: average(parsedAttempts.map((attempt) => attempt.evaluation.scores.stress_rhythm))
    },
    {
      label: "Clarity",
      value: average(parsedAttempts.map((attempt) => attempt.evaluation.scores.clarity))
    }
  ].filter((item) => item.value > 0);

  const progressNotes: ProgressNote[] = parsedAttempts
    .slice()
    .reverse()
    .flatMap((attempt) =>
      attempt.evaluation.progress_vs_last.map((text) => ({
        attemptId: attempt.id,
        passageId: attempt.passage_id,
        passageTitle: attempt.passageTitle,
        text
      }))
    )
    .slice(0, 5);

  const recentPassages: RecentPassage[] = passages.slice(0, 5).map((passage) => {
    const attemptsForPassage = parsedAttempts.filter((attempt) => attempt.passage_id === passage.id);
    const latestAttempt = attemptsForPassage.at(-1) ?? null;
    return {
      id: passage.id,
      title: getDisplayEslPassageTitle(passage.title, passage.content_text),
      latestAttemptId: latestAttempt?.id ?? null,
      latestScore: latestAttempt?.evaluation.scores.overall ?? null,
      attemptsCount: attemptsForPassage.length
    };
  });

  return json({
    totalPassages,
    totalAttempts,
    totalPracticeMs,
    bestScore,
    scorePoints,
    averages,
    progressNotes,
    recentPassages
  });
};

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatDurationSummary(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds <= 0) return "0m";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function formatScore(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function ScoreTrendChart({ points }: { points: ScorePoint[] }) {
  if (points.length === 0) return null;

  return (
    <div className="dash-band-chart">
      <div className="dash-band-chart-y">
        {[100, 80, 60, 40, 20, 0].map((value) => (
          <div key={value} className="dash-band-chart-y-label">{value}</div>
        ))}
      </div>
      <div className="dash-band-chart-area">
        {[100, 80, 60, 40, 20, 0].map((value) => (
          <div
            key={value}
            className="dash-band-chart-grid"
            style={{ bottom: `${value}%` }}
          />
        ))}
        {points.map((point, index) => {
          const leftPct = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
          return (
            <Link
              key={point.attemptId}
              to={`/reading/${point.passageId}?attempt=${point.attemptId}`}
              className="dash-band-chart-dot"
              style={{ left: `${leftPct}%`, bottom: `${point.overallScore}%` }}
              title={`${point.passageTitle} · Score ${point.overallScore}`}
            />
          );
        })}
        {points.length > 1 ? (
          <svg
            className="dash-band-chart-svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline
              points={points
                .map((point, index) => {
                  const x = (index / (points.length - 1)) * 100;
                  const y = 100 - point.overallScore;
                  return `${x},${y}`;
                })
                .join(" ")}
              fill="none"
              stroke="var(--copper)"
              strokeWidth="2"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : null}
      </div>
    </div>
  );
}

function ScoreAverageList({ items }: { items: ScoreAverage[] }) {
  return (
    <div className="dash-score-list">
      {items.map((item) => (
        <div key={item.label} className="dash-score-row">
          <div className="dash-score-label">{item.label}</div>
          <div className="dash-score-track">
            <div className="dash-score-fill" style={{ width: `${item.value}%` }} />
          </div>
          <div className="dash-score-value">{formatScore(item.value)}</div>
        </div>
      ))}
    </div>
  );
}

export default function ReadingProgressPage() {
  const { totalPassages, totalAttempts, totalPracticeMs, bestScore, scorePoints, averages, progressNotes, recentPassages } =
    useLoaderData<typeof loader>();

  const isEmpty = totalAttempts === 0;

  return (
    <div className="writing-main-scroll">
      <div className="writing-dashboard">
        <div className="writing-dashboard-header">
          <h2>Progress</h2>
          <p className="writing-dashboard-subtitle">Your reading and recitation history at a glance.</p>
        </div>

        {isEmpty ? (
          <div className="writing-dashboard-empty">
            <div className="writing-dashboard-empty-icon">🎙</div>
            <div className="writing-dashboard-empty-title">No data yet</div>
            <p className="writing-dashboard-empty-desc">
              Submit your first recording and get feedback to start tracking progress.
            </p>
            <Link to="/reading" className="btn btn-primary btn-sm">
              Start practice
            </Link>
          </div>
        ) : (
          <>
            <div className="dash-stats">
              <div className="dash-stat-card">
                <div className="dash-stat-value">{totalPassages}</div>
                <div className="dash-stat-label">Passages</div>
              </div>
              <div className="dash-stat-card">
                <div className="dash-stat-value">{totalAttempts}</div>
                <div className="dash-stat-label">Evaluated</div>
              </div>
              <div className="dash-stat-card">
                <div className="dash-stat-value">{formatDurationSummary(totalPracticeMs)}</div>
                <div className="dash-stat-label">Practice time</div>
              </div>
              <div className="dash-stat-card">
                <div className="dash-stat-value">{bestScore}</div>
                <div className="dash-stat-label">Best score</div>
              </div>
            </div>

            <div className="dash-section">
              <h3 className="dash-section-title">Score trend</h3>
              <p className="dash-section-hint">Each dot is one evaluated attempt. Click to open it.</p>
              <ScoreTrendChart points={scorePoints} />
            </div>

            {averages.length > 0 ? (
              <div className="dash-section">
                <h3 className="dash-section-title">Skill averages</h3>
                <p className="dash-section-hint">Average score across all completed attempts.</p>
                <ScoreAverageList items={averages} />
              </div>
            ) : null}

            {progressNotes.length > 0 ? (
              <div className="dash-section">
                <h3 className="dash-section-title">Recent progress notes</h3>
                <div className="dash-note-list">
                  {progressNotes.map((note, index) => (
                    <Link
                      key={`${note.attemptId}-${index}`}
                      to={`/reading/${note.passageId}?attempt=${note.attemptId}`}
                      className="dash-note-item"
                    >
                      <div className="dash-note-text">{note.text}</div>
                      <div className="dash-note-meta">{note.passageTitle}</div>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="dash-section">
              <h3 className="dash-section-title">Recent passages</h3>
              <div className="dash-recent-list">
                {recentPassages.map((passage) => {
                  const href = passage.latestAttemptId
                    ? `/reading/${passage.id}?attempt=${passage.latestAttemptId}`
                    : `/reading/${passage.id}`;
                  return (
                    <Link key={passage.id} to={href} className="dash-recent-item">
                      <div className="dash-recent-title">{passage.title}</div>
                      <div className="dash-recent-meta">
                        <span className="nav-rail-agent-badge">
                          Evaluated {passage.attemptsCount}
                        </span>
                        {passage.latestScore != null ? (
                          <span className="dash-recent-band">Score {passage.latestScore}</span>
                        ) : null}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
