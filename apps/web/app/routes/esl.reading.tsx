import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, Outlet, useLoaderData, useParams } from "@remix-run/react";
import { listEslPassagesByUser } from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { clipText } from "~/utils/esl-reading";

export const handle = {
  breadcrumb: { label: "reading", href: "/esl/reading" }
};

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const passages = await listEslPassagesByUser(context.env.DB, user.id);
  return json({ passages });
};

export default function EslReadingLayout() {
  const { passages } = useLoaderData<typeof loader>();
  const params = useParams();
  const activeId = params.id ?? null;

  return (
    <div className="esl-reading-shell">
      <aside className="esl-sidebar">
        <div className="esl-sidebar-header">
          <Link to="/esl/reading" className="btn btn-primary btn-sm esl-sidebar-new">
            + New passage
          </Link>
        </div>
        <nav className="esl-sidebar-list">
          {passages.length === 0 ? (
            <div className="esl-sidebar-empty">No passages yet</div>
          ) : (
            passages.map((passage) => (
              <Link
                key={passage.id}
                to={`/esl/reading/${passage.id}`}
                className={`esl-sidebar-item ${activeId === passage.id ? "is-active" : ""}`}
              >
                <div className="esl-sidebar-item-title">
                  {passage.title || "Untitled passage"}
                </div>
                <div className="esl-sidebar-item-meta">
                  <span>{clipText(passage.content_text, 50)}</span>
                  <span>{formatDate(passage.updated_at)}</span>
                </div>
              </Link>
            ))
          )}
        </nav>
      </aside>
      <div className="esl-main">
        <Outlet />
      </div>
    </div>
  );
}
