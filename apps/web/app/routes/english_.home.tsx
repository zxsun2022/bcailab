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
      attemptCount: profile?.total_attempts ?? 0
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

    recent = [...byMaterial.values()]
      .sort((x, y) => y.at.localeCompare(x.at))
      .slice(0, RECENT_ROWS);

  }

  const hasHistory = (profile?.total_attempts ?? 0) > 0 || recent.length > 0;

  return json({
    user: { name: user.name, email: user.email, avatar_url: user.avatar_url },
    firstName: (user.name ?? "").split(" ")[0] || null,
    level: resolved.level,
    levelBasis: resolved.basis,
    levelConfidence: profile?.cefr_measured_confidence ?? 0,
    totalAttempts: profile?.total_attempts ?? 0,
    practice,
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
    totalAttempts,
    practice,
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

  // One line, not a grid. It states what the system knows and how far to trust it; the
  // level is never asserted before it has been established (§3.5).
  //
  // "Attempts", not "sessions": this counts `total_attempts`, and the studio has no session
  // entity outside Writing's own workspace vocabulary (ADR 0007).
  //
  // Attempt count only. Duration used to sit here too, when `total_practice_seconds` counted
  // reading alone and silently omitted dictation. Dictation is timed now, but the count
  // still carries this line's whole job; the duration detail belongs on Progress.
  const volumeText = t(totalAttempts === 1 ? "homePage.attemptOne" : "homePage.attemptMany", {
    count: totalAttempts
  });
  const basisSentence =
    profileUnavailable
      ? t("homePage.basisUnavailable")
      : level == null
      ? t("homePage.basisNoLevel", { volume: volumeText })
      : levelBasis === "measured"
        ? t("homePage.basisMeasured", {
            level,
            confidence: Math.round(levelConfidence * 100),
            volume: volumeText
          })
        : t("homePage.basisDeclared", { level, volume: volumeText });
  const recentState = (item: RecentItem) =>
    item.latest.kind === "score"
      ? item.mode === "dictation"
        ? `${item.latest.value}%`
        : `${item.latest.value}`
      : item.latest.kind === "in_progress"
        ? t("homePage.inProgress", { done: item.latest.done, total: item.latest.total ?? "?" })
        : t("homePage.evaluating");

  return (
    <StudioShell user={user}>
      <StudioPage width="wide">
        <StudioPageHeader
          title={t("homePage.title")}
          description={
            isCold
              ? t("homePage.coldDescription")
              : firstName
                ? t("homePage.greeting", { name: firstName })
                : t("homePage.description")
          }
          className="home-page-header"
        />
        <StudioPageBody className="home-page">

      {degraded ? (
        <p className="home-degraded">
          {t("homePage.degraded")}
        </p>
      ) : null}

      {isCold ? (
        <section className="home-cold">
          <div className="home-focus-primary">
            <p className="home-card-kicker">{t("homePage.startHere")}</p>
            <h2 className="home-card-title">{t("homePage.coldTitle")}</h2>
            <p className="home-card-meta">{t("homePage.coldBody")}</p>
            <div className="home-card-actions">
              <Link to="/dictation" className="btn btn-primary">
                {t("homePage.startDictation")}
              </Link>
            </div>
          </div>
          <LevelPicker />
        </section>
      ) : (
        <>
          <section
            className={`home-actions${continueAction && primary ? "" : " is-single"}`}
            aria-label={t("homePage.whatToDo")}
          >
            {continueAction ? (
              <article className="home-focus-primary">
                <p className="home-card-kicker">{t("homePage.continue")}</p>
                {/* A passage title is English material; a draft title is the learner's own. */}
                <h2 className="home-card-title" lang={continueAction.kind === "dictation" ? "en" : undefined}>
                  {continueAction.kind === "writing" && continueAction.untitled
                    ? t("homePage.untitledDraft")
                    : continueAction.title}
                </h2>
                <p className="home-card-meta">
                  {continueAction.kind === "dictation"
                    ? t("homePage.continueDictation", {
                        done: continueAction.done,
                        total: continueAction.total
                      })
                    : (
                      <RichMessage
                        id="homePage.continueWriting"
                        values={{ date: <LocalDateTime value={continueAction.updatedAt} /> }}
                      />
                    )}
                </p>
                <div className="home-card-actions">
                  <Link to={continueAction.href} className="btn btn-primary">
                    {t("homePage.continue")}
                  </Link>
                </div>
              </article>
            ) : null}

            {primary ? (
              <article className={continueAction ? "home-focus-secondary" : "home-focus-primary"}>
                <p className="home-card-kicker">{t("homePage.recommendation")}</p>
                <h2 className="home-card-title" lang="en">{primary.title}</h2>
                <p className="home-card-meta">
                  {primary.band ? <>{primary.band} · </> : null}
                  {primary.topic ? <><span lang="en">{primary.topic}</span> · </> : null}
                  {primary.mode === "dictation" ? t("module.dictation.label") : t("homePage.readAloud")}
                </p>
                <p className="home-card-why">{t(primary.reasonKey, primary.reasonVars)}</p>
                <div className="home-card-actions">
                  <Link to={primary.href} className={`btn ${continueAction ? "btn-ghost" : "btn-primary"}`}>
                    {t("homePage.start")}
                  </Link>
                </div>
                {alternatives.length > 0 ? (
                  <div className="home-card-alternatives" aria-label={t("homePage.adjust")}>
                    {/* Directional, never a reshuffle: each swap is a choice the learner can
                        reason about, and is only rendered when such material exists. */}
                    {alternatives.map((alt) => (
                      <Link key={alt.direction} to={alt.href} className="studio-link-secondary">
                        {t(`practice.alt.${alt.direction}`)}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </article>
            ) : null}

            {!continueAction && !primary ? (
              <article className="home-focus-primary">
                <p className="home-card-kicker">{t("homePage.practice")}</p>
                <h2 className="home-card-title">{t("homePage.chooseTitle")}</h2>
                <p className="home-card-meta">{t("homePage.chooseBody")}</p>
                <div className="home-card-actions">
                  <Link to="/dictation" className="btn btn-primary">
                    {t("module.dictation.label")}
                  </Link>
                  <Link to="/reading" className="btn btn-ghost btn-sm">
                    {t("module.reading.label")}
                  </Link>
                </div>
              </article>
            ) : null}
          </section>

          {/*
            The status grid used to live here. It now lives on /english/progress.

            Home is where the loop restarts, so the only job this data has on this page is
            to say what the recommendation above is worth — the IA calls the grid evidence
            for the recommendation, not the front page (ia-v2 §3.3). Rendered as a grid it
            outweighed the recommendation while saying almost nothing, because the model
            needs several attempts before panels mean anything (ia-v2 §5.1).
          */}
          <section className="home-basis" aria-label={t("homePage.basisLabel")}>
            <p className="home-basis-line">{basisSentence}</p>
            <Link to="/english/progress" className="home-basis-more">
              {t("homePage.fullProgress")}
            </Link>
          </section>

          {level == null && !profileUnavailable ? <LevelPicker compact /> : null}

          {recent.length > 0 ? (
            <section className="home-recent-section" aria-label={t("homePage.recentLabel")}>
              <div className="home-panel-head">
                <span className="home-panel-title">{t("homePage.recent")}</span>
              </div>
              <div className="home-recent">
                {recent.map((item) => (
                  <Link key={item.id} to={item.href} className="home-recent-row">
                    <span className="home-recent-title" lang="en">{item.title}</span>
                    <span className="home-recent-meta">
                      {[
                        item.mode === "dictation" ? t("module.dictation.label") : t("module.reading.label"),
                        // Repeated work is the story here; a single run has none to tell.
                        item.attempts > 1
                          ? item.best != null
                            ? t("homePage.attemptsBest", { count: item.attempts, best: item.best })
                            : t("homePage.attempts", { count: item.attempts })
                          : recentState(item)
                      ].join(" · ")}
                    </span>
                  </Link>
                ))}
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
