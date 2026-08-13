import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import {
  getEslLearnerProfile,
  listDictationAttemptsByUser,
  listPractisedPassageBandsByUser
} from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { StudioShell } from "~/components/StudioShell";
import { ProgressWorkspaceTabs } from "~/components/ProgressWorkspaceTabs";
import {
  CEFR_LEVELS,
  resolveCefr,
  TAG_DESCRIPTIONS,
  type TagMastery
} from "~/utils/learner-model";
import {
  StudioPage,
  StudioPageBody,
  StudioPageHeader,
  StudioPageTabs
} from "~/components/StudioPage";

export const handle = {
  breadcrumb: { label: "progress", href: "/english/progress" },
  hideHeader: true,
  hideHeaderUserMenu: true
};

export const meta: MetaFunction = () => [{ title: "Progress · English Studio · bcailab" }];

type TagRow = { tag: string; label: string; mastery: TagMastery };

/** Bounded inputs; this page summarises a profile, it does not replay history. */
const DICTATION_HISTORY_LIMIT = 40;
const TREND_POINTS = 12;
/** A1 and C2 carry no library material, so they cannot be "covered". */
const COVERAGE_BANDS: readonly string[] = CEFR_LEVELS.filter(
  (band) => band !== "A1" && band !== "C2"
);

const parseTagMastery = (jsonText: string): Record<string, TagMastery> => {
  try {
    const parsed = JSON.parse(jsonText) as Record<string, TagMastery>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const parseStringArray = (jsonText: string): string[] => {
  try {
    const parsed = JSON.parse(jsonText);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const db = context.env.DB;

  // Coverage and the accuracy curve moved here from Home (2026-08-11): retrospective
  // detail belongs on the progress centre, Home keeps only what qualifies its
  // recommendation. See docs/learner-model-design.md §9.
  const [profile, practisedBands, dictationAttempts] = await Promise.all([
    getEslLearnerProfile(db, user.id),
    listPractisedPassageBandsByUser(db, user.id),
    listDictationAttemptsByUser(db, { userId: user.id, limit: DICTATION_HISTORY_LIMIT })
  ]);

  const coverage = practisedBands.filter((band) => COVERAGE_BANDS.includes(band));

  // Dictation only: it is the deterministic signal (learner-model-design §2).
  const trend = dictationAttempts
    .filter((a) => a.status === "completed")
    .slice(0, TREND_POINTS)
    .reverse()
    .map((a) => a.accuracy);

  const tagMastery = profile ? parseTagMastery(profile.tag_mastery_json) : {};
  const rows: TagRow[] = Object.entries(tagMastery)
    .filter(([, m]) => m.exposure > 0)
    .map(([tag, mastery]) => ({ tag, label: TAG_DESCRIPTIONS[tag] ?? tag, mastery }))
    .sort((a, b) => a.mastery.mastery - b.mastery.mastery);

  // Weakest first is what a learner acts on; strengths are the confident tail.
  const workingOn = rows.filter((r) => r.mastery.mastery < 0.85).slice(0, 6);
  const strengths = rows.filter((r) => r.mastery.mastery >= 0.85).slice(-4).reverse();

  const resolved = resolveCefr({
    declared: profile?.cefr_declared ?? null,
    measured: profile?.cefr_measured ?? null,
    measuredConfidence: profile?.cefr_measured_confidence ?? 0
  });

  return json({
    user: { name: user.name, email: user.email, avatar_url: user.avatar_url },
    level: resolved.level,
    levelBasis: resolved.basis,
    totalAttempts: profile?.total_attempts ?? 0,
    totalPracticeSeconds: profile?.total_practice_seconds ?? 0,
    namedIssues: profile ? parseStringArray(profile.persistent_issues_json) : [],
    namedStrengths: profile ? parseStringArray(profile.strengths_json) : [],
    workingOn,
    strengths,
    coverage,
    trend,
    hasData: rows.length > 0 || (profile?.total_attempts ?? 0) > 0
  });
};

/** Never let the axis span less than this, so a steady learner does not read as erratic. */
const TREND_MIN_SPAN = 0.2;

function trendDomain(points: number[]): { low: number; high: number } {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const centre = (min + max) / 2;
  const span = Math.max(max - min, TREND_MIN_SPAN);
  // Keep the padded window inside 0..1 without letting it collapse at either end.
  const low = Math.max(0, Math.min(centre - span * 0.75, 1 - span * 1.5));
  return { low, high: Math.min(1, low + span * 1.5) };
}

/**
 * Accuracy over the last completed dictation attempts. Moved from Home so the growth
 * curve — the retrospective payoff of recording observations — lives on the surface
 * built for it (learner-model-design §9.1).
 */
function AccuracyTrend({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  // A fixed 0–100 axis flattened real movement — a 26-point gain rendered as a nearly
  // straight line. The axis follows the data instead, and the endpoints are labelled so a
  // scaled axis cannot be misread as absolute.
  const { low, high } = trendDomain(points);
  const range = high - low || 1;
  const coords = points.map((value, index) => {
    const x = (index / (points.length - 1)) * 100;
    const y = 100 - ((Math.min(high, Math.max(low, value)) - low) / range) * 100;
    return `${x},${y}`;
  });
  return (
    <div className="studio-trend">
      <span className="studio-trend-axis">{Math.round(high * 100)}%</span>
      <svg
        className="studio-trend-svg"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Accuracy across the last ${points.length} completed passages, from ${Math.round(points[0]! * 100)} to ${Math.round(points[points.length - 1]! * 100)} percent.`}
      >
        <polyline
          points={coords.join(" ")}
          fill="none"
          stroke="var(--copper)"
          strokeWidth="2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="studio-trend-axis">{Math.round(low * 100)}%</span>
    </div>
  );
}

function formatPracticeTime(seconds: number): string {
  if (seconds <= 0) return "0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function levelBasisNote(level: string | null, basis: "measured" | "declared" | "default"): string {
  if (basis === "measured") {
    return `Based on your dictation accuracy, we've set your level to ${level}.`;
  }
  if (basis === "declared") {
    return "This is the level you picked. It will adjust automatically as you practise dictation.";
  }
  return "Practise a few dictation passages and we'll estimate your level from your accuracy.";
}

function trendMark(trend: number): { symbol: string; className: string } | null {
  if (trend >= 0.05) return { symbol: "↑", className: "is-up" };
  if (trend <= -0.05) return { symbol: "↓", className: "is-down" };
  return null;
}

function TagMasteryList({ rows }: { rows: TagRow[] }) {
  return (
    <div className="dash-score-list">
      {rows.map((row) => {
        const pct = Math.round(row.mastery.mastery * 100);
        const trend = trendMark(row.mastery.trend);
        return (
          <div key={row.tag} className="dash-score-row">
            <div className="dash-score-label">{row.label}</div>
            <div className="dash-score-track">
              <div className="dash-score-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="dash-score-value">
              {pct}
              {trend ? <span className={`dash-trend ${trend.className}`}> {trend.symbol}</span> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function EnglishProgressPage() {
  const {
    user,
    level,
    levelBasis,
    totalAttempts,
    totalPracticeSeconds,
    namedIssues,
    namedStrengths,
    workingOn,
    strengths,
    coverage,
    trend,
    hasData
  } = useLoaderData<typeof loader>();

  return (
    <StudioShell user={user}>
      <StudioPage width="wide">
        <StudioPageHeader
          title="Progress"
          description="One view of your English across every module. Dictation is the most precise signal; reading contributes a lighter one."
        />
        <StudioPageTabs>
          <ProgressWorkspaceTabs />
        </StudioPageTabs>
        <StudioPageBody className="studio-dashboard">

        {!hasData ? (
          <div className="studio-empty">
            <div className="studio-empty-mark" aria-hidden="true" />
            <div className="studio-empty-title">No data yet</div>
            <p className="studio-empty-desc">
              Practise a dictation passage to start building your profile — it doubles as a
              level check.
            </p>
            <Link to="/dictation" className="btn btn-primary btn-sm">
              Start dictation
            </Link>
          </div>
        ) : (
          <>
            <div className="dash-section">
              <h3 className="dash-section-title">Level</h3>
              <div className="dash-stats">
                <div className="dash-stat-card">
                  <div className="dash-stat-value">{level ?? "—"}</div>
                  <div className="dash-stat-label">CEFR estimate</div>
                </div>
                <div className="dash-stat-card">
                  <div className="dash-stat-value">{totalAttempts}</div>
                  <div className="dash-stat-label">Attempts</div>
                </div>
                {/* Only reading attempts carry a duration — dictation writes 0 seconds
                    because nothing times it. Labelling this "practice time" overclaimed,
                    and at zero it rendered "0m" beside a real attempt count. */}
                {totalPracticeSeconds > 0 ? (
                  <div className="dash-stat-card">
                    <div className="dash-stat-value">{formatPracticeTime(totalPracticeSeconds)}</div>
                    <div className="dash-stat-label">Reading time</div>
                  </div>
                ) : null}
              </div>
              <p className="dash-section-hint">{levelBasisNote(level, levelBasis)}</p>
            </div>

            {trend.length >= 2 ? (
              <div className="dash-section">
                <h3 className="dash-section-title">Dictation accuracy</h3>
                <p className="dash-section-hint">
                  Your last {trend.length} completed passages, oldest first.
                </p>
                <AccuracyTrend points={trend} />
              </div>
            ) : null}

            <div className="dash-section">
              <h3 className="dash-section-title">Coverage</h3>
              <p className="dash-section-hint">
                Which levels you have practised. A wider spread makes the level estimate
                more confident, so working a band above or below is useful.
              </p>
              <div className="studio-coverage">
                {COVERAGE_BANDS.map((band) => (
                  <span
                    key={band}
                    className={`studio-coverage-band${coverage.includes(band) ? " is-on" : ""}`}
                  >
                    {band}
                  </span>
                ))}
              </div>
              <p className="dash-section-hint">
                {coverage.length} of {COVERAGE_BANDS.length} levels practised
              </p>
            </div>

            {namedIssues.length > 0 || namedStrengths.length > 0 ? (
              <div className="dash-section">
                <h3 className="dash-section-title">What we're seeing</h3>
                {namedIssues.length > 0 ? (
                  <div className="dash-note-list">
                    {namedIssues.map((issue, i) => (
                      <div key={`issue-${i}`} className="dash-note-item">
                        <div className="dash-note-text">{issue}</div>
                        <div className="dash-note-meta">Working on</div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {namedStrengths.length > 0 ? (
                  <div className="dash-note-list" style={{ marginTop: "0.5rem" }}>
                    {namedStrengths.map((s, i) => (
                      <div key={`strength-${i}`} className="dash-note-item">
                        <div className="dash-note-text">{s}</div>
                        <div className="dash-note-meta">Strength</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {workingOn.length > 0 ? (
              <div className="dash-section">
                <h3 className="dash-section-title">Working on</h3>
                <p className="dash-section-hint">
                  Accuracy on each feature, lowest first. An arrow shows a recent shift.
                </p>
                <TagMasteryList rows={workingOn} />
              </div>
            ) : null}

            {strengths.length > 0 ? (
              <div className="dash-section">
                <h3 className="dash-section-title">Strengths</h3>
                <TagMasteryList rows={strengths} />
              </div>
            ) : null}

            <div className="dash-section">
              <h3 className="dash-section-title">Keep going</h3>
              <div className="dash-recent-list">
                <Link to="/dictation" className="dash-recent-item">
                  <div className="dash-recent-title">Dictation</div>
                  <div className="dash-recent-meta">
                    <span className="nav-rail-agent-badge">Sharpens the estimate</span>
                  </div>
                </Link>
                <Link to="/reading" className="dash-recent-item">
                  <div className="dash-recent-title">Reading & Recitation</div>
                  <div className="dash-recent-meta">
                    <span className="nav-rail-agent-badge">Adds a lighter signal</span>
                  </div>
                </Link>
              </div>
            </div>
          </>
        )}
        </StudioPageBody>
      </StudioPage>
    </StudioShell>
  );
}
