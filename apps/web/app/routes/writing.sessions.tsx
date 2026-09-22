import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { listWritingArticlePageByUser } from "@bcailab/db";
import { LocalDateTime } from "~/components/LocalDateTime";
import { StudioBreadcrumbs } from "~/components/StudioBreadcrumbs";
import { StudioPage, StudioPageBody, StudioPageHeader } from "~/components/StudioPage";
import { WritingUnavailableState } from "~/components/WritingUnavailableState";
import { requireUser } from "~/utils/auth.server";
import { isWritingSchemaMissingError, logWritingSchemaMissing } from "~/utils/writing-schema.server";
import { useT } from "~/i18n/context";
import { metaTranslator } from "~/i18n/meta";

export const meta: MetaFunction = ({ matches }) => {
  const t = metaTranslator(matches);
  return [
    { title: t("meta.writingSessions.title") },
    { name: "description", content: t("meta.writingSessions.description") }
  ];
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const cursor = new URL(request.url).searchParams.get("cursor");
  try {
    const page = await listWritingArticlePageByUser(context.env.DB, {
      userId: user.id,
      cursor,
      limit: 20
    });
    return json({ schemaReady: true as const, page });
  } catch (error) {
    if (!isWritingSchemaMissingError(error)) throw error;
    logWritingSchemaMissing("writing.sessions.loader", error);
    return json({
      schemaReady: false as const,
      page: { items: [], next_cursor: null }
    }, { status: 503 });
  }
};

export default function WritingSessionsPage() {
  const data = useLoaderData<typeof loader>();
  const t = useT();
  if (!data.schemaReady) return <WritingUnavailableState />;

  return (
    <div className="studio-main-scroll">
      <StudioPage width="standard">
        <StudioBreadcrumbs items={[
          { label: t("writing.title"), to: "/writing" },
          { label: t("writingSessions.crumb") }
        ]} />
        <StudioPageHeader
          title={t("writingSessions.title")}
          description={t("writingSessions.description")}
          action={<Link to="/writing/new" className="btn btn-primary">{t("writing.newFreeform")}</Link>}
        />
        <StudioPageBody className="writing-sessions-page">
          {data.page.items.length === 0 ? (
            <div className="writing-sessions-page-empty">
              <h2>{t("writingSessions.emptyTitle")}</h2>
              <p>{t("writingSessions.emptyBody")}</p>
              <Link to="/writing" className="btn btn-secondary">{t("writingSessions.browse")}</Link>
            </div>
          ) : (
            <div className="writing-sessions-list">
              {data.page.items.map((session) => (
                <Link key={session.id} to={`/writing/${session.id}`} className="writing-session-row">
                  <span>
                    <strong>{session.title ?? session.essay_prompt ?? t("writing.untitledSession")}</strong>
                    <small>{session.prompt_id ? t("writing.assignmentSession") : t("writing.freeformSession")}</small>
                  </span>
                  <LocalDateTime
                    value={session.updated_at}
                    options={{ year: "numeric", month: "short", day: "numeric" }}
                  />
                </Link>
              ))}
            </div>
          )}
          {data.page.next_cursor ? (
            <div className="writing-sessions-pagination">
              <Link to={`/writing/sessions?cursor=${encodeURIComponent(data.page.next_cursor)}`} className="btn btn-secondary">
                {t("writingSessions.next")}
              </Link>
            </div>
          ) : null}
        </StudioPageBody>
      </StudioPage>
    </div>
  );
}
