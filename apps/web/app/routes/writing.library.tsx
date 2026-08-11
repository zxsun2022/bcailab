import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Form, Link, useLoaderData } from "@remix-run/react";
import {
  decodeWritingPromptCursor,
  listPublishedWritingPromptPage,
  type WritingPromptKind,
  type WritingPromptSummary
} from "@bcailab/db";
import { StudioPage, StudioPageBody, StudioPageHeader } from "~/components/StudioPage";
import { WritingUnavailableState } from "~/components/WritingUnavailableState";
import { requireUser } from "~/utils/auth.server";
import { isWritingSchemaMissingError, logWritingSchemaMissing } from "~/utils/writing-schema.server";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: `${data?.collection.title ?? "Writing library"} · English Studio · bcailab` }
];

const CATEGORIES = {
  general: {
    title: "Everyday writing",
    eyebrow: "General English · A2 to C1",
    description: "Practice useful writing for real situations. Levels guide discovery; every assignment remains open.",
    family: "general" as const,
    taskType: null
  },
  task1: {
    title: "Visual reports",
    eyebrow: "IELTS Academic · Task 1",
    description: "Interpret reviewed charts, tables, processes, and maps, then write a precise academic report.",
    family: null,
    taskType: "academic_task_1" as const
  },
  task2: {
    title: "Academic essays",
    eyebrow: "IELTS Academic · Task 2",
    description: "Build a clear position and support it across the common IELTS essay families.",
    family: null,
    taskType: "academic_task_2" as const
  }
};

const GENERAL_LEVELS = ["A2", "B1", "B2", "C1"] as const;
const TASK_1_KINDS = ["line_graph", "bar_chart", "pie_chart", "table", "process", "map"] as const;
const TASK_2_KINDS = ["opinion_essay", "discussion", "problem_solution", "advantages_disadvantages"] as const;

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const url = new URL(request.url);
  const categoryKey = url.searchParams.get("category");
  const category = categoryKey && categoryKey in CATEGORIES
    ? (categoryKey as keyof typeof CATEGORIES)
    : "general";
  const collection = CATEGORIES[category];
  const levelValue = url.searchParams.get("level");
  const level = category === "general" && GENERAL_LEVELS.includes(levelValue as (typeof GENERAL_LEVELS)[number])
    ? (levelValue as (typeof GENERAL_LEVELS)[number])
    : null;
  const allowedKinds = category === "task1" ? TASK_1_KINDS : category === "task2" ? TASK_2_KINDS : [];
  const kindValue = url.searchParams.get("kind");
  const kind = allowedKinds.includes(kindValue as never) ? (kindValue as WritingPromptKind) : null;
  const cursor = url.searchParams.get("cursor");
  try {
    const page = await listPublishedWritingPromptPage(context.env.DB, {
      userId: user.id,
      family: collection.family,
      taskType: collection.taskType,
      promptKind: kind,
      cefrBand: level,
      cursor,
      limit: 12
    });

    return json({
      schemaReady: true as const,
      category,
      collection,
      level,
      kind,
      isFirstPage: decodeWritingPromptCursor(cursor) == null,
      page
    });
  } catch (error) {
    if (!isWritingSchemaMissingError(error)) throw error;
    logWritingSchemaMissing("writing.library.loader", error);
    return json({
      schemaReady: false as const,
      category,
      collection,
      level,
      kind,
      isFirstPage: true,
      page: { items: [], next_cursor: null }
    }, { status: 503 });
  }
};

const humanizeKind = (value: string) =>
  value.split("_").map((part) => part[0]!.toUpperCase() + part.slice(1)).join(" ");

const PromptRow = ({ prompt }: { prompt: WritingPromptSummary }) => (
  <Link to={`/writing/prompt/${prompt.slug}`} className="writing-library-row">
    <span className="writing-library-meta">
      {prompt.cefr_band ? <span className="writing-level-badge">{prompt.cefr_band}</span> : null}
      <span>{prompt.topic}</span>
      <span>{prompt.target_minutes} min</span>
    </span>
    <strong>{prompt.title}</strong>
    <span className="writing-library-progress">
      {prompt.target_words}+ words · {prompt.attempt_count === 0 ? "Not attempted" : `${prompt.attempt_count} ${prompt.attempt_count === 1 ? "attempt" : "attempts"}`}
    </span>
    <span className="writing-library-arrow" aria-hidden="true">→</span>
  </Link>
);

const promptDescription = (prompt: WritingPromptSummary) =>
  prompt.task_type === "academic_task_1"
    ? "Read the visual, identify key features, and write an accurate academic report."
    : prompt.task_type === "academic_task_2"
      ? "Develop a clear position and support it in an academic essay."
      : "Practice a focused real-world writing task with guided feedback.";

const FeaturedPromptCard = ({ prompt }: { prompt: WritingPromptSummary }) => (
  <Link to={`/writing/prompt/${prompt.slug}`} className="writing-prompt-card">
    <div className="writing-prompt-card-meta">
      {prompt.cefr_band ? <span className="writing-level-badge">{prompt.cefr_band}</span> : null}
      <span>{prompt.topic}</span>
      <span>{prompt.target_minutes} min</span>
    </div>
    <h3>{prompt.title}</h3>
    <p>{promptDescription(prompt)}</p>
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

export default function WritingLibraryPage() {
  const data = useLoaderData<typeof loader>();
  if (!data.schemaReady) return <WritingUnavailableState />;
  const { category, collection, level, kind, isFirstPage, page } = data;
  const kinds = category === "task1" ? TASK_1_KINDS : category === "task2" ? TASK_2_KINDS : [];
  const featured = isFirstPage ? page.items.slice(0, 3) : [];
  const catalogueItems = isFirstPage ? page.items.slice(3) : page.items;
  const nextParams = new URLSearchParams({ category });
  if (level) nextParams.set("level", level);
  if (kind) nextParams.set("kind", kind);
  if (page.next_cursor) nextParams.set("cursor", page.next_cursor);

  return (
    <div className="writing-main-scroll">
      <StudioPage width="wide">
        <Link to="/writing" className="writing-library-back">← All writing collections</Link>
        <StudioPageHeader
          title={collection.title}
          description={collection.description}
          className="writing-library-header"
        />
        <StudioPageBody className="writing-library">
          <p className="writing-section-eyebrow">{collection.eyebrow}</p>
          <Form method="get" className="writing-library-filters">
            <input type="hidden" name="category" value={category} />
            {category === "general" ? (
              <label>
                <span>Level</span>
                <select name="level" defaultValue={level ?? ""}>
                  <option value="">All levels</option>
                  {GENERAL_LEVELS.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
            ) : (
              <label>
                <span>Task family</span>
                <select name="kind" defaultValue={kind ?? ""}>
                  <option value="">All task families</option>
                  {kinds.map((value) => <option key={value} value={value}>{humanizeKind(value)}</option>)}
                </select>
              </label>
            )}
            <button type="submit" className="btn btn-secondary">Apply</button>
          </Form>

          {featured.length > 0 ? (
            <section className="writing-library-featured" aria-labelledby="writing-featured-heading">
              <div className="writing-section-heading">
                <div>
                  <p className="writing-section-eyebrow">Selected from this collection</p>
                  <h2 id="writing-featured-heading">Start here</h2>
                </div>
                <p>Three good entry points for the current view.</p>
              </div>
              <div className="writing-prompt-grid">
                {featured.map((prompt) => <FeaturedPromptCard key={prompt.id} prompt={prompt} />)}
              </div>
            </section>
          ) : null}

          {page.items.length === 0 ? (
            <div className="writing-library-empty">
              <h2>No assignments in this view</h2>
              <p>Choose a broader filter to see the rest of the reviewed collection.</p>
            </div>
          ) : catalogueItems.length > 0 ? (
            <section className="writing-library-catalogue" aria-labelledby="writing-catalogue-heading">
              <div className="writing-section-heading">
                <div>
                  <p className="writing-section-eyebrow">Full collection</p>
                  <h2 id="writing-catalogue-heading">Browse assignments</h2>
                </div>
              </div>
              <div className="writing-library-list">{catalogueItems.map((prompt) => <PromptRow key={prompt.id} prompt={prompt} />)}</div>
            </section>
          ) : null}

          {page.next_cursor ? (
            <div className="writing-library-pagination">
              <Link to={`/writing/library?${nextParams.toString()}`} className="btn btn-secondary">Next page →</Link>
            </div>
          ) : null}
        </StudioPageBody>
      </StudioPage>
    </div>
  );
}
