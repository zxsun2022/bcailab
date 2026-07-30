import * as React from "react";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import {
  getEslLearnerProfile,
  listLibraryPassages,
  listPassagesByUser,
  listReadingPassageStatsByUser
} from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { resolveCefr } from "~/utils/learner-model";
import { StudioPage, StudioPageBody, StudioPageHeader } from "~/components/StudioPage";

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

  const [library, own, stats, profile] = await Promise.all([
    listLibraryPassages(db),
    listPassagesByUser(db, user.id),
    listReadingPassageStatsByUser(db, user.id),
    getEslLearnerProfile(db, user.id)
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
    }))
  });
};

function StateLabel({ state }: { state: CardState }) {
  if (state.kind === "new") return <span className="passage-card-state is-new">Not started</span>;
  if (state.kind === "pending") {
    return <span className="passage-card-state is-pending">Evaluating…</span>;
  }
  return (
    <span className="passage-card-state is-scored">
      Best {state.best}
      {state.attempts > 1 ? ` · ${state.attempts} attempts` : ""}
    </span>
  );
}

function PassageGrid({ passages }: { passages: PassageCard[] }) {
  return (
    <ul className="passage-card-grid">
      {passages.map((passage) => (
        <li key={passage.id}>
          <Link to={`/reading/${passage.id}`} className="passage-card">
            <span className="passage-card-title">{passage.title}</span>
            <span className="passage-card-meta">
              {[passage.topic, passage.wordCount > 0 ? `${passage.wordCount} words` : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <StateLabel state={passage.state} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function ReadingCatalogue() {
  const { bands, yourBand, own } = useLoaderData<typeof loader>();

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
              <span className="passage-band-count">{group.passages.length}</span>
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
          <ul className="passage-card-grid">
            {own.map((passage) => (
              <li key={passage.id} className="passage-own-item">
                <Link to={`/reading/${passage.id}`} className="passage-card">
                  <span className="passage-card-title">{passage.title}</span>
                  <span className="passage-card-meta">
                    {passage.wordCount > 0 ? `${passage.wordCount} words` : "Your text"}
                  </span>
                  <StateLabel state={passage.state} />
                </Link>
                {/* Delete used to live in the rail's passage list. The rail no longer lists
                    passages, so the affordance moves here rather than disappearing. */}
                <form
                  method="post"
                  action={`/reading/${passage.id}`}
                  onSubmit={(event) => {
                    if (
                      !confirm(
                        "Delete this passage, its reference audio, all recordings, and all AI feedback?"
                      )
                    ) {
                      event.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="_intent" value="deletePassage" />
                  <button type="submit" className="passage-own-delete">
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        </section>
      </StudioPageBody>
    </StudioPage>
  );
}
