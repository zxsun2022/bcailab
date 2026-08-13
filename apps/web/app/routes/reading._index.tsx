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

export const meta: MetaFunction = () => [{ title: "Reading · bcailab" }];

const BAND_ORDER = ["A2", "B1", "B2", "C1"] as const;

/** The workspace shows a short re-entry list; the full history lives on Progress. */
const RECENT_ROWS = 4;
/** Attempts to scan for those rows: they fold to one row per passage, so fetch more. */
const RECENT_ATTEMPT_SCAN = 24;

const BAND_BLURB: Record<string, string> = {
  A2: "Short everyday sentences, simple tenses.",
  B1: "Everyday narrative with common connectors.",
  B2: "Varied tenses, opinion and contrast.",
  C1: "Complex sentences and nuanced vocabulary."
};

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

  const bands = BAND_ORDER.map((band) => ({
    band,
    blurb: BAND_BLURB[band] ?? "",
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
          latest: attempt.overall_score != null ? `${attempt.overall_score}` : "Evaluating…",
          at: attempt.created_at
        };
      })
  });
};

function StateLabel({ state }: { state: CardState }) {
  if (state.kind === "new") return <span className="studio-row-state">Not started</span>;
  if (state.kind === "pending") {
    return <span className="studio-row-state is-pending">Evaluating…</span>;
  }
  return (
    <span className="studio-row-state is-scored">
      Best {state.best}
      {state.attempts > 1 ? ` · ${state.attempts} attempts` : ""}
    </span>
  );
}

function PassageGrid({ passages }: { passages: PassageCard[] }) {
  return (
    // Rows, not cards: the band header already carries the level, so each entry
    // only has to be scannable against its siblings.
    <div className="studio-row-list">
      {passages.map((passage) => (
        <Link key={passage.id} to={`/reading/${passage.id}`} className="studio-row">
          <span className="studio-row-meta">
            <span>{passage.topic}</span>
            {passage.wordCount > 0 ? <span>{passage.wordCount} words</span> : null}
          </span>
          <strong>{passage.title}</strong>
          <StateLabel state={passage.state} />
          <span className="studio-row-arrow" aria-hidden="true">→</span>
        </Link>
      ))}
    </div>
  );
}

export default function ReadingCatalogue() {
  const { bands, yourBand, own, recent } = useLoaderData<typeof loader>();

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
        title="Reading"
        description="Read a passage aloud and get feedback on pronunciation, fluency, rhythm, and clarity. Any level is open — practising a step above or below is useful, and it sharpens your level estimate."
        action={
          <Link to="/reading/new" className="btn btn-primary btn-sm">
            Add text
          </Link>
        }
      />

      <StudioPageBody className="passage-catalogue">
        {recent.length > 0 ? (
          <section className="passage-recent" aria-labelledby="reading-recent-heading">
            <div className="studio-section-head">
              <div>
                <p className="studio-section-eyebrow">Your workspace</p>
                <h2 id="reading-recent-heading" className="studio-section-title">
                  Recent practice
                </h2>
              </div>
              <Link to="/reading/progress" className="studio-section-more">
                All reading progress &rarr;
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
                  <strong>{item.title}</strong>
                  <span className="studio-row-state">
                    {/* Repeated work is the story here; a single run has none to tell. */}
                    {item.attempts > 1
                      ? `${item.attempts} attempts${item.best != null ? ` · best ${item.best}` : ""}`
                      : item.latest}
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
              <span className="passage-band-blurb">{group.blurb}</span>
              {isYours ? <span className="passage-band-yours">Your level</span> : null}
              <span className="passage-band-count">
                {group.passages.length} {group.passages.length === 1 ? "passage" : "passages"}
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
            <h2 className="passage-own-title">Your texts</h2>
            <p className="passage-own-blurb">
              Anything you paste in. These are not graded and cannot be used for dictation,
              so they do not feed your ability profile.
            </p>
          </div>
        </div>
        {own.length === 0 ? (
          <p className="passage-own-empty">No texts of your own yet.</p>
        ) : (
          <div className="studio-row-list">
            {own.map((passage) => (
              <div key={passage.id} className="passage-own-item">
                <Link to={`/reading/${passage.id}`} className="studio-row">
                  <span className="studio-row-meta">
                    <span>Your text</span>
                    {passage.wordCount > 0 ? <span>{passage.wordCount} words</span> : null}
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
                    dialogTitle="Delete this text and its practice history?"
                    dialogDescription="This removes the text, reference audio, recordings, and AI feedback. This cannot be undone."
                  >
                    Delete
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
