import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { listDictationAttemptsByUser, listDictationPassages } from "@bcailab/db";
import { getOptionalUser } from "~/utils/auth.server";

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

const BAND_BLURB: Record<string, string> = {
  A2: "Short everyday sentences, simple tenses.",
  B1: "Everyday narrative with common connectors.",
  B2: "Varied tenses, opinion and contrast.",
  C1: "Complex sentences and nuanced vocabulary."
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await getOptionalUser(request, context);

  const [passages, attempts] = await Promise.all([
    listDictationPassages(context.env.DB),
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

  return json({ authed: Boolean(user), bands });
};

export default function DictationLibrary() {
  const { authed, bands } = useLoaderData<typeof loader>();

  return (
    <div className="dictation-library">
      <header className="dictation-library-header">
        <h1 className="dictation-library-title">Dictation</h1>
        <p className="dictation-library-subtitle">
          Listen to a passage sentence by sentence and type what you hear. You get instant
          feedback on every sentence.
          {!authed ? " No account needed to start." : null}
        </p>
      </header>

      {bands.length === 0 ? (
        <p className="dictation-empty">No passages are available yet.</p>
      ) : (
        bands.map((group) => (
          <section key={group.band} className="dictation-band">
            <div className="dictation-band-header">
              <h2 className="dictation-band-title">{group.band}</h2>
              <span className="dictation-band-blurb">{group.blurb}</span>
            </div>
            <ul className="dictation-passage-grid">
              {group.passages.map((passage) => (
                <li key={passage.id}>
                  <Link to={`/dictation/${passage.id}`} className="dictation-passage-card">
                    <span className="dictation-passage-title">{passage.title}</span>
                    <span className="dictation-passage-meta">
                      {passage.topic} · {passage.sentenceCount} sentences
                    </span>
                    {passage.bestAccuracy !== null ? (
                      <span className="dictation-passage-best">
                        Best {Math.round(passage.bestAccuracy * 100)}%
                      </span>
                    ) : (
                      <span className="dictation-passage-start">Start</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
