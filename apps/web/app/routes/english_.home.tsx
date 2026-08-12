import * as React from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useFetcher, useLoaderData } from "@remix-run/react";
import {
  getEslLearnerProfile,
  listDictationAttemptsByUser,
  listLibraryPassages,
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

export const meta: MetaFunction = () => [{ title: "English Studio · bcailab" }];

/** Bounded inputs. The Home is a summary; depth belongs on the progress page. */
const LIBRARY_LIMIT = 60;
const DICTATION_HISTORY_LIMIT = 40;
const READING_HISTORY_LIMIT = 20;
const WRITING_HISTORY_LIMIT = 1;
const RECENT_ROWS = 3;

type RecentItem = { id: string; title: string; meta: string; href: string; at: string };

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const user = await requireUser(request, context);
  const formData = await request.formData();
  if (String(formData.get("_intent")) !== "declareLevel") {
    return json({ ok: false, error: "Unsupported action." }, { status: 400 });
  }
  const level = String(formData.get("level") ?? "");
  if (!CEFR_LEVELS.includes(level as (typeof CEFR_LEVELS)[number])) {
    return json({ ok: false, error: "Unknown level." }, { status: 400 });
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

  const [library, profile] = await Promise.all([
    listLibraryPassages(db, { limit: LIBRARY_LIMIT }),
    getEslLearnerProfile(db, user.id)
  ]);

  const candidates: CandidatePassage[] = library.map((p) => ({
    id: p.id,
    title: p.title,
    band: p.band,
    topic: p.topic,
    sentenceCount: p.sentence_count,
    hasSentenceAudio: p.has_sentence_audio === 1
  }));

  const resolved = resolveCefr({
    declared: profile?.cefr_declared ?? null,
    measured: profile?.cefr_measured ?? null,
    measuredConfidence: profile?.cefr_measured_confidence ?? 0
  });

  // Personalisation is the part that can fail. If it does, the Home still renders as a
  // launcher rather than an error page or a blank screen.
  let practice: StarterPractice = { continueAction: null, recommendations: [], alternatives: [] };
  let recent: RecentItem[] = [];
  let degraded = false;

  try {
    const [dictationAttempts, readingAttempts, articles] = await Promise.all([
      listDictationAttemptsByUser(db, { userId: user.id, limit: DICTATION_HISTORY_LIMIT }),
      listRecentReadingAttempts(db, { userId: user.id, limit: READING_HISTORY_LIMIT }),
      listRecentWritingArticlesByUser(db, {
        userId: user.id,
        limit: WRITING_HISTORY_LIMIT
      })
    ]);

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
      records,
      draft,
      attemptCount: profile?.total_attempts ?? 0
    });

    const titleById = new Map(candidates.map((c) => [c.id, c.title]));
    recent = [
      ...dictationAttempts.map((a) => ({
        id: a.id,
        title: titleById.get(a.passage_id) ?? "Passage",
        meta:
          a.status === "in_progress"
            ? `Dictation · ${a.sentences_done}/${titleById.has(a.passage_id) ? candidates.find((c) => c.id === a.passage_id)!.sentenceCount : "?"}`
            : `Dictation · ${Math.round(a.accuracy * 100)}%`,
        href: `/dictation/${a.passage_id}`,
        at: a.created_at
      })),
      ...readingAttempts.map((a) => ({
        id: a.id,
        title: a.passage_title ?? "Passage",
        meta: a.overall_score != null ? `Reading · ${a.overall_score}` : "Reading · pending",
        href: `/reading/${a.passage_id}`,
        at: a.created_at
      }))
    ]
      .sort((x, y) => y.at.localeCompare(x.at))
      .slice(0, RECENT_ROWS);

  } catch (error) {
    console.error("english home personalisation failed:", error);
    degraded = true;
  }

  const hasHistory = (profile?.total_attempts ?? 0) > 0 || recent.length > 0;

  return json({
    user: { name: user.name, email: user.email, avatar_url: user.avatar_url },
    firstName: (user.name ?? "").split(" ")[0] || null,
    level: resolved.level,
    levelBasis: resolved.basis,
    levelConfidence: profile?.cefr_measured_confidence ?? 0,
    totalAttempts: profile?.total_attempts ?? 0,
    totalPracticeSeconds: profile?.total_practice_seconds ?? 0,
    practice,
    recent,
    hasHistory,
    degraded
  });
};

function formatPracticeTime(seconds: number): string {
  if (seconds <= 0) return "0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

function LevelPicker({ compact = false }: { compact?: boolean }) {
  const fetcher = useFetcher<{ ok?: boolean }>();
  const saving = fetcher.state !== "idle";
  return (
    <fetcher.Form
      method="post"
      className={`home-level-picker${compact ? " is-compact" : ""}`}
    >
      <span className="home-level-picker-label">
        {compact ? "Pick your level" : "Or pick your level:"}
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
    totalPracticeSeconds,
    practice,
    recent,
    hasHistory,
    degraded
  } = useLoaderData<typeof loader>();

  const { continueAction, recommendations, alternatives } = practice;
  const primary = recommendations[0];
  // Cold start is a state, not an error: no level and no history means the grid would be a
  // wall of "no data yet", so the page becomes a single call to action instead (§3.5).
  const isCold = !level && !hasHistory;

  // One line, not a grid. It states what the system knows and how far to trust it; the
  // level is never asserted before it has been established (§3.5).
  const sessionText =
    totalAttempts === 1 ? "1 recorded session" : `${totalAttempts} recorded sessions`;
  const volumeText =
    totalPracticeSeconds > 0
      ? `${sessionText} · ${formatPracticeTime(totalPracticeSeconds)}`
      : sessionText;
  const basisSentence =
    level == null
      ? `${volumeText} so far — not enough yet to estimate your level.`
      : levelBasis === "measured"
        ? `Level ${level}, measured from your dictation accuracy at ${Math.round(levelConfidence * 100)}% confidence · ${volumeText}`
        : `Level ${level} — the level you picked; it adjusts as you practise · ${volumeText}`;

  return (
    <StudioShell user={user}>
      <StudioPage width="wide">
        <StudioPageHeader
          title="Today"
          description={
            isCold
              ? "Let's find your level — it takes about three minutes."
              : firstName
                ? `Good to see you, ${firstName}. Pick up one useful piece of practice.`
                : "Pick up one useful piece of practice."
          }
          className="home-page-header"
        />
        <StudioPageBody className="home-page">

      {degraded ? (
        <p className="home-degraded">
          We couldn&rsquo;t load your practice data just now. Everything below still works.
        </p>
      ) : null}

      {isCold ? (
        <section className="home-cold">
          <div className="home-focus-primary">
            <p className="home-card-kicker">Start here</p>
            <h2 className="home-card-title">Take one dictation passage</h2>
            <p className="home-card-meta">
              About three minutes. It is normal practice — and it doubles as a level check,
              so the studio can suggest the right material next.
            </p>
            <div className="home-card-actions">
              <Link to="/dictation" className="btn btn-primary">
                Start dictation
              </Link>
            </div>
          </div>
          <LevelPicker />
        </section>
      ) : (
        <>
          <section
            className={`home-actions${continueAction && primary ? "" : " is-single"}`}
            aria-label="What to do now"
          >
            {continueAction ? (
              <article className="home-focus-primary">
                <p className="home-card-kicker">Continue</p>
                <h2 className="home-card-title">{continueAction.title}</h2>
                <p className="home-card-meta">
                  {continueAction.kind === "dictation"
                    ? `Dictation · ${continueAction.done} of ${continueAction.total} sentences`
                    : (
                      <>
                        Writing · edited <LocalDateTime value={continueAction.updatedAt} />
                      </>
                    )}
                </p>
                <div className="home-card-actions">
                  <Link to={continueAction.href} className="btn btn-primary">
                    Continue
                  </Link>
                </div>
              </article>
            ) : null}

            {primary ? (
              <article className={continueAction ? "home-focus-secondary" : "home-focus-primary"}>
                <p className="home-card-kicker">Coach recommendation</p>
                <h2 className="home-card-title">{primary.title}</h2>
                <p className="home-card-meta">
                  {[
                    primary.band,
                    primary.topic,
                    primary.mode === "dictation" ? "Dictation" : "Read aloud"
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="home-card-why">{primary.reason}</p>
                <div className="home-card-actions">
                  <Link to={primary.href} className="btn btn-primary">
                    Start
                  </Link>
                </div>
                {alternatives.length > 0 ? (
                  <div className="home-card-alternatives" aria-label="Adjust recommendation">
                    {/* Directional, never a reshuffle: each swap is a choice the learner can
                        reason about, and is only rendered when such material exists. */}
                    {alternatives.map((alt) => (
                      <Link key={alt.direction} to={alt.href} className="studio-link-secondary">
                        {alt.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </article>
            ) : null}

            {!continueAction && !primary ? (
              <article className="home-focus-primary">
                <p className="home-card-kicker">Practice</p>
                <h2 className="home-card-title">Choose what to work on</h2>
                <p className="home-card-meta">
                  Pick a module from the left to keep going.
                </p>
                <div className="home-card-actions">
                  <Link to="/dictation" className="btn btn-primary">
                    Dictation
                  </Link>
                  <Link to="/reading" className="btn btn-ghost btn-sm">
                    Reading
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
          <section className="home-basis" aria-label="What this is based on">
            <p className="home-basis-line">{basisSentence}</p>
            <Link to="/english/progress" className="home-basis-more">
              Full progress &rarr;
            </Link>
          </section>

          {level == null ? <LevelPicker compact /> : null}

          {recent.length > 0 ? (
            <section className="home-recent-section" aria-label="Recent practice">
              <div className="home-panel-head">
                <span className="home-panel-title">Recent</span>
              </div>
              <div className="home-recent">
                {recent.map((item) => (
                  <Link key={item.id} to={item.href} className="home-recent-row">
                    <span className="home-recent-title">{item.title}</span>
                    <span className="home-recent-meta">{item.meta}</span>
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
