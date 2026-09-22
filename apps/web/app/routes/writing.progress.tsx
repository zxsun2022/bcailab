import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, Link } from "@remix-run/react";
import { listWritingArticlesByUser, listCompletedWritingRevisionsByUser } from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { getWritingAgentOrDefault } from "~/utils/writing-agents";
import {
  writingAgentCopy,
  writingAssessmentLabel,
  writingDimensionLabel
} from "~/utils/writing-agent-copy";
import type { WritingFeedback, WritingAnnotation } from "~/utils/writing-eval.server";
import { isWritingSchemaMissingError, logWritingSchemaMissing } from "~/utils/writing-schema.server";
import { ProgressWorkspaceTabs } from "~/components/ProgressWorkspaceTabs";
import {
  StudioPage,
  StudioPageBody,
  StudioPageHeader,
  StudioPageTabs
} from "~/components/StudioPage";
import { useT } from "~/i18n/context";
import { metaTranslator } from "~/i18n/meta";

export const handle = {
  breadcrumb: { label: "progress", href: "/writing/progress" }
};

export const meta: MetaFunction = ({ matches }) => [
  { title: metaTranslator(matches)("meta.writingProgress.title") }
];

type BandPoint = {
  articleId: string;
  articleTitle: string | null;
  agentType: string;
  bandEstimate: string;
  roundNumber: number;
  createdAt: string;
};

type DimensionCount = {
  dimension: string;
  critical: number;
  improvement: number;
  strength: number;
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);

  try {
    const [articles, revisions] = await Promise.all([
      listWritingArticlesByUser(context.env.DB, user.id),
      listCompletedWritingRevisionsByUser(context.env.DB, user.id)
    ]);

    const parsedRevisions = revisions.map((r) => {
      let feedback: WritingFeedback | null = null;
      if (r.feedback_json) {
        try {
          feedback = JSON.parse(r.feedback_json) as WritingFeedback;
        } catch {
          // Ignore malformed historical feedback and keep the revision visible.
        }
      }
      return { ...r, feedback };
    });

    const articleMap = new Map(articles.map((a) => [a.id, a]));
    const bandPoints: BandPoint[] = [];
    for (const r of parsedRevisions) {
      const bandEstimate = r.feedback?.round_summary?.band_estimate;
      if (!bandEstimate) continue;
      const article = articleMap.get(r.article_id);
      if (!article) continue;
      bandPoints.push({
        articleId: r.article_id,
        articleTitle: article.title,
        agentType: article.agent_type,
        bandEstimate,
        roundNumber: r.round_number,
        createdAt: r.created_at
      });
    }

    const dimensionMap = new Map<string, DimensionCount>();
    for (const r of parsedRevisions) {
      if (!r.feedback) continue;
      for (const ann of r.feedback.annotations as WritingAnnotation[]) {
        const dim = ann.dimension || "General";
        const existing = dimensionMap.get(dim) ?? { dimension: dim, critical: 0, improvement: 0, strength: 0 };
        existing[ann.severity] = (existing[ann.severity] ?? 0) + 1;
        dimensionMap.set(dim, existing);
      }
    }
    const dimensions = Array.from(dimensionMap.values()).sort(
      (a, b) => (b.critical + b.improvement) - (a.critical + a.improvement)
    );

    const totalArticles = articles.length;
    const totalRevisions = revisions.length;
    const totalWords = revisions.reduce((sum, r) => sum + r.word_count, 0);

    const recentArticles = articles.slice(0, 5).map((a) => {
      const agent = getWritingAgentOrDefault(a.agent_type);
      const latestRevWithBand = parsedRevisions
        .filter((r) => r.article_id === a.id && r.feedback?.round_summary?.band_estimate)
        .at(-1);
      return {
        id: a.id,
        title: a.title,
        agentId: agent.id,
        assessmentPrefix: agent.assessmentPrefix ?? null,
        bandEstimate: latestRevWithBand?.feedback?.round_summary?.band_estimate ?? null,
        updatedAt: a.updated_at
      };
    });

    return json({
      schemaReady: true as const,
      bandPoints,
      dimensions,
      totalArticles,
      totalRevisions,
      totalWords,
      recentArticles
    });
  } catch (error) {
    if (!isWritingSchemaMissingError(error)) throw error;
    logWritingSchemaMissing("writing.progress.loader", error);
    return json(
      {
        schemaReady: false as const,
        bandPoints: [],
        dimensions: [],
        totalArticles: 0,
        totalRevisions: 0,
        totalWords: 0,
        recentArticles: []
      },
      { status: 503 }
    );
  }
};

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function BandBar({ points }: { points: BandPoint[] }) {
  const t = useT();
  if (points.length === 0) return null;

  const ieltsPoints = points.filter((p) => {
    const v = parseFloat(p.bandEstimate);
    return !isNaN(v) && v >= 4 && v <= 9.5;
  });

  if (ieltsPoints.length === 0) {
    return (
      <div className="dash-band-pills">
        {points.map((p, i) => (
          <Link key={i} to={`/writing/${p.articleId}?round=${p.roundNumber}`} className="dash-band-pill">
            {writingAssessmentLabel(t, p.bandEstimate, getWritingAgentOrDefault(p.agentType).assessmentPrefix)}
          </Link>
        ))}
      </div>
    );
  }

  const min = 4.5;
  const max = 9.0;
  const range = max - min;

  return (
    <div className="dash-band-chart">
      <div className="dash-band-chart-y">
        {[9, 8, 7, 6, 5].map((v) => (
          <div key={v} className="dash-band-chart-y-label">{v}</div>
        ))}
      </div>
      <div className="dash-band-chart-area">
        {[9, 8, 7, 6, 5].map((v) => (
          <div
            key={v}
            className="dash-band-chart-grid"
            style={{ bottom: `${((v - min) / range) * 100}%` }}
          />
        ))}
        {ieltsPoints.map((p, i) => {
          const value = parseFloat(p.bandEstimate);
          const bottomPct = ((value - min) / range) * 100;
          const leftPct = ieltsPoints.length === 1 ? 50 : (i / (ieltsPoints.length - 1)) * 100;
          return (
            <Link
              key={i}
              to={`/writing/${p.articleId}?round=${p.roundNumber}`}
              className="dash-band-chart-dot"
              style={{ left: `${leftPct}%`, bottom: `${bottomPct}%` }}
              title={t("writingProgress.dotTitle", {
                title: p.articleTitle || t("writingDetail.untitled"),
                round: p.roundNumber,
                band: p.bandEstimate
              })}
            />
          );
        })}
        {ieltsPoints.length > 1 ? (
          <svg
            className="dash-band-chart-svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline
              points={ieltsPoints
                .map((p, i) => {
                  const value = parseFloat(p.bandEstimate);
                  const y = (1 - (value - min) / range) * 100;
                  const x = (i / (ieltsPoints.length - 1)) * 100;
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

function DimensionBreakdown({ dimensions }: { dimensions: DimensionCount[] }) {
  const t = useT();
  const maxTotal = Math.max(...dimensions.map((d) => d.critical + d.improvement + d.strength), 1);

  return (
    <div className="dash-dimension-list">
      {dimensions.map((d) => {
        const total = d.critical + d.improvement + d.strength;
        const critW = (d.critical / maxTotal) * 100;
        const impW = (d.improvement / maxTotal) * 100;
        const strW = (d.strength / maxTotal) * 100;
        return (
          <div key={d.dimension} className="dash-dimension-row">
            <div className="dash-dimension-label">{writingDimensionLabel(t, d.dimension)}</div>
            <div className="dash-dimension-bar-track">
              {d.critical > 0 ? (
                <div className="dash-dimension-bar is-critical" style={{ width: `${critW}%` }} title={t("writingFeedback.criticalCount", { count: d.critical })} />
              ) : null}
              {d.improvement > 0 ? (
                <div className="dash-dimension-bar is-improvement" style={{ width: `${impW}%` }} title={t("writingFeedback.improvementCount", { count: d.improvement })} />
              ) : null}
              {d.strength > 0 ? (
                <div className="dash-dimension-bar is-strength" style={{ width: `${strW}%` }} title={t("writingFeedback.strengthCount", { count: d.strength })} />
              ) : null}
            </div>
            <div className="dash-dimension-count">{total}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function WritingProgressPage() {
  const data = useLoaderData<typeof loader>();
  const t = useT();

  if (!data.schemaReady) {
    return (
      <div className="studio-main-scroll">
        <StudioPage width="wide">
          <StudioPageHeader title={t("writingProgress.title")} />
          <StudioPageBody className="studio-dashboard">
            <p className="writing-status-desc">{t("writingProgress.unavailable")}</p>
          </StudioPageBody>
        </StudioPage>
      </div>
    );
  }

  const { bandPoints, dimensions, totalArticles, totalRevisions, totalWords, recentArticles } = data;
  const isEmpty = totalRevisions === 0;

  return (
    <div className="studio-main-scroll">
      <StudioPage width="wide">
        <StudioPageHeader
          title={t("writingProgress.title")}
          description={t("writingProgress.description")}
        />
        <StudioPageTabs>
          <ProgressWorkspaceTabs />
        </StudioPageTabs>
        <StudioPageBody className="studio-dashboard">

        {isEmpty ? (
          <div className="studio-empty">
            <div className="studio-empty-mark" aria-hidden="true" />
            <div className="studio-empty-title">{t("readingProgress.noData")}</div>
            <p className="studio-empty-desc">{t("writingProgress.noDataBody")}</p>
            <Link to="/writing" className="btn btn-primary btn-sm">
              {t("writingProgress.start")}
            </Link>
          </div>
        ) : (
          <>
            <div className="dash-stats">
              <div className="dash-stat-card">
                <div className="dash-stat-value">{totalArticles}</div>
                <div className="dash-stat-label">{t("writingProgress.articles")}</div>
              </div>
              <div className="dash-stat-card">
                <div className="dash-stat-value">{totalRevisions}</div>
                <div className="dash-stat-label">{t("writingProgress.revisions")}</div>
              </div>
              <div className="dash-stat-card">
                <div className="dash-stat-value">{formatNumber(totalWords)}</div>
                <div className="dash-stat-label">{t("writingProgress.words")}</div>
              </div>
            </div>

            {bandPoints.length > 0 ? (
              <div className="dash-section">
                <h3 className="dash-section-title">{t("writingProgress.trend")}</h3>
                <p className="dash-section-hint">{t("writingProgress.trendHint")}</p>
                <BandBar points={bandPoints} />
              </div>
            ) : null}

            {dimensions.length > 0 ? (
              <div className="dash-section">
                <h3 className="dash-section-title">{t("writingProgress.breakdown")}</h3>
                <p className="dash-section-hint">{t("writingProgress.breakdownHint")}</p>
                <div className="dash-dimension-legend">
                  <span className="dash-legend-item is-critical">{t("writingFeedback.critical")}</span>
                  <span className="dash-legend-item is-improvement">{t("writingFeedback.improvement")}</span>
                  <span className="dash-legend-item is-strength">{t("writingFeedback.strength")}</span>
                </div>
                <DimensionBreakdown dimensions={dimensions} />
              </div>
            ) : null}

            <div className="dash-section">
              <h3 className="dash-section-title">{t("writingProgress.recent")}</h3>
              <div className="dash-recent-list">
                {recentArticles.map((a) => (
                  <Link key={a.id} to={`/writing/${a.id}`} className="dash-recent-item">
                    <div className="dash-recent-title">{a.title || t("writingDetail.untitled")}</div>
                    <div className="dash-recent-meta">
                      <span className="nav-rail-agent-badge">
                        {writingAgentCopy(t, getWritingAgentOrDefault(a.agentId)).label}
                      </span>
                      {a.bandEstimate ? (
                        <span className="dash-recent-band">
                          {writingAssessmentLabel(t, a.bandEstimate, a.assessmentPrefix)}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
        </StudioPageBody>
      </StudioPage>
    </div>
  );
}
