import * as React from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useFetcher, useLoaderData } from "@remix-run/react";
import {
  getEslLearnerProfile,
  listDictationAttemptsByUser,
  listHomeCandidates,
  listHomeRecordPassages,
  getHomeResumableDictation,
  getLatestWritingRevision,
  type HomePassage,
  listRecentReadingAttempts,
  listRecentWritingArticlesByUser,
  setLearnerDeclaredLevel
} from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { StudioShell } from "~/components/StudioShell";
import { StudioPage, StudioPageBody, StudioPageHeader } from "~/components/StudioPage";
import { LocalDateTime } from "~/components/LocalDateTime";
import { CEFR_LEVELS, resolveCefr } from "~/utils/learner-model";
import {
  selectStarterPractice,
  type CandidatePassage,
  type PracticeRecord,
  type StarterPractice,
  type WritingDraft
} from "~/utils/starter-practice";
import {
  emphasisOf,
  homeLayout,
  recentWithoutContinue,
  type WritingRoundState
} from "~/utils/home-view";
import { RichMessage, useT } from "~/i18n/context";
import { metaTranslator } from "~/i18n/meta";
import { getRequestTranslator } from "~/i18n/locale.server";

/**
 * English Studio Home — the signed-in top surface.
 * Design: `docs/english-studio-ia-v2-design.md` §3.3–§3.5.
 *
 * Action-first: what to continue or start owns the page. Home is where the practice loop
 * restarts, so an element earns its place here only by helping the learner begin the right
 * thing now; everything retrospective lives on `/english/progress`.
 *
 * The status grid this page used to carry moved there on 2026-08-11. What remains of it is
 * one basis line, because the data's only job on Home is to say what the recommendation
 * above is worth (ia-v2 §3.3) — as a grid it outweighed the recommendation while saying
 * almost nothing, which is the cold-start thinness risk in ia-v2 §5.1.
 *
 * Every query here is bounded, and personalisation failure degrades to a plain module
 * launcher — the Home must never render blank.
 */

export const handle = {
  breadcrumb: { label: "home", href: "/english/home" },
  // The studio rail replaces the site header here, as on every tool page.
  hideHeader: true,
  hideHeaderUserMenu: true
};

export const meta: MetaFunction = ({ matches }) => [
  { title: metaTranslator(matches)("meta.home.title") }
];

/** Bounded inputs. The Home is a summary; depth belongs on the progress page. */
const DICTATION_HISTORY_LIMIT = 40;
const READING_HISTORY_LIMIT = 20;
const WRITING_HISTORY_LIMIT = 1;
const RECENT_ROWS = 3;

/**
 * One row of recent practice: all the work on one passage, not one run at it. `attempts`
 * and `best` are what make it a summary rather than a snapshot of the latest attempt.
 */
type RecentItem = {
  id: string;
  title: string;
  mode: "dictation" | "reading";
  /** State of the most recent attempt, as data; the page words it in the interface language. */
  latest:
    | { kind: "score"; value: number }
    | { kind: "in_progress"; done: number; total: number | null }
    | { kind: "evaluating" };
  href: string;
  at: string;
  attempts: number;
  best: number | null;
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const user = await requireUser(request, context);
  const formData = await request.formData();
  const t = getRequestTranslator(request);
  if (String(formData.get("_intent")) !== "declareLevel") {
    return json({ ok: false, error: t("common.unknownAction") }, { status: 400 });
  }
  const level = String(formData.get("level") ?? "");
  if (!CEFR_LEVELS.includes(level as (typeof CEFR_LEVELS)[number])) {
    return json({ ok: false, error: t("homePage.error.unknownLevel") }, { status: 400 });
  }
  // Declared only. A measured estimate still overrides it later once confident (design §8
  // of the learner model), which is why this writes `cefr_declared` and only fills
  // `cefr_estimate` when nothing has been established yet.
  await setLearnerDeclaredLevel(context.env.DB, {
    userId: user.id,
    cefrDeclared: level,
    cefrEstimate: level
  });
  return json({ ok: true });
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const db = context.env.DB;

  let degraded = false;
  let historyFailed = false;
  let profileUnavailable = false;
  const recover = async <T,>(source: string, read: Promise<T>, fallback: T): Promise<T> => {
    try { return await read; }
    catch {
      degraded = true;
      if (source === "profile") profileUnavailable = true;
      if (source.endsWith("history") || source === "resume") historyFailed = true;
      console.error(`english home ${source} unavailable`);
      return fallback;
    }
  };
  const [profile, dictationHistory, readingAttempts, articles, resume] = await Promise.all([
    recover("profile", getEslLearnerProfile(db, user.id), null),
    recover("dictation-history", listDictationAttemptsByUser(db, { userId: user.id, limit: DICTATION_HISTORY_LIMIT }), []),
    recover("reading-history", listRecentReadingAttempts(db, { userId: user.id, limit: READING_HISTORY_LIMIT }), []),
    recover("writing-history", listRecentWritingArticlesByUser(db, { userId: user.id, limit: WRITING_HISTORY_LIMIT }), []),
    recover("resume", getHomeResumableDictation(db, user.id), null)
  ]);
  const dictationAttempts = resume && !dictationHistory.some(a => a.id === resume.id)
    ? [...dictationHistory, resume] : dictationHistory;

  const resolved = resolveCefr({
    declared: profile?.cefr_declared ?? null,
    measured: profile?.cefr_measured ?? null,
    measuredConfidence: profile?.cefr_measured_confidence ?? 0
  });

  // Unknown remains unknown in the UI; B1 is only a discovery starting point.
  const center = CEFR_LEVELS.indexOf((resolved.level ?? "B1") as (typeof CEFR_LEVELS)[number]);
  const bands = CEFR_LEVELS.slice(Math.max(0, center - 1), center + 2);
  const [library, referenced] = await Promise.all([
    recover("library", listHomeCandidates(db, [...bands]), []),
    recover("record-passages", listHomeRecordPassages(db, dictationAttempts.map(a => a.passage_id)), [])
  ]);
  const toCandidate = (p: HomePassage): CandidatePassage => ({
    id: p.id, title: p.title, band: p.band, topic: p.topic,
    sentenceCount: p.sentence_count, hasSentenceAudio: p.has_sentence_audio === 1
  });
  const candidates = library.map(toCandidate);
  const recordPassages = referenced.map(toCandidate);
  let practice: StarterPractice = { continueAction: null, recommendations: [], alternatives: [] };
  let recent: RecentItem[] = [];

  {
    const records: PracticeRecord[] = [
      ...dictationAttempts.map((a) => ({
        passageId: a.passage_id,
        mode: "dictation" as const,
        status: a.status === "in_progress" ? ("in_progress" as const) : ("completed" as const),
        accuracy: a.accuracy,
        sentencesDone: a.sentences_done,
        createdAt: a.created_at
      })),
      ...readingAttempts.map((a) => ({
        passageId: a.passage_id,
        mode: "reading" as const,
        status: "completed" as const,
        accuracy: (a.overall_score ?? 0) / 100,
        sentencesDone: 0,
        createdAt: a.created_at
      }))
    ];

    const latestDraft = articles[0];
    const draft: WritingDraft | null = latestDraft
      ? {
          articleId: latestDraft.id,
          title: latestDraft.title,
          updatedAt: latestDraft.updated_at ?? latestDraft.created_at
        }
      : null;

    practice = selectStarterPractice({
      level: resolved.level,
      candidates,
      recordPassages,
      records,
      draft,
      attemptCount: profile?.total_attempts ?? 0,
      now: new Date().toISOString()
    });

    // Partial history must not claim that a passage has never been practised.
    if (historyFailed) practice = { ...practice, recommendations: [], alternatives: [] };

    const titleById = new Map(recordPassages.map((c) => [c.id, c.title]));
    const sentenceCountById = new Map(recordPassages.map((c) => [c.id, c.sentenceCount]));

    /*
      One row per material, not per attempt.

      Listing raw attempts spent several rows on one destination: three attempts at one
      passage rendered as three rows whose hrefs were byte-for-byte identical, because these
      links have always addressed the passage, not the attempt. A single attempt is still
      reachable — the passage's history rail addresses it with `?attempt=<id>` — so folding
      here costs no reachability.

      The studio has no cross-tool session entity and deliberately will not grow one
      (ADR 0007), so these rows answer "what material was I working on?" and are named for
      that rather than borrowing Writing's workspace vocabulary.

      Both attempt lists arrive newest-first, so the first row seen for a passage is its
      latest and sets the row's timestamp.
    */
    const byMaterial = new Map<string, RecentItem>();
    const addAttempt = (key: string, item: RecentItem, score: number | null) => {
      const existing = byMaterial.get(key);
      if (!existing) {
        byMaterial.set(key, { ...item, attempts: 1, best: score });
        return;
      }
      existing.attempts += 1;
      if (score != null && (existing.best == null || score > existing.best)) {
        existing.best = score;
      }
    };

    for (const a of dictationAttempts) {
      if (!titleById.has(a.passage_id)) continue;
      addAttempt(
        `dictation:${a.passage_id}`,
        {
          id: `dictation:${a.passage_id}`,
          title: titleById.get(a.passage_id) ?? "Passage",
          mode: "dictation",
          latest:
            a.status === "in_progress"
              ? {
                  kind: "in_progress",
                  done: a.sentences_done,
                  total: sentenceCountById.get(a.passage_id) ?? null
                }
              : { kind: "score", value: Math.round(a.accuracy * 100) },
          href: `/dictation/${a.passage_id}`,
          at: a.created_at,
          attempts: 0,
          best: null
        },
        a.status === "in_progress" ? null : Math.round(a.accuracy * 100)
      );
    }

    for (const a of readingAttempts) {
      addAttempt(
        `reading:${a.passage_id}`,
        {
          id: `reading:${a.passage_id}`,
          title: a.passage_title ?? "Passage",
          mode: "reading",
          latest:
            a.overall_score != null
              ? { kind: "score", value: a.overall_score }
              : { kind: "evaluating" },
          href: `/reading/${a.passage_id}`,
          at: a.created_at,
          attempts: 0,
          best: null
        },
        a.overall_score
      );
    }

    // The passage Continue already shows is not repeated below it (Home v3 §6.3).
    recent = recentWithoutContinue(
      [...byMaterial.values()].sort((x, y) => y.at.localeCompare(x.at)),
      practice.continueAction,
      RECENT_ROWS
    );

  }

  const hasHistory = (profile?.total_attempts ?? 0) > 0 || recent.length > 0;

  // One bounded read for one article: the Writing hero states where its latest round stands
  // (Home v3 §6.2). Nothing records whether feedback was read, so the page never says "unread".
  let writingRound: WritingRoundState | null = null;
  if (practice.continueAction?.kind === "writing") {
    const latest = await recover(
      "writing-round",
      getLatestWritingRevision(db, practice.continueAction.articleId),
      null
    );
    if (latest) writingRound = { round: latest.round_number, feedback: latest.feedback_status };
  }

  return json({
    user: { name: user.name, email: user.email, avatar_url: user.avatar_url },
    firstName: (user.name ?? "").split(" ")[0] || null,
    level: resolved.level,
    levelBasis: resolved.basis,
    levelConfidence: profile?.cefr_measured_confidence ?? 0,
    practice,
    writingRound,
    recent,
    hasHistory,
    degraded,
    profileUnavailable
  });
};


function LevelPicker({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const fetcher = useFetcher<{ ok?: boolean }>();
  const saving = fetcher.state !== "idle";
  return (
    <fetcher.Form
      method="post"
      className={`home-level-picker${compact ? " is-compact" : ""}`}
    >
      <span className="home-level-picker-label">
        {compact ? t("homePage.pickLevel") : t("homePage.orPickLevel")}
      </span>
      {CEFR_LEVELS.map((level) => (
        <button
          key={level}
          type="submit"
          name="level"
          value={level}
          className="home-level-chip"
          disabled={saving}
        >
          {level}
        </button>
      ))}
      <input type="hidden" name="_intent" value="declareLevel" />
    </fetcher.Form>
  );
}

export default function EnglishHome() {
  const {
    user,
    firstName,
    level,
    levelBasis,
    levelConfidence,
    practice,
    writingRound,
    recent,
    hasHistory,
    degraded,
    profileUnavailable
  } = useLoaderData<typeof loader>();
  const t = useT();

  const { continueAction, recommendations, alternatives } = practice;
  const primary = recommendations[0];
  // Cold start is a state, not an error: no level and no history means the grid would be a
  // wall of "no data yet", so the page becomes a single call to action instead (§3.5).
  const isCold = !level && !hasHistory && !profileUnavailable;

  // The level as a compact marker; how it was established is its explanation, shown on hover
  // or focus (Home v3.1 e). Never asserted before it has been established (§3.5). The attempt
  // count is on Progress: it does not change what the learner does next.
  const levelExplanation =
    level == null
      ? null
      : levelBasis === "measured"
        ? t("homePage.levelMeasured", { level, confidence: Math.round(levelConfidence * 100) })
        : t("homePage.levelDeclared", { level });
  const layout = homeLayout({ isCold, continueAction, recommendation: primary, alternatives });
  const buttonClass = (id: Parameters<typeof emphasisOf>[1]) =>
    emphasisOf(layout, id) === "primary" ? "btn btn-primary today-button" : "btn btn-ghost today-button";

  const modeLabel = (mode: "dictation" | "reading") =>
    mode === "dictation" ? t("module.dictation.label") : t("module.reading.label");
  const sentenceText = (count: number) =>
    count === 1 ? t("homePage.sentenceCountOne") : t("homePage.sentenceCount", { count });

  // Name only (Home v3.1 b): what is waiting is already the hero, so the greeting does not
  // repeat it, and a time-of-day greeting would need the learner's clock.
  const description =
    layout.state === "cold"
      ? t("homePage.coldDescription")
      : firstName
        ? t("homePage.welcomeName", { name: firstName })
        : undefined;
  // A reason earns its line only when it explains a choice the learner might not expect.
  const showReason = primary ? primary.reasonKey !== "practice.reason.levelFit" : false;

  const recentState = (item: RecentItem) =>
    item.latest.kind === "score"
      ? item.mode === "dictation"
        ? `${item.latest.value}%`
        : `${item.latest.value}`
      : item.latest.kind === "in_progress"
        ? `${item.latest.done}/${item.latest.total ?? "?"}`
        : t("homePage.evaluating");
  // A bar only where there is a measure: a score, or progress through a known length.
  const recentBar = (item: RecentItem): { width: number; progress: boolean } | null =>
    item.latest.kind === "score"
      ? { width: Math.max(0, Math.min(100, item.latest.value)), progress: false }
      : item.latest.kind === "in_progress" && item.latest.total
        ? { width: Math.round((item.latest.done / item.latest.total) * 100), progress: true }
        : null;

  return (
    <StudioShell user={user}>
      <StudioPage width="wide">
        <StudioPageHeader
          title={t("homePage.title")}
          description={description}
          className="home-page-header"
        />
        <StudioPageBody className="home-page today">

          {degraded ? <p className="home-degraded">{t("homePage.degraded")}</p> : null}

          {layout.state === "cold" ? (
            <section className="today-hero" aria-labelledby="today-hero-title">
              <p className="today-kicker">{t("homePage.startHere")}</p>
              <h2 id="today-hero-title" className="today-title">{t("homePage.coldTitle")}</h2>
              <p className="today-body">{t("homePage.coldBody")}</p>
              <div className="today-actions">
                <Link to="/dictation" className={buttonClass("coldDictation")}>
                  {t("homePage.startDictation")}
                </Link>
              </div>
            </section>
          ) : null}
          {layout.state === "cold" ? <LevelPicker /> : null}

          {layout.state === "continue" && continueAction ? (
            <section className="today-hero" aria-labelledby="today-hero-title">
              <p className="today-kicker">{t("homePage.continueKicker")}</p>
              {/* A passage title is English material; a draft title is the learner's own. */}
              <h2
                id="today-hero-title"
                className="today-title"
                lang={continueAction.kind === "dictation" ? "en" : undefined}
              >
                {continueAction.kind === "writing" && continueAction.untitled
                  ? t("homePage.untitledDraft")
                  : continueAction.title}
              </h2>
              {continueAction.kind === "dictation" ? (
                <>
                  {/* No sentence count: the progress bar carries it. */}
                  <MetaLine
                    parts={[t("module.dictation.label"), [continueAction.band, continueAction.topic]]}
                  />
                  <div
                    className="today-progress"
                    role="img"
                    aria-label={t("homePage.progressLabel", {
                      done: continueAction.done,
                      total: continueAction.total
                    })}
                  >
                    <span className="today-progress-track">
                      <span
                        className="today-progress-fill"
                        style={{ width: `${Math.round((continueAction.done / Math.max(1, continueAction.total)) * 100)}%` }}
                      />
                    </span>
                    <span className="today-progress-count" aria-hidden="true">
                      {continueAction.done} / {continueAction.total}
                    </span>
                  </div>
                  <div className="today-actions">
                    <Link to={continueAction.href} className={buttonClass("continue")}>
                      {t("homePage.continueDictationButton")}
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <MetaLine parts={[t("module.writing.label")]} />
                  <div className="today-actions">
                    <Link to={continueAction.href} className={buttonClass("continue")}>
                      {t("homePage.continueWritingButton")}
                    </Link>
                    <span className="today-aside">
                      {writingRound ? (
                        <>
                          {t(
                            writingRound.feedback === "completed"
                              ? "homePage.writingRoundBack"
                              : writingRound.feedback === "pending"
                                ? "homePage.writingRoundPending"
                                : "homePage.writingRoundFailed",
                            { round: writingRound.round }
                          )}
                          {" · "}
                        </>
                      ) : null}
                      <RichMessage
                        id="homePage.editedAt"
                        values={{ date: <LocalDateTime value={continueAction.updatedAt} /> }}
                      />
                    </span>
                  </div>
                </>
              )}
            </section>
          ) : null}

          {primary && layout.strip ? (
            <section className="today-strip" aria-label={t("homePage.nextKicker")}>
              {/* The whole row is the link (Home v3.1 d); the alternatives sit beside it in a
                  disclosure, not inside it, so no interactive element nests in another. */}
              <Link to={primary.href} className="today-strip-link">
                <span className="today-kicker is-quiet">{t("homePage.nextKicker")}</span>
                <span className="today-strip-title" lang="en">{primary.title}</span>
                <MetaLine
                  parts={[modeLabel(primary.mode), [primary.band, primary.topic], sentenceText(primary.sentenceCount)]}
                />
                {showReason ? (
                  <span className="today-strip-why">{t(primary.reasonKey, primary.reasonVars)}</span>
                ) : null}
                <span className="today-strip-arrow" aria-hidden="true">→</span>
              </Link>
              {alternatives.length > 0 ? (
                <MoreMenu label={t("homePage.adjust")}>
                  {alternatives.map((alt) => (
                    <Link key={alt.direction} to={alt.href} className="today-more-item">
                      {t(`practice.alt.${alt.direction}`)}
                    </Link>
                  ))}
                </MoreMenu>
              ) : null}
            </section>
          ) : null}

          {primary && layout.state === "recommend" ? (
            <section className="today-hero" aria-labelledby="today-recommendation-title">
              <p className="today-kicker">{t("homePage.recommendation")}</p>
              <h2 id="today-recommendation-title" className="today-title" lang="en">
                {primary.title}
              </h2>
              <MetaLine
                parts={[modeLabel(primary.mode), [primary.band, primary.topic], sentenceText(primary.sentenceCount)]}
              />
              {showReason ? (
                <p className="today-body">{t(primary.reasonKey, primary.reasonVars)}</p>
              ) : null}
              <div className="today-actions">
                <Link to={primary.href} className={buttonClass("recommendation")}>
                  {primary.mode === "dictation" ? t("homePage.startDictation") : t("homePage.startReading")}
                </Link>
                {alternatives.length > 0 ? (
                  <div className="today-alternatives" aria-label={t("homePage.adjust")}>
                    {/* Visible here: as the hero, these are how a learner chooses to explore
                        another band (ADR 0006), not an afterthought. */}
                    {alternatives.map((alt) => (
                      <Link key={alt.direction} to={alt.href} className="today-alternative">
                        {t(`practice.alt.${alt.direction}`)}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {layout.state === "choose" ? (
            <section className="today-hero" aria-labelledby="today-hero-title">
              <p className="today-kicker">{t("homePage.practice")}</p>
              <h2 id="today-hero-title" className="today-title">{t("homePage.chooseTitle")}</h2>
              <p className="today-body">{t("homePage.chooseBody")}</p>
              <div className="today-actions">
                <Link to="/dictation" className={buttonClass("chooseDictation")}>
                  {t("module.dictation.label")}
                </Link>
                <Link to="/reading" className={buttonClass("chooseReading")}>
                  {t("module.reading.label")}
                </Link>
              </div>
            </section>
          ) : null}

          {layout.state === "cold" ? null : (
            <>
              {/*
                The status grid used to live here. It now lives on /english/progress: Home is
                where the loop restarts, so its data only says what the recommendation above
                is worth (ia-v2 §3.3).
              */}
              <section className="today-basis" aria-label={t("homePage.basisLabel")}>
                {profileUnavailable ? (
                  <p className="home-basis-line">{t("homePage.basisUnavailable")}</p>
                ) : levelExplanation ? (
                  <span className="today-level">
                    <button
                      type="button"
                      className="today-level-chip"
                      aria-describedby="today-level-explanation"
                    >
                      {level}
                    </button>
                    <span id="today-level-explanation" role="tooltip" className="today-level-tip">
                      {levelExplanation}
                    </span>
                  </span>
                ) : (
                  <span />
                )}
                <Link to="/english/progress" className="home-basis-more">
                  {t("homePage.fullProgress")}
                </Link>
              </section>

              {level == null && !profileUnavailable ? <LevelPicker compact /> : null}

              {recent.length > 0 ? (
                <section className="today-recent" aria-label={t("homePage.recentLabel")}>
                  <p className="today-kicker is-quiet">{t("homePage.recent")}</p>
                  <div className="today-recent-list">
                    {recent.map((item) => {
                      const bar = recentBar(item);
                      return (
                        <Link key={item.id} to={item.href} className="today-recent-row">
                          <span className="today-recent-copy">
                            <span className="today-recent-title" lang="en">{item.title}</span>
                            <span className="today-recent-meta">
                              {item.attempts > 1
                                ? [
                                    modeLabel(item.mode),
                                    item.best != null
                                      ? t("homePage.attemptsBest", { count: item.attempts, best: item.best })
                                      : t("homePage.attempts", { count: item.attempts })
                                  ].join(" · ")
                                : modeLabel(item.mode)}
                            </span>
                          </span>
                          <span className="today-recent-bar" aria-hidden="true">
                            {bar ? (
                              <span
                                className={bar.progress ? "today-recent-fill is-progress" : "today-recent-fill"}
                                style={{ width: `${bar.width}%` }}
                              />
                            ) : null}
                          </span>
                          <span className="today-recent-value">{recentState(item)}</span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </StudioPageBody>
      </StudioPage>
    </StudioShell>
  );
}

/**
 * A `···` disclosure that behaves like a menu: it closes on a click or tap outside it, on
 * Escape (returning focus to the toggle), and once a choice is made. Native `<details>` keeps it
 * working without JavaScript; this only adds the dismissal a menu is expected to have.
 */
function MoreMenu({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDetailsElement | null>(null);

  React.useEffect(() => {
    const close = (event: Event) => {
      const details = ref.current;
      if (!details?.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        details.open = false;
        details.querySelector("summary")?.focus();
        return;
      }
      if (event.target instanceof Node && details.contains(event.target)) return;
      details.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details ref={ref} className="today-more">
      <summary className="today-more-toggle" aria-label={label}>
        <span aria-hidden="true">···</span>
      </summary>
      <div
        className="today-more-menu"
        onClick={() => {
          if (ref.current) ref.current.open = false;
        }}
      >
        {children}
      </div>
    </details>
  );
}

/**
 * The hero's meta line: mode / band · topic / length (design §5.2). A part that is an array is
 * joined with " · " and dropped when all its values are missing, so an absent topic leaves no
 * stray separator.
 */
function MetaLine({ parts }: { parts: Array<string | Array<string | null>> }) {
  const segments = parts
    .map((part) => (Array.isArray(part) ? part.filter(Boolean).join(" · ") : part))
    .filter((segment) => segment.length > 0);
  return <p className="today-meta">{segments.join(" / ")}</p>;
}
