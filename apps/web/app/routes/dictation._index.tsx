import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { listDictationAttemptsByUser, listLibraryPassages } from "@bcailab/db";
import { getOptionalUser } from "~/utils/auth.server";
import { LocalDateTime } from "~/components/LocalDateTime";
import { StudioPage, StudioPageBody, StudioPageHeader } from "~/components/StudioPage";

export const meta: MetaFunction = () => [
  { title: "Dictation · bcailab" },
  {
    name: "description",
    content:
      "Listen sentence by sentence and type what you hear. Instant scoring, graded passages from A2 to C1. Free to try — no account needed."
  }
];

/** Display order for the CEFR bands; passages outside this list sort last. */
const BAND_ORDER = ["A2", "B1", "B2", "C1"] as const;

/** The workspace shows a short re-entry list; the full history lives on Progress. */
const RECENT_ROWS = 4;

const BAND_BLURB: Record<string, string> = {
  A2: "Short everyday sentences, simple tenses.",
  B1: "Everyday narrative with common connectors.",
  B2: "Varied tenses, opinion and contrast.",
  C1: "Complex sentences and nuanced vocabulary."
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await getOptionalUser(request, context);

  const [passages, attempts] = await Promise.all([
    listLibraryPassages(context.env.DB, { requireSentenceAudio: true }),
    user ? listDictationAttemptsByUser(context.env.DB, { userId: user.id, limit: 200 }) : []
  ]);

  // Best accuracy per passage, so the library can show progress without a second query.
  const bestByPassage = new Map<string, number>();
  for (const attempt of attempts) {
    const current = bestByPassage.get(attempt.passage_id);
    if (current === undefined || attempt.accuracy > current) {
      bestByPassage.set(attempt.passage_id, attempt.accuracy);
    }
  }

  const bands = BAND_ORDER.map((band) => ({
    band,
    blurb: BAND_BLURB[band] ?? "",
    passages: passages
      .filter((passage) => passage.band === band)
      .map((passage) => ({
        id: passage.id,
        title: passage.title,
        topic: passage.topic,
        sentenceCount: passage.sentence_count,
        bestAccuracy: bestByPassage.get(passage.id) ?? null
      }))
  })).filter((group) => group.passages.length > 0);

  // Recent practice, so the tool workspace answers "what was I doing?" without a trip to
  // Progress — the section Writing's hub has and this page did not.
  //
  // One row per material, not per attempt: these links address the passage anyway, and the
  // studio grows no cross-tool session entity (ADR 0007). `attempts` arrives newest-first,
  // so the first row seen for a passage sets the row's timestamp, and `bestByPassage` above
  // already holds its best score.
  const titleById = new Map(passages.map((p) => [p.id, p.title]));
  const attemptsByPassage = new Map<string, number>();
  for (const attempt of attempts) {
    attemptsByPassage.set(
      attempt.passage_id,
      (attemptsByPassage.get(attempt.passage_id) ?? 0) + 1
    );
  }

  const recent = attempts
    .filter((attempt, index, all) =>
      all.findIndex((other) => other.passage_id === attempt.passage_id) === index
    )
    .slice(0, RECENT_ROWS)
    .map((attempt) => {
      const best = bestByPassage.get(attempt.passage_id);
      return {
        id: attempt.passage_id,
        passageId: attempt.passage_id,
        title: titleById.get(attempt.passage_id) ?? "Passage",
        attempts: attemptsByPassage.get(attempt.passage_id) ?? 1,
        best: best != null ? Math.round(best * 100) : null,
        latest:
          attempt.status === "in_progress"
            ? `In progress · ${attempt.sentences_done} done`
            : `${Math.round(attempt.accuracy * 100)}%`,
        at: attempt.created_at
      };
    });

  return json({ authed: Boolean(user), bands, recent });
};

export default function DictationLibrary() {
  const { authed, bands, recent } = useLoaderData<typeof loader>();

  return (
    <StudioPage width="wide">
      <StudioPageHeader
        title="Dictation"
        description={
          <>
          Listen to a passage sentence by sentence and type what you hear. You get instant
          feedback on every sentence.
          {!authed ? " No account needed to start." : null}
          </>
        }
      />

      <StudioPageBody className="passage-catalogue">
        {authed && recent.length > 0 ? (
          <section className="passage-recent" aria-labelledby="dictation-recent-heading">
            <div className="studio-section-head">
              <div>
                <p className="studio-section-eyebrow">Your workspace</p>
                <h2 id="dictation-recent-heading" className="studio-section-title">
                  Recent practice
                </h2>
              </div>
              <Link to="/english/progress" className="studio-section-more">
                Full progress &rarr;
              </Link>
            </div>
            <div className="studio-row-list">
              {recent.map((item) => (
                <Link
                  key={item.id}
                  to={`/dictation/${item.passageId}`}
                  className="studio-row"
                >
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
                      ? `${item.attempts} attempts${item.best != null ? ` · best ${item.best}%` : ""}`
                      : item.latest}
                  </span>
                  <span className="studio-row-arrow" aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {bands.length === 0 ? (
          <p className="passage-catalogue-empty">No passages are available yet.</p>
        ) : (
          bands.map((group) => (
            <section key={group.band} className="passage-band">
              <div className="passage-band-header">
                <h2 className="passage-band-title">{group.band}</h2>
                <span className="passage-band-blurb">{group.blurb}</span>
              </div>
              <div className="passage-band-body">
                {/* Rows, not cards: the band header already carries the level, so each
                    entry only has to be scannable against its siblings. */}
                <div className="studio-row-list">
                  {group.passages.map((passage) => (
                    <Link
                      key={passage.id}
                      to={`/dictation/${passage.id}`}
                      className="studio-row"
                    >
                      <span className="studio-row-meta">
                        <span>{passage.topic}</span>
                        <span>{passage.sentenceCount} sentences</span>
                      </span>
                      <strong>{passage.title}</strong>
                      <span className="studio-row-state">
                        {passage.bestAccuracy !== null
                          ? `Best ${Math.round(passage.bestAccuracy * 100)}%`
                          : "Not started"}
                      </span>
                      <span className="studio-row-arrow" aria-hidden="true">→</span>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          ))
        )}
      </StudioPageBody>
    </StudioPage>
  );
}
