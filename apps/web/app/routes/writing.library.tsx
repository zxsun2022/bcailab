import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import {
  decodeWritingPromptCursor,
  listPublishedWritingPromptPage,
  type WritingPromptKind,
  type WritingPromptSummary
} from "@bcailab/db";
import { StudioPage, StudioPageBody, StudioPageHeader } from "~/components/StudioPage";
import { StudioBreadcrumbs } from "~/components/StudioBreadcrumbs";
import { WritingUnavailableState } from "~/components/WritingUnavailableState";
import { requireUser } from "~/utils/auth.server";
import { isWritingSchemaMissingError, logWritingSchemaMissing } from "~/utils/writing-schema.server";
import { useT } from "~/i18n/context";
import { metaTranslator } from "~/i18n/meta";
import type { MessageKey, Translate } from "~/i18n/translate";

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const t = metaTranslator(matches);
  return [
    {
      title: t("meta.writingLibrary.title", {
        title: t(`writing.collection.${data?.category ?? "general"}.title`)
      })
    }
  ];
};

// Copy for each category lives in the catalogues under `writing.collection.<key>.*`.
const CATEGORIES = {
  general: { family: "general" as const, taskType: null },
  task1: { family: null, taskType: "academic_task_1" as const },
  task2: { family: null, taskType: "academic_task_2" as const }
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

const kindLabel = (t: Translate, value: (typeof TASK_1_KINDS)[number] | (typeof TASK_2_KINDS)[number]) =>
  t(`writing.kind.${value}` satisfies MessageKey);

const sessionState = (t: Translate, count: number) =>
  count === 0
    ? t("writing.notStarted")
    : t(count === 1 ? "writing.sessionOne" : "writing.sessionMany", { count });

// Assignment titles and topics are the material being written about, so they stay English.
const PromptRow = ({ prompt }: { prompt: WritingPromptSummary }) => {
  const t = useT();
  return (
  <Link to={`/writing/prompt/${prompt.slug}`} className="studio-row">
    <span className="studio-row-meta">
      {prompt.cefr_band ? <span className="writing-level-badge">{prompt.cefr_band}</span> : null}
      <span lang="en">{prompt.topic}</span>
      <span>{t("writing.minutes", { count: prompt.target_minutes })}</span>
    </span>
    <strong lang="en">{prompt.title}</strong>
    <span className="studio-row-state">
      {t("writing.wordsPlus", { count: prompt.target_words })} · {sessionState(t, prompt.attempt_count)}
    </span>
    <span className="studio-row-arrow" aria-hidden="true">→</span>
  </Link>
  );
};

const promptDescription = (t: Translate, prompt: WritingPromptSummary) =>
  prompt.task_type === "academic_task_1"
    ? t("writing.promptDesc.task1")
    : prompt.task_type === "academic_task_2"
      ? t("writing.promptDesc.task2")
      : t("writing.promptDesc.general");

const FeaturedPromptCard = ({ prompt }: { prompt: WritingPromptSummary }) => {
  const t = useT();
  return (
  <Link to={`/writing/prompt/${prompt.slug}`} className="writing-prompt-card">
    <div className="writing-prompt-card-meta">
      {prompt.cefr_band ? <span className="writing-level-badge">{prompt.cefr_band}</span> : null}
      <span lang="en">{prompt.topic}</span>
      <span>{t("writing.minutes", { count: prompt.target_minutes })}</span>
    </div>
    <h3 lang="en">{prompt.title}</h3>
    <p>{promptDescription(t, prompt)}</p>
    <div className="writing-prompt-card-foot">
      <span>{t("writing.wordsPlus", { count: prompt.target_words })}</span>
      <span>{sessionState(t, prompt.attempt_count)}</span>
    </div>
  </Link>
  );
};

export default function WritingLibraryPage() {
  const data = useLoaderData<typeof loader>();
  const t = useT();
  if (!data.schemaReady) return <WritingUnavailableState />;
  const { category, level, kind, isFirstPage, page } = data;
  const collectionTitle = t(`writing.collection.${category}.title`);
  const kinds = category === "task1" ? TASK_1_KINDS : category === "task2" ? TASK_2_KINDS : [];
  const featured = isFirstPage ? page.items.slice(0, 3) : [];
  const catalogueItems = isFirstPage ? page.items.slice(3) : page.items;
  const nextParams = new URLSearchParams({ category });
  if (level) nextParams.set("level", level);
  if (kind) nextParams.set("kind", kind);
  if (page.next_cursor) nextParams.set("cursor", page.next_cursor);
  const filterHref = (value: string | null) => {
    const params = new URLSearchParams({ category });
    if (value) params.set(category === "general" ? "level" : "kind", value);
    return `/writing/library?${params.toString()}`;
  };
  const activeFilter = category === "general" ? level : kind;
  const filterOptions = category === "general" ? GENERAL_LEVELS : kinds;

  return (
    <div className="studio-main-scroll">
      <StudioPage width="wide">
        <StudioBreadcrumbs items={[
          { label: t("writing.title"), to: "/writing" },
          { label: collectionTitle }
        ]} />
        <StudioPageHeader
          title={collectionTitle}
          description={t(`writing.collection.${category}.description`)}
          className="writing-library-header"
        />
        <StudioPageBody className="writing-library">
          <p className="writing-section-eyebrow">{t(`writing.collection.${category}.eyebrow`)}</p>
          <nav
            className="writing-library-filters"
            aria-label={category === "general" ? t("writing.filterByLevel") : t("writing.filterByFamily")}
          >
            <span className="writing-library-filter-label">
              {category === "general" ? t("writing.level") : t("writing.taskFamily")}
            </span>
            <div className="writing-library-filter-options">
              <Link
                to={filterHref(null)}
                className={`writing-library-filter${activeFilter === null ? " is-active" : ""}`}
                aria-current={activeFilter === null ? "page" : undefined}
              >
                {t("writing.all")}
              </Link>
              {filterOptions.map((value) => (
                <Link
                  key={value}
                  to={filterHref(value)}
                  className={`writing-library-filter${activeFilter === value ? " is-active" : ""}`}
                  aria-current={activeFilter === value ? "page" : undefined}
                >
                  {category === "general" ? value : kindLabel(t, value as (typeof TASK_1_KINDS)[number] | (typeof TASK_2_KINDS)[number])}
                </Link>
              ))}
            </div>
          </nav>

          {featured.length > 0 ? (
            <section className="writing-library-featured" aria-labelledby="writing-featured-heading">
              <div className="writing-section-heading">
                <div>
                  <p className="writing-section-eyebrow">{t("writing.selectedFromCollection")}</p>
                  <h2 id="writing-featured-heading">{t("writing.startHere")}</h2>
                </div>
                <p>{t("writing.threeEntryPoints")}</p>
              </div>
              <div className="writing-prompt-grid">
                {featured.map((prompt) => <FeaturedPromptCard key={prompt.id} prompt={prompt} />)}
              </div>
            </section>
          ) : null}

          {page.items.length === 0 ? (
            <div className="writing-library-empty">
              <h2>{t("writing.noAssignmentsTitle")}</h2>
              <p>{t("writing.noAssignmentsBody")}</p>
            </div>
          ) : catalogueItems.length > 0 ? (
            <section className="writing-library-catalogue" aria-labelledby="writing-catalogue-heading">
              <div className="writing-section-heading">
                <div>
                  <p className="writing-section-eyebrow">{t("writing.fullCollection")}</p>
                  <h2 id="writing-catalogue-heading">{t("writing.browseAssignments")}</h2>
                </div>
              </div>
              <div className="studio-row-list">{catalogueItems.map((prompt) => <PromptRow key={prompt.id} prompt={prompt} />)}</div>
            </section>
          ) : null}

          {page.next_cursor ? (
            <div className="writing-library-pagination">
              <Link to={`/writing/library?${nextParams.toString()}`} className="btn btn-secondary">{t("writing.nextPage")}</Link>
            </div>
          ) : null}
        </StudioPageBody>
      </StudioPage>
    </div>
  );
}
