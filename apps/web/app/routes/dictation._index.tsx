import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { listDictationAttemptsByUser, listLibraryPassages } from "@bcailab/db";
import { getOptionalUser } from "~/utils/auth.server";
import { LocalDateTime } from "~/components/LocalDateTime";
import { StudioPage, StudioPageBody, StudioPageHeader } from "~/components/StudioPage";
import { useT } from "~/i18n/context";
import { metaTranslator } from "~/i18n/meta";

export const meta: MetaFunction = ({ matches }) => {
  const t = metaTranslator(matches);
  return [
    { title: t("meta.dictation.title") },
    { name: "description", content: t("meta.dictation.description") }
  ];
};

/** Display order for the CEFR bands; passages outside this list sort last. */
const BAND_ORDER = ["A2", "B1", "B2", "C1"] as const;

/** The workspace shows a short re-entry list; the full history lives on Progress. */
const RECENT_ROWS = 4;

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

  // Structured data only: the page words it in the visitor's interface language.
  const bands = BAND_ORDER.map((band) => ({
    band,
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
        inProgress: attempt.status === "in_progress",
        sentencesDone: attempt.sentences_done,
        accuracyPct: Math.round(attempt.accuracy * 100),
        at: attempt.created_at
      };
    });

  return json({ authed: Boolean(user), bands, recent });
};

export default function DictationLibrary() {
  const { authed, bands, recent } = useLoaderData<typeof loader>();
  const t = useT();

  return (
    <StudioPage width="wide">
      <StudioPageHeader
        title={t("dictation.title")}
        description={
          <>
            {t("dictation.intro")}
            {!authed ? t("dictation.introAnonymous") : null}
          </>
        }
      />

      <StudioPageBody className="passage-catalogue">
        {authed && recent.length > 0 ? (
          <section className="passage-recent" aria-labelledby="dictation-recent-heading">
            <div className="studio-section-head">
              <div>
                <p className="studio-section-eyebrow">{t("dictation.workspace")}</p>
                <h2 id="dictation-recent-heading" className="studio-section-title">
                  {t("dictation.recent")}
                </h2>
              </div>
              <Link to="/english/progress" className="studio-section-more">
                {t("dictation.fullProgress")}
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
                  {/* Material titles stay English: the passage is what is being learned. */}
                  <strong lang="en">{item.title}</strong>
                  <span className="studio-row-state">
                    {/* Repeated work is the story here; a single run has none to tell. */}
                    {item.attempts > 1
                      ? item.best != null
                        ? t("dictation.attemptsBest", { count: item.attempts, best: item.best })
                        : t("dictation.attempts", { count: item.attempts })
                      : item.inProgress
                        ? t("dictation.inProgressDone", { done: item.sentencesDone })
                        : `${item.accuracyPct}%`}
                  </span>
                  <span className="studio-row-arrow" aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {bands.length === 0 ? (
          <p className="passage-catalogue-empty">{t("dictation.empty")}</p>
        ) : (
          bands.map((group) => (
            <section key={group.band} className="passage-band">
              <div className="passage-band-header">
                <h2 className="passage-band-title">{group.band}</h2>
                <span className="passage-band-blurb">{t(`dictation.band.${group.band}`)}</span>
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
                        <span lang="en">{passage.topic}</span>
                        <span>{t("dictation.sentences", { count: passage.sentenceCount })}</span>
                      </span>
                      <strong lang="en">{passage.title}</strong>
                      <span className="studio-row-state">
                        {passage.bestAccuracy !== null
                          ? t("dictation.best", { pct: Math.round(passage.bestAccuracy * 100) })
                          : t("dictation.notStarted")}
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
