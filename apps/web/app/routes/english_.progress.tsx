import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { getEslLearnerProfile } from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { resolveCefr, TAG_DESCRIPTIONS, type TagMastery } from "~/utils/learner-model";

export const handle = {
  breadcrumb: { label: "progress", href: "/english/progress" }
};

export const meta: MetaFunction = () => [{ title: "Progress · English Studio · bcailab" }];

type TagRow = { tag: string; label: string; mastery: TagMastery };

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
  const profile = await getEslLearnerProfile(context.env.DB, user.id);

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
    level: resolved.level,
    levelBasis: resolved.basis,
    totalAttempts: profile?.total_attempts ?? 0,
    totalPracticeSeconds: profile?.total_practice_seconds ?? 0,
    namedIssues: profile ? parseStringArray(profile.persistent_issues_json) : [],
    namedStrengths: profile ? parseStringArray(profile.strengths_json) : [],
    workingOn,
    strengths,
    hasData: rows.length > 0 || (profile?.total_attempts ?? 0) > 0
  });
};

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
    level,
    levelBasis,
    totalAttempts,
    totalPracticeSeconds,
    namedIssues,
    namedStrengths,
    workingOn,
    strengths,
    hasData
  } = useLoaderData<typeof loader>();

  return (
    <div className="writing-main-scroll">
      <div className="writing-dashboard">
        <div className="writing-dashboard-header">
          <h2>Progress</h2>
          <p className="writing-dashboard-subtitle">
            One view of your English across every module. Dictation is the most precise signal;
            reading contributes a lighter one.
          </p>
        </div>

        {!hasData ? (
          <div className="writing-dashboard-empty">
            <div className="writing-dashboard-empty-icon">📈</div>
            <div className="writing-dashboard-empty-title">No data yet</div>
            <p className="writing-dashboard-empty-desc">
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
                <div className="dash-stat-card">
                  <div className="dash-stat-value">{formatPracticeTime(totalPracticeSeconds)}</div>
                  <div className="dash-stat-label">Practice time</div>
                </div>
              </div>
              <p className="dash-section-hint">{levelBasisNote(level, levelBasis)}</p>
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
      </div>
    </div>
  );
}
