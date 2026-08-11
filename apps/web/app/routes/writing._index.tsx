import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import {
  listPublishedWritingPrompts,
  listRecentWritingArticlesByUser,
  type WritingPromptSummary
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
    content: "Choose a level-guided or IELTS writing assignment, or start a freeform piece."
  }
];

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  try {
    const [prompts, articles] = await Promise.all([
      listPublishedWritingPrompts(context.env.DB, { userId: user.id, limit: 100 }),
      listRecentWritingArticlesByUser(context.env.DB, { userId: user.id, limit: 6 })
    ]);
    return json({
      schemaReady: true as const,
      prompts,
      articles: articles.map((article) => ({
        id: article.id,
        title: article.title,
        essayPrompt: article.essay_prompt,
        promptId: article.prompt_id,
        agentType: article.agent_type,
        updatedAt: article.updated_at
      }))
    });
  } catch (error) {
    if (!isWritingSchemaMissingError(error)) throw error;
    logWritingSchemaMissing("writing.index.loader", error);
    return json(
      { schemaReady: false as const, prompts: [], articles: [] },
      { status: 503 }
    );
  }
};

const promptHref = (prompt: WritingPromptSummary) => `/writing/prompt/${prompt.slug}`;

const PromptCard = ({ prompt }: { prompt: WritingPromptSummary }) => (
  <Link to={promptHref(prompt)} className="writing-prompt-card">
    <div className="writing-prompt-card-meta">
      {prompt.cefr_band ? <span className="writing-level-badge">{prompt.cefr_band}</span> : null}
      <span>{prompt.topic}</span>
      <span>{prompt.target_minutes} min</span>
    </div>
    <h3>{prompt.title}</h3>
    <p>
      {prompt.task_type === "academic_task_1"
        ? "Read the visual, identify key features, and write an accurate academic report."
        : prompt.task_type === "academic_task_2"
          ? "Develop a clear position and support it in an academic essay."
          : "Practice a focused real-world writing task with guided feedback."}
    </p>
    <div className="writing-prompt-card-foot">
      <span>{prompt.target_words}+ words</span>
      <span>
        {prompt.attempt_count === 0
          ? "Not attempted"
          : `${prompt.attempt_count} ${prompt.attempt_count === 1 ? "attempt" : "attempts"}`}
      </span>
    </div>
  </Link>
);

export default function WritingHomePage() {
  const data = useLoaderData<typeof loader>();
  if (!data.schemaReady) return <WritingUnavailableState />;
  const { prompts, articles } = data;
  const general = prompts.filter((prompt) => prompt.family === "general");
  const task1 = prompts.filter((prompt) => prompt.task_type === "academic_task_1");
  const task2 = prompts.filter((prompt) => prompt.task_type === "academic_task_2");

  return (
    <div className="writing-main-scroll">
      <StudioPage width="wide">
        <StudioPageHeader
          title="Writing"
          description="Start with a reviewed assignment at the level or exam task you want to practice. Levels guide discovery; they never lock material."
          action={<Link to="/writing/new" className="btn btn-primary">New freeform piece</Link>}
        />
        <StudioPageBody className="writing-home">
          {prompts.length === 0 ? (
            <section className="writing-catalogue-empty" aria-labelledby="writing-material-heading">
              <p className="writing-section-eyebrow">Assignment library</p>
              <h2 id="writing-material-heading">Reviewed material is being prepared</h2>
              <p>
                Only fully reviewed assignments appear here. You can keep using the freeform
                coach while the first level-guided and IELTS batch completes review.
              </p>
              <Link to="/writing/new" className="btn btn-secondary">Start freeform</Link>
            </section>
          ) : (
            <>
              {general.length > 0 ? <section className="writing-catalogue-section" aria-labelledby="general-writing-heading">
                <div className="writing-section-heading">
                  <div>
                    <p className="writing-section-eyebrow">General English · A2 to C1</p>
                    <h2 id="general-writing-heading">Build range through real writing tasks</h2>
                  </div>
                  <p>Every level remains open.</p>
                </div>
                <div className="writing-prompt-grid">{general.map((prompt) => <PromptCard key={prompt.id} prompt={prompt} />)}</div>
              </section> : null}

              {task1.length > 0 ? <section className="writing-catalogue-section" aria-labelledby="task-one-heading">
                <div className="writing-section-heading">
                  <div>
                    <p className="writing-section-eyebrow">IELTS Academic</p>
                    <h2 id="task-one-heading">Task 1 · Visual reports</h2>
                  </div>
                  <p>Canonical figures power the visual, accessible data, and feedback.</p>
                </div>
                <div className="writing-prompt-grid">{task1.map((prompt) => <PromptCard key={prompt.id} prompt={prompt} />)}</div>
              </section> : null}

              {task2.length > 0 ? <section className="writing-catalogue-section" aria-labelledby="task-two-heading">
                <div className="writing-section-heading">
                  <div>
                    <p className="writing-section-eyebrow">IELTS Academic</p>
                    <h2 id="task-two-heading">Task 2 · Essays</h2>
                  </div>
                  <p>Opinion, discussion, problem/solution, and advantages/disadvantages.</p>
                </div>
                <div className="writing-prompt-grid">{task2.map((prompt) => <PromptCard key={prompt.id} prompt={prompt} />)}</div>
              </section> : null}
            </>
          )}

          <section className="writing-pieces-section" aria-labelledby="your-pieces-heading">
            <div className="writing-section-heading">
              <div>
                <p className="writing-section-eyebrow">Your workspace</p>
                <h2 id="your-pieces-heading">Your pieces</h2>
              </div>
              <Link to="/writing/progress">View progress</Link>
            </div>
            {articles.length === 0 ? (
              <p className="writing-pieces-empty">Your first submitted piece will appear here.</p>
            ) : (
              <div className="writing-pieces-list">
                {articles.map((article) => (
                  <Link key={article.id} to={`/writing/${article.id}`} className="writing-piece-row">
                    <span>
                      <strong>{article.title ?? article.essayPrompt ?? "Untitled piece"}</strong>
                      <small>{article.promptId ? "Assignment" : "Freeform"}</small>
                    </span>
                    <LocalDateTime
                      value={article.updatedAt}
                      options={{ year: "numeric", month: "short", day: "numeric" }}
                    />
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
