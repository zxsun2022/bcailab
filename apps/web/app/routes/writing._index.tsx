import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import {
  listPublishedWritingPromptCollections,
  listRecentWritingArticlesByUser
} from "@bcailab/db";
import { StudioPage, StudioPageBody, StudioPageHeader } from "~/components/StudioPage";
import { LocalDateTime } from "~/components/LocalDateTime";
import { WritingUnavailableState } from "~/components/WritingUnavailableState";
import { requireUser } from "~/utils/auth.server";
import { isWritingSchemaMissingError, logWritingSchemaMissing } from "~/utils/writing-schema.server";
import { useT } from "~/i18n/context";
import { metaTranslator } from "~/i18n/meta";

export const meta: MetaFunction = ({ matches }) => {
  const t = metaTranslator(matches);
  return [
    { title: t("meta.writing.title") },
    { name: "description", content: t("meta.writing.description") }
  ];
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  try {
    const [collections, articles] = await Promise.all([
      listPublishedWritingPromptCollections(context.env.DB),
      listRecentWritingArticlesByUser(context.env.DB, { userId: user.id, limit: 6 })
    ]);
    return json({
      schemaReady: true as const,
      collections,
      articles: articles.map((article) => ({
        id: article.id,
        title: article.title,
        essayPrompt: article.essay_prompt,
        promptId: article.prompt_id,
        updatedAt: article.updated_at
      }))
    });
  } catch (error) {
    if (!isWritingSchemaMissingError(error)) throw error;
    logWritingSchemaMissing("writing.index.loader", error);
    return json({ schemaReady: false as const, collections: [], articles: [] }, { status: 503 });
  }
};

// Copy for each collection lives in the catalogues under `writing.collection.<key>.*`.
const COLLECTIONS = [
  { key: "general", href: "/writing/library?category=general" },
  { key: "task1", href: "/writing/library?category=task1" },
  { key: "task2", href: "/writing/library?category=task2" }
] as const;

export default function WritingHomePage() {
  const data = useLoaderData<typeof loader>();
  const t = useT();
  if (!data.schemaReady) return <WritingUnavailableState />;

  const countFor = (key: (typeof COLLECTIONS)[number]["key"]) =>
    data.collections
      .filter((row) =>
        key === "general"
          ? row.family === "general"
          : row.task_type === (key === "task1" ? "academic_task_1" : "academic_task_2")
      )
      .reduce((sum, row) => sum + row.prompt_count, 0);
  const latest = data.articles[0] ?? null;

  return (
    <div className="studio-main-scroll">
      <StudioPage width="wide">
        <StudioPageHeader
          title={t("writing.title")}
          description={t("writing.hubDescription")}
          action={<Link to="/writing/new" className="btn btn-primary">{t("writing.newFreeform")}</Link>}
        />
        <StudioPageBody className="writing-home writing-hub">
          {latest ? (
            <section className="writing-continue" aria-labelledby="continue-writing-heading">
              <div>
                <p className="writing-section-eyebrow">{t("writing.continueWriting")}</p>
                <h2 id="continue-writing-heading">{latest.title ?? latest.essayPrompt ?? t("writing.untitledSession")}</h2>
                <p>{latest.promptId ? t("writing.assignmentSession") : t("writing.freeformSession")}</p>
              </div>
              <Link to={`/writing/${latest.id}`} className="writing-text-action">
                {t("writing.continue")} <span aria-hidden="true">→</span>
              </Link>
            </section>
          ) : null}

          <section aria-labelledby="writing-collections-heading">
            <div className="writing-section-heading">
              <div>
                <p className="writing-section-eyebrow">{t("writing.assignmentLibrary")}</p>
                <h2 id="writing-collections-heading">{t("writing.chooseCollection")}</h2>
              </div>
              <p>{t("writing.allOpen")}</p>
            </div>
            {data.collections.length === 0 ? (
              <div className="writing-catalogue-empty">
                <h2>{t("writing.preparingTitle")}</h2>
                <p>{t("writing.preparingBody")}</p>
              </div>
            ) : (
              <div className="writing-collection-list">
                {COLLECTIONS.map((collection, index) => (
                  <Link key={collection.key} to={collection.href} className="writing-collection-row">
                    <span className="writing-collection-index" aria-hidden="true">0{index + 1}</span>
                    <span className="writing-collection-copy">
                      <span className="writing-section-eyebrow">
                        {t(`writing.collection.${collection.key}.eyebrow`)}
                      </span>
                      <strong>{t(`writing.collection.${collection.key}.title`)}</strong>
                      <small>{t(`writing.collection.${collection.key}.hubDescription`)}</small>
                    </span>
                    <span className="writing-collection-count">
                      {t("writing.assignmentsCount", { count: countFor(collection.key) })}
                    </span>
                    <span className="writing-collection-arrow" aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="writing-sessions-section" aria-labelledby="recent-sessions-heading">
            <div className="writing-section-heading">
              <div>
                <p className="writing-section-eyebrow">{t("writing.workspace")}</p>
                <h2 id="recent-sessions-heading">{t("writing.recentSessions")}</h2>
              </div>
              <Link to="/writing/sessions">{t("writing.viewAllSessions")}</Link>
            </div>
            {data.articles.length === 0 ? (
              <p className="writing-sessions-empty">{t("writing.firstSessionHint")}</p>
            ) : (
              <div className="writing-sessions-list">
                {data.articles.map((article) => (
                  <Link key={article.id} to={`/writing/${article.id}`} className="writing-session-row">
                    <span>
                      <strong>{article.title ?? article.essayPrompt ?? t("writing.untitledSession")}</strong>
                      <small>{article.promptId ? t("writing.assignmentSession") : t("writing.freeformSession")}</small>
                    </span>
                    <LocalDateTime value={article.updatedAt} options={{ year: "numeric", month: "short", day: "numeric" }} />
                  </Link>
                ))}
              </div>
            )}
          </section>
        </StudioPageBody>
      </StudioPage>
    </div>
  );
}
