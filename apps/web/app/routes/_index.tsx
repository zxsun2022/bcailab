import { Link, useOutletContext, useSearchParams } from "@remix-run/react";
import type { User } from "@bcailab/db";
import {
  ENGLISH_MODULES,
  resolveEnglishModuleDestination,
  type EnglishModule
} from "~/english-modules";
import { openLoginPopup } from "~/utils/login-popup";

/**
 * The homepage leads with English Studio, because it is the flagship and has no domain of
 * its own (owner decision, 2026-08-27). Until it gets one, `bcailab.com` is the place a
 * visitor meets the product; the lab identity that used to own the hero is now a line at the
 * foot of the page, and Mapdown, Posts and VanMemo are an "Other projects" strip rather than
 * cards competing for the same attention.
 *
 * The module grid is rendered from `ENGLISH_MODULES` rather than a hand-written list, so the
 * homepage cannot drift from the registry that `docs/access-model.md` calls authoritative.
 * Routes and anonymous-access rules come from `resolveEnglishModuleDestination`: `public`
 * modules link straight in, `trial` modules send a signed-out visitor to their trial route,
 * and only `auth` modules open the login popup.
 *
 * The lab's principles are deliberately not repeated here — `/about` carries them, and a
 * generic "how we build" section between the product and the other projects would dilute
 * exactly the hierarchy this page exists to state.
 */

interface OtherProject {
  href: string;
  title: string;
  note: string;
  description: string;
  requiresAuth?: boolean;
  external?: boolean;
}

const otherProjects: OtherProject[] = [
  {
    href: "https://map.bcailab.com",
    title: "Mapdown",
    note: "No account",
    description:
      "A keyboard-driven Markdown mind-map editor. Enter adds a sibling, Tab adds a child, and maps live in your browser — so it works offline and on the first visit.",
    external: true
  },
  {
    href: "/posts",
    title: "Posts",
    note: "Account required",
    description:
      "A quiet publishing tool. Write in Markdown, publish in one step, share a clean public URL.",
    requiresAuth: true
  },
  {
    href: "https://vanmemo.com",
    title: "VanMemo",
    note: "Separate site",
    description:
      "A calm home for fleeting thoughts. Capture without picking a folder or inventing a title, then find it again by tag, search, or pin.",
    external: true
  }
];

/** What a signed-out visitor may do with a module, in the words the cards use. */
const ACCESS_NOTE: Record<EnglishModule["access"], string> = {
  public: "No account",
  trial: "Free to try",
  auth: "Account"
};

export default function Index() {
  const { user } = useOutletContext<{ user: User | null }>();
  const [params] = useSearchParams();
  const loginHint = params.get("login");
  const signedIn = Boolean(user);

  const modules = ENGLISH_MODULES;

  const handleProjectClick = (event: React.MouseEvent, project: OtherProject) => {
    if (project.requiresAuth && !user) {
      event.preventDefault();
      openLoginPopup();
    }
  };

  const handleModuleClick = (event: React.MouseEvent, requiresLogin: boolean) => {
    if (!requiresLogin) return;
    event.preventDefault();
    openLoginPopup();
  };

  return (
    <div className="home">
      <section className="home-hero">
        <div className="home-eyebrow">
          <span className="home-eyebrow-line" />
          English Studio — from bcailab
        </div>
        <h1 className="home-title">
          Deliberate English practice,
          <br />
          <em>one attempt at a time.</em>
        </h1>
        <p className="home-desc">
          Take dictation sentence by sentence, recite passages and learn exactly what needs
          work, revise essays with a writing coach, generate audio for shadowing, and translate
          without leaving the page — one account, shared progress across every mode.
        </p>
        <div className="home-hero-actions">
          {signedIn ? (
            <Link to="/english" className="btn btn-primary">
              Open English Studio
            </Link>
          ) : (
            <>
              <Link to="/translate" className="btn btn-primary">
                Try Translate — no account
              </Link>
              <Link to="/english" className="btn btn-secondary">
                See what&rsquo;s inside
              </Link>
            </>
          )}
        </div>
        {signedIn ? null : (
          <p className="home-hero-access">
            Translate and Dictation are open to everyone. Reading and Writing include a free
            trial before you sign in.
          </p>
        )}
        {loginHint ? (
          <div className="home-login-hint">Please sign in to access the tools.</div>
        ) : null}
      </section>

      <section className="home-modules">
        <div className="home-tools-header">
          <span className="home-tools-label">Inside English Studio</span>
          <span className="home-tools-count">{modules.length}</span>
        </div>
        <div className="home-tool-grid">
          {modules.map((module) => {
            const planned = module.status === "planned";
            const destination = resolveEnglishModuleDestination(module, signedIn);
            const card = (
              <div className="home-tool-card">
                <div className="home-tool-head">
                  <h2 className="home-tool-title">{module.label}</h2>
                  {planned ? (
                    <span className="home-tool-badge">Planned</span>
                  ) : (
                    <span className="home-tool-arrow">&rarr;</span>
                  )}
                </div>
                <p className="home-tool-desc">{module.description}</p>
                {planned || !signedIn ? (
                  <div className="home-tool-tags">
                    <span className="home-tool-tag">
                      {planned ? "Not built yet" : ACCESS_NOTE[module.access]}
                    </span>
                  </div>
                ) : null}
              </div>
            );

            return planned ? (
              <div key={module.id} className="home-tool-card-link is-planned">
                {card}
              </div>
            ) : (
              <Link
                key={module.id}
                to={destination.href}
                className="home-tool-card-link"
                onClick={(e) => handleModuleClick(e, destination.requiresLogin)}
              >
                {card}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="home-projects">
        <div className="home-tools-header">
          <span className="home-tools-label">Other projects</span>
          <span className="home-tools-count">{otherProjects.length}</span>
        </div>
        <div className="home-project-list">
          {otherProjects.map((project) => {
            const body = (
              <>
                <div className="home-project-head">
                  <h2 className="home-project-title">{project.title}</h2>
                  <span className="home-project-note">{project.note}</span>
                  <span className="home-tool-arrow">&rarr;</span>
                </div>
                <p className="home-project-desc">{project.description}</p>
              </>
            );

            return project.external ? (
              <a
                key={project.href}
                href={project.href}
                target="_blank"
                rel="noopener noreferrer"
                className="home-project"
              >
                {body}
              </a>
            ) : (
              <Link
                key={project.href}
                to={project.href}
                className="home-project"
                onClick={(e) => handleProjectClick(e, project)}
              >
                {body}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="home-lab">
        <div className="home-tools-header">
          <span className="home-tools-label">The lab</span>
        </div>
        <div className="home-lab-body">
          <p>
            bcailab is built and run by <strong>Zhongxing Sun</strong> from Burnaby, British
            Columbia, Canada. The lab stays small on purpose so the shipped tools can stay
            sharp — growth is deliberate, one useful product at a time.
          </p>
          <div className="home-lab-links">
            <Link to="/about" className="home-lab-link">
              About the lab &rarr;
            </Link>
            <a
              href="https://x.com/Zhongxing_Sun"
              target="_blank"
              rel="noopener noreferrer"
              className="home-lab-link"
            >
              Follow on X &rarr;
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
