import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { listLibraryPassages, listPassagesByUser } from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";

/**
 * Reading catalogue.
 *
 * This route used to *be* the new-passage composer, so "reading home" meant "create".
 * That was right when a learner's own text was the only material; it is wrong now that a
 * graded library exists, so creating moved to `/reading/new` and the index shows what
 * there is to practise.
 */

export const meta: MetaFunction = () => [{ title: "Reading · bcailab" }];

const BAND_ORDER = ["A2", "B1", "B2", "C1"] as const;

const BAND_BLURB: Record<string, string> = {
  A2: "Short everyday sentences, simple tenses.",
  B1: "Everyday narrative with common connectors.",
  B2: "Varied tenses, opinion and contrast.",
  C1: "Complex sentences and nuanced vocabulary."
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);

  const [library, own] = await Promise.all([
    listLibraryPassages(context.env.DB),
    listPassagesByUser(context.env.DB, user.id)
  ]);

  const bands = BAND_ORDER.map((band) => ({
    band,
    blurb: BAND_BLURB[band] ?? "",
    passages: library
      .filter((passage) => passage.band === band)
      .map((passage) => ({
        id: passage.id,
        title: passage.title,
        topic: passage.topic,
        wordCount: passage.word_count,
        hasSentenceAudio: passage.has_sentence_audio === 1
      }))
  })).filter((group) => group.passages.length > 0);

  return json({
    bands,
    own: own.map((passage) => ({
      id: passage.id,
      title: passage.title,
      wordCount: passage.word_count
    }))
  });
};

export default function ReadingCatalogue() {
  const { bands, own } = useLoaderData<typeof loader>();

  return (
    <div className="passage-catalogue">
      <header className="passage-catalogue-header">
        <h1 className="passage-catalogue-title">Reading</h1>
        <p className="passage-catalogue-subtitle">
          Read a passage aloud and get feedback on pronunciation, fluency, rhythm, and
          clarity. Practise graded material or bring your own text.
        </p>
        <Link to="/reading/new" className="dictation-primary reading-new-cta">
          Add your own passage
        </Link>
      </header>

      {own.length > 0 ? (
        <section className="passage-band">
          <div className="passage-band-header">
            <h2 className="passage-band-title">Yours</h2>
            <span className="passage-band-blurb">Passages you added.</span>
          </div>
          <ul className="passage-card-grid">
            {own.map((passage) => (
              <li key={passage.id}>
                <Link to={`/reading/${passage.id}`} className="passage-card">
                  <span className="passage-card-title">{passage.title}</span>
                  <span className="passage-card-meta">
                    {passage.wordCount > 0 ? `${passage.wordCount} words` : "Your text"}
                  </span>
                  <span className="passage-card-start">Practise</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {bands.map((group) => (
        <section key={group.band} className="passage-band">
          <div className="passage-band-header">
            <h2 className="passage-band-title">{group.band}</h2>
            <span className="passage-band-blurb">{group.blurb}</span>
          </div>
          <ul className="passage-card-grid">
            {group.passages.map((passage) => (
              <li key={passage.id}>
                <Link to={`/reading/${passage.id}`} className="passage-card">
                  <span className="passage-card-title">{passage.title}</span>
                  <span className="passage-card-meta">
                    {[passage.topic, passage.wordCount > 0 ? `${passage.wordCount} words` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="passage-card-start">
                    {/* Sentence audio is what makes a passage dictatable, so the
                        catalogue can honestly say which ones offer both modes. */}
                    {passage.hasSentenceAudio ? "Read aloud · also dictation" : "Read aloud"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
