import * as React from "react";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import {
  getEslLearnerProfile,
  listLibraryPassages,
  listPassagesByUser,
  listReadingPassageStatsByUser,
  listRecentReadingAttempts
} from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { resolveCefr } from "~/utils/learner-model";
import { LocalDateTime } from "~/components/LocalDateTime";
import { StudioPage, StudioPageBody, StudioPageHeader } from "~/components/StudioPage";
import { ConfirmSubmitButton } from "~/components/ConfirmDialog";
import { useT } from "~/i18n/context";
import { metaTranslator } from "~/i18n/meta";

/**
 * Reading catalogue. Design: `docs/english-studio-ia-v2-design.md` §3.7.
 *
 * Graded library is the main axis, grouped by band. The learner's own band opens first and
 * is marked; the others are folded but **never locked** — the level estimate is itself
 * uncertain, learners have good reasons to want easier or harder material, and CEFR
 * confidence depends on practising more than one band, so making other levels feel
 * off-limits would starve the estimator.
 *
 * What the learner has done is **card state**, not a separate "completed" section. Their own
 * pasted texts are a visible secondary section: they carry no band or tags, cannot be
 * dictated, and feed no mastery, so they are not merged into the library's space.
 */

export const meta: MetaFunction = ({ matches }) => [
  { title: metaTranslator(matches)("meta.reading.title") }
];

const BAND_ORDER = ["A2", "B1", "B2", "C1"] as const;

/** The workspace shows a short re-entry list; the full history lives on Progress. */
const RECENT_ROWS = 4;
/** Attempts to scan for those rows: they fold to one row per passage, so fetch more. */
const RECENT_ATTEMPT_SCAN = 24;

type CardState =
  | { kind: "new" }
  | { kind: "pending" }
  | { kind: "scored"; best: number; attempts: number };

type PassageCard = {
  id: string;
  title: string;
  topic: string | null;
  wordCount: number;
  hasSentenceAudio: boolean;
  state: CardState;
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const db = context.env.DB;

  const [library, own, stats, profile, recentAttempts] = await Promise.all([
    listLibraryPassages(db),
    listPassagesByUser(db, user.id),
    listReadingPassageStatsByUser(db, user.id),
    getEslLearnerProfile(db, user.id),
    listRecentReadingAttempts(db, { userId: user.id, limit: RECENT_ATTEMPT_SCAN })
  ]);

  const statByPassage = new Map(stats.map((s) => [s.passage_id, s]));
  const toState = (passageId: string): CardState => {
    const stat = statByPassage.get(passageId);
    if (!stat || stat.attempts === 0) return { kind: "new" };
    if (stat.best_score == null) return { kind: "pending" };
    return { kind: "scored", best: Math.round(stat.best_score), attempts: stat.attempts };
  };

  // Structured data only: the page words it in the visitor's interface language.
  const bands = BAND_ORDER.map((band) => ({
    band,
    passages: library
      .filter((passage) => passage.band === band)
      .map<PassageCard>((passage) => ({
        id: passage.id,
        title: passage.title,
        topic: passage.topic,
        wordCount: passage.word_count,
        hasSentenceAudio: passage.has_sentence_audio === 1,
        state: toState(passage.id)
      }))
  })).filter((group) => group.passages.length > 0);

  const resolved = resolveCefr({
    declared: profile?.cefr_declared ?? null,
    measured: profile?.cefr_measured ?? null,
    measuredConfidence: profile?.cefr_measured_confidence ?? 0
  });

  return json({
    bands,
    // Null when no level is established — the UI must not mark a band as "yours" on a
    // level the system has not actually determined.
    yourBand: resolved.level,
    own: own.map((passage) => ({
      id: passage.id,
      title: passage.title,
      wordCount: passage.word_count,
      state: toState(passage.id)
    })),
    // Recent practice, so the tool workspace answers "what was I doing?" without a trip
    // to Progress — the section Writing's hub has and this page did not.
    //
    // One row per material, not per attempt: these links address the passage anyway, and
    // the studio grows no cross-tool session entity (ADR 0007). `stats` already carries the
    // per-passage counts, so folding needs no extra query. Attempts arrive newest-first, so
    // the first row seen for a passage sets the row's timestamp.
    recent: recentAttempts
      .filter((attempt, index, all) =>
        all.findIndex((other) => other.passage_id === attempt.passage_id) === index
      )
      .slice(0, RECENT_ROWS)
      .map((attempt) => {
        const stat = statByPassage.get(attempt.passage_id);
        return {
          id: attempt.passage_id,
          passageId: attempt.passage_id,
          title: attempt.passage_title ?? "Passage",
          attempts: stat?.attempts ?? 1,
          best: stat?.best_score != null ? Math.round(stat.best_score) : null,
          latestScore: attempt.overall_score,
          at: attempt.created_at
        };
      })
  });
};

function StateLabel({ state }: { state: CardState }) {
  const t = useT();
  if (state.kind === "new") return <span className="studio-row-state">{t("reading.notStarted")}</span>;
  if (state.kind === "pending") {
    return <span className="studio-row-state is-pending">{t("reading.evaluating")}</span>;
  }
  return (
    <span className="studio-row-state is-scored">
      {state.attempts > 1
        ? t("reading.bestAttempts", { best: state.best, count: state.attempts })
        : t("reading.best", { best: state.best })}
    </span>
  );
}

function PassageGrid({ passages }: { passages: PassageCard[] }) {
  const t = useT();
  return (
    // Rows, not cards: the band header already carries the level, so each entry
    // only has to be scannable against its siblings.
    <div className="studio-row-list">
      {passages.map((passage) => (
        <Link key={passage.id} to={`/reading/${passage.id}`} className="studio-row">
          <span className="studio-row-meta">
            <span lang="en">{passage.topic}</span>
            {passage.wordCount > 0 ? <span>{t("reading.words", { count: passage.wordCount })}</span> : null}
          </span>
          <strong lang="en">{passage.title}</strong>
          <StateLabel state={passage.state} />
          <span className="studio-row-arrow" aria-hidden="true">→</span>
        </Link>
      ))}
    </div>
  );
}

export default function ReadingCatalogue() {
  const { bands, yourBand, own, recent } = useLoaderData<typeof loader>();
  const t = useT();

  // Your band opens; the rest are folded. Folded, never locked.
  const [openBands, setOpenBands] = React.useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const group of bands) {
      initial[group.band] = yourBand ? group.band === yourBand : true;
    }
    return initial;
  });

  const toggle = (band: string) =>
    setOpenBands((current) => ({ ...current, [band]: !current[band] }));

  return (
    <StudioPage width="wide">
      <StudioPageHeader
        title={t("reading.title")}
        description={t("reading.description")}
        action={
          <Link to="/reading/new" className="btn btn-primary btn-sm">
            {t("reading.addText")}
          </Link>
        }
      />

      <StudioPageBody className="passage-catalogue">
        {recent.length > 0 ? (
          <section className="passage-recent" aria-labelledby="reading-recent-heading">
            <div className="studio-section-head">
              <div>
                <p className="studio-section-eyebrow">{t("reading.workspace")}</p>
                <h2 id="reading-recent-heading" className="studio-section-title">
                  {t("reading.recent")}
                </h2>
              </div>
              <Link to="/reading/progress" className="studio-section-more">
                {t("reading.allProgress")}
              </Link>
            </div>
            <div className="studio-row-list">
              {recent.map((item) => (
                <Link key={item.id} to={`/reading/${item.passageId}`} className="studio-row">
                  <span className="studio-row-meta">
                    <LocalDateTime
                      value={item.at}
                      options={{ month: "short", day: "numeric" }}
                    />
                  </span>
                  <strong lang="en">{item.title}</strong>
                  <span className="studio-row-state">
                    {/* Repeated work is the story here; a single run has none to tell. */}
                    {item.attempts > 1
                      ? item.best != null
                        ? t("reading.attemptsBest", { count: item.attempts, best: item.best })
                        : t("reading.attempts", { count: item.attempts })
                      : item.latestScore != null
                        ? `${item.latestScore}`
                        : t("reading.evaluating")}
                  </span>
                  <span className="studio-row-arrow" aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {bands.map((group) => {
        const isOpen = openBands[group.band] ?? false;
        const isYours = yourBand === group.band;
        return (
          <section key={group.band} className={`passage-band${isOpen ? " is-open" : ""}`}>
            <button
              type="button"
              className="passage-band-header"
              aria-expanded={isOpen}
              onClick={() => toggle(group.band)}
            >
              <span className="passage-band-title">{group.band}</span>
              {/* Same band descriptions as Dictation: one library, one wording. */}
              <span className="passage-band-blurb">{t(`dictation.band.${group.band}`)}</span>
              {isYours ? <span className="passage-band-yours">{t("reading.yourLevel")}</span> : null}
              <span className="passage-band-count">
                {t(group.passages.length === 1 ? "reading.passageOne" : "reading.passageMany", {
                  count: group.passages.length
                })}
              </span>
              <span className="passage-band-caret" aria-hidden="true">
                {isOpen ? "−" : "+"}
              </span>
            </button>
            {isOpen ? (
              <div className="passage-band-body">
                <PassageGrid passages={group.passages} />
              </div>
            ) : null}
          </section>
        );
      })}

        <section className="passage-own">
        <div className="passage-own-header">
          <div>
            <h2 className="passage-own-title">{t("reading.yourTexts")}</h2>
            <p className="passage-own-blurb">{t("reading.yourTextsBlurb")}</p>
          </div>
        </div>
        {own.length === 0 ? (
          <p className="passage-own-empty">{t("reading.noOwnTexts")}</p>
        ) : (
          <div className="studio-row-list">
            {own.map((passage) => (
              <div key={passage.id} className="passage-own-item">
                <Link to={`/reading/${passage.id}`} className="studio-row">
                  <span className="studio-row-meta">
                    <span>{t("reading.yourText")}</span>
                    {passage.wordCount > 0 ? <span>{t("reading.words", { count: passage.wordCount })}</span> : null}
                  </span>
                  <strong>{passage.title}</strong>
                  <StateLabel state={passage.state} />
                  <span className="studio-row-arrow" aria-hidden="true">→</span>
                </Link>
                {/* Delete used to live in the rail's passage list. The rail no longer lists
                    passages, so the affordance moves here rather than disappearing. */}
                <form method="post" action={`/reading/${passage.id}`}>
                  <input type="hidden" name="_intent" value="deletePassage" />
                  <ConfirmSubmitButton
                    className="passage-own-delete"
                    dialogTitle={t("reading.deleteTextTitle")}
                    dialogDescription={t("reading.deleteTextDescription")}
                  >
                    {t("common.delete")}
                  </ConfirmSubmitButton>
                </form>
              </div>
            ))}
          </div>
        )}
        </section>
      </StudioPageBody>
    </StudioPage>
  );
}
