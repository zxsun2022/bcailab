import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, Outlet, useLoaderData, useParams } from "@remix-run/react";
import * as React from "react";
import { listEslPassagesByUser } from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { getDisplayEslPassageTitle } from "~/utils/esl-reading";

export const handle = {
  breadcrumb: { label: "reading", href: "/esl/reading" }
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const passages = await listEslPassagesByUser(context.env.DB, user.id);
  return json({ passages });
};

export default function EslReadingLayout() {
  const { passages } = useLoaderData<typeof loader>();
  const params = useParams();
  const activeId = params.id ?? null;
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const closeMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".esl-sidebar-item-actions")) return;
      setOpenMenuId(null);
    };
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, []);

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
              <div
                key={passage.id}
                className={`esl-sidebar-item-shell ${activeId === passage.id ? "is-active" : ""} ${
                  openMenuId === passage.id ? "is-menu-open" : ""
                }`}
              >
                <Link
                  to={`/esl/reading/${passage.id}`}
                  className={`esl-sidebar-item ${activeId === passage.id ? "is-active" : ""}`}
                  onClick={() => setOpenMenuId(null)}
                >
                  <div className="esl-sidebar-item-title">
                    {getDisplayEslPassageTitle(passage.title, passage.content_text)}
                  </div>
                </Link>

                <div
                  className={`esl-sidebar-item-actions ${
                    openMenuId === passage.id ? "is-open" : ""
                  }`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    className="esl-sidebar-item-menu-btn"
                    aria-label="Open passage menu"
                    aria-expanded={openMenuId === passage.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenMenuId((current) => (current === passage.id ? null : passage.id));
                    }}
                  >
                    <span />
                    <span />
                    <span />
                  </button>

                  {openMenuId === passage.id ? (
                    <div className="esl-sidebar-item-menu">
                      <form
                        method="post"
                        action={`/esl/reading/${passage.id}`}
                        onSubmit={(event) => {
                          if (
                            !confirm(
                              "Delete this passage and all of its recordings and AI feedback?"
                            )
                          ) {
                            event.preventDefault();
                          }
                        }}
                      >
                        <input type="hidden" name="_intent" value="deletePassage" />
                        <button type="submit" className="esl-sidebar-item-menu-option is-danger">
                          Delete passage
                        </button>
                      </form>
                    </div>
                  ) : null}
                </div>
              </div>
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
