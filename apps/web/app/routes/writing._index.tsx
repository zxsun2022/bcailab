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

export const meta: MetaFunction = () => [
  { title: "Writing · English Studio · bcailab" },
  {
    name: "description",
    content: "Choose a General English or IELTS writing collection, or continue your own work."
  }
];

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

const COLLECTIONS = [
  {
    key: "general",
    eyebrow: "General English · A2 to C1",
    title: "Everyday writing",
    description: "Emails, stories, opinions, and descriptions for real situations.",
    href: "/writing/library?category=general"
  },
  {
    key: "task1",
    eyebrow: "IELTS Academic · Task 1",
    title: "Visual reports",
    description: "Compare charts, tables, processes, and maps with reviewed source material.",
    href: "/writing/library?category=task1"
  },
  {
    key: "task2",
    eyebrow: "IELTS Academic · Task 2",
    title: "Academic essays",
    description: "Develop positions across the four common IELTS essay families.",
    href: "/writing/library?category=task2"
  }
] as const;

export default function WritingHomePage() {
  const data = useLoaderData<typeof loader>();
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
          title="Writing"
          description="Choose a kind of writing first. Inside each collection, levels and task types help you narrow the material without locking anything away."
          action={<Link to="/writing/new" className="btn btn-primary">New freeform session</Link>}
        />
        <StudioPageBody className="writing-home writing-hub">
          {latest ? (
            <section className="writing-continue" aria-labelledby="continue-writing-heading">
              <div>
                <p className="writing-section-eyebrow">Continue writing</p>
                <h2 id="continue-writing-heading">{latest.title ?? latest.essayPrompt ?? "Untitled session"}</h2>
                <p>{latest.promptId ? "Assignment session" : "Freeform session"}</p>
              </div>
              <Link to={`/writing/${latest.id}`} className="writing-text-action">Continue <span aria-hidden="true">→</span></Link>
            </section>
          ) : null}

          <section aria-labelledby="writing-collections-heading">
            <div className="writing-section-heading">
              <div>
                <p className="writing-section-eyebrow">Assignment library</p>
                <h2 id="writing-collections-heading">Choose a collection</h2>
              </div>
              <p>All reviewed assignments remain open.</p>
            </div>
            {data.collections.length === 0 ? (
              <div className="writing-catalogue-empty">
                <h2>Reviewed material is being prepared</h2>
                <p>You can keep using the freeform coach while new collections are reviewed.</p>
              </div>
            ) : (
              <div className="writing-collection-list">
                {COLLECTIONS.map((collection, index) => (
                  <Link key={collection.key} to={collection.href} className="writing-collection-row">
                    <span className="writing-collection-index" aria-hidden="true">0{index + 1}</span>
                    <span className="writing-collection-copy">
                      <span className="writing-section-eyebrow">{collection.eyebrow}</span>
                      <strong>{collection.title}</strong>
                      <small>{collection.description}</small>
                    </span>
                    <span className="writing-collection-count">{countFor(collection.key)} assignments</span>
                    <span className="writing-collection-arrow" aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="writing-sessions-section" aria-labelledby="recent-sessions-heading">
            <div className="writing-section-heading">
              <div>
                <p className="writing-section-eyebrow">Your workspace</p>
                <h2 id="recent-sessions-heading">Recent sessions</h2>
              </div>
              <Link to="/writing/sessions">View all sessions</Link>
            </div>
            {data.articles.length === 0 ? (
              <p className="writing-sessions-empty">Your first session will appear here after you submit a draft.</p>
            ) : (
              <div className="writing-sessions-list">
                {data.articles.map((article) => (
                  <Link key={article.id} to={`/writing/${article.id}`} className="writing-session-row">
                    <span>
                      <strong>{article.title ?? article.essayPrompt ?? "Untitled session"}</strong>
                      <small>{article.promptId ? "Assignment session" : "Freeform session"}</small>
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
