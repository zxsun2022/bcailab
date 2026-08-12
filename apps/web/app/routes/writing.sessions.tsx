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

export const meta: MetaFunction = () => [
  { title: "Writing sessions · English Studio · bcailab" },
  { name: "description", content: "Continue your recent assignment and freeform writing sessions." }
];

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
  if (!data.schemaReady) return <WritingUnavailableState />;

  return (
    <div className="studio-main-scroll">
      <StudioPage width="standard">
        <StudioBreadcrumbs items={[
          { label: "Writing", to: "/writing" },
          { label: "Sessions" }
        ]} />
        <StudioPageHeader
          title="Writing sessions"
          description="Continue an assignment or freeform session. Each session keeps its own rounds and feedback together."
          action={<Link to="/writing/new" className="btn btn-primary">New freeform session</Link>}
        />
        <StudioPageBody className="writing-sessions-page">
          {data.page.items.length === 0 ? (
            <div className="writing-sessions-page-empty">
              <h2>No writing sessions yet</h2>
              <p>Choose an assignment or start a freeform session. It will appear here after you submit your first draft.</p>
              <Link to="/writing" className="btn btn-secondary">Browse writing assignments</Link>
            </div>
          ) : (
            <div className="writing-sessions-list">
              {data.page.items.map((session) => (
                <Link key={session.id} to={`/writing/${session.id}`} className="writing-session-row">
                  <span>
                    <strong>{session.title ?? session.essay_prompt ?? "Untitled session"}</strong>
                    <small>{session.prompt_id ? "Assignment session" : "Freeform session"}</small>
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
                Next sessions →
              </Link>
            </div>
          ) : null}
        </StudioPageBody>
      </StudioPage>
    </div>
  );
}
