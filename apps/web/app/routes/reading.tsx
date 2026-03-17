import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, NavLink, Outlet, useLocation, useLoaderData, useParams } from "@remix-run/react";
import * as React from "react";
import { listEslPassagesByUser } from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { getDisplayEslPassageTitle } from "~/utils/esl-reading";

export const handle = {
  breadcrumb: { label: "reading", href: "/reading" }
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const passages = await listEslPassagesByUser(context.env.DB, user.id);
  return json({ passages });
};

export default function EslReadingLayout() {
  const { passages } = useLoaderData<typeof loader>();
  const params = useParams();
  const location = useLocation();
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

  React.useEffect(() => {
    setOpenMenuId(null);
  }, [location.pathname]);

  return (
    <div className="esl-reading-shell">
      <aside className="esl-sidebar">
        <div className="esl-sidebar-header">
          <Link to="/reading" className="btn btn-primary btn-sm esl-sidebar-new">
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
                  to={`/reading/${passage.id}`}
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
                        action={`/reading/${passage.id}`}
                        onSubmit={(event) => {
                          if (
                            !confirm(
                              "Delete this passage, its reference audio, all recordings, and all AI feedback?"
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
        <div className="esl-sidebar-footer">
          <NavLink
            to="/reading/settings"
            className={({ isActive }) =>
              `esl-sidebar-settings ${isActive ? "is-active" : ""}`
            }
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 7h5M13 7h7M4 12h10M18 12h2M4 17h3M11 17h9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle cx="11" cy="7" r="2" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="16" cy="12" r="2" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="9" cy="17" r="2" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <span>Settings</span>
          </NavLink>
        </div>
      </aside>
      <div className="esl-main">
        <Outlet />
      </div>
    </div>
  );
}
