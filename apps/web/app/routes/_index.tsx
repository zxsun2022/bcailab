import { Link, useOutletContext, useSearchParams } from "@remix-run/react";
import type { User } from "@bcailab/db";
import {
  ENGLISH_MODULES,
  moduleCopy,
  resolveEnglishModuleDestination,
  type EnglishModule
} from "~/english-modules";
import { openLoginPopup } from "~/utils/login-popup";
import { RichMessage, useT } from "~/i18n/context";
import type { MessageKey } from "~/i18n/translate";

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
  /** A product name, shown as written in every interface language. */
  title: string;
  noteKey: MessageKey;
  descriptionKey: MessageKey;
  requiresAuth?: boolean;
  external?: boolean;
}

const otherProjects: OtherProject[] = [
  {
    href: "https://map.bcailab.com",
    title: "Mapdown",
    noteKey: "home.project.mapdown.note",
    descriptionKey: "home.project.mapdown.description",
    external: true
  },
  {
    href: "/posts",
    title: "Posts",
    noteKey: "home.project.posts.note",
    descriptionKey: "home.project.posts.description",
    requiresAuth: true
  },
  {
    href: "https://vanmemo.com",
    title: "VanMemo",
    noteKey: "home.project.vanmemo.note",
    descriptionKey: "home.project.vanmemo.description",
    external: true
  }
];

/** What a signed-out visitor may do with a module, in the words the cards use. */
const ACCESS_NOTE: Record<EnglishModule["access"], MessageKey> = {
  public: "moduleAccess.public",
  trial: "moduleAccess.trial",
  auth: "moduleAccess.auth"
};

export default function Index() {
  const { user } = useOutletContext<{ user: User | null }>();
  const t = useT();
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
          {t("home.eyebrow")}
        </div>
        <h1 className="home-title">
          {t("home.titleLead")}
          <br />
          <em>{t("home.titleEmphasis")}</em>
        </h1>
        <p className="home-desc">{t("home.desc")}</p>
        <div className="home-hero-actions">
          {signedIn ? (
            <Link to="/english" className="btn btn-primary">
              {t("home.openStudio")}
            </Link>
          ) : (
            <>
              <Link to="/translate" className="btn btn-primary">
                {t("home.tryTranslate")}
              </Link>
              <Link to="/english" className="btn btn-secondary">
                {t("home.seeInside")}
              </Link>
            </>
          )}
        </div>
        {signedIn ? null : (
          <p className="home-hero-access">{t("home.access")}</p>
        )}
        {loginHint ? (
          <div className="home-login-hint">{t("home.loginHint")}</div>
        ) : null}
      </section>

      <section className="home-modules">
        <div className="home-tools-header">
          <span className="home-tools-label">{t("home.inside")}</span>
          <span className="home-tools-count">{modules.length}</span>
        </div>
        <div className="home-tool-grid">
          {modules.map((module) => {
            const planned = module.status === "planned";
            const destination = resolveEnglishModuleDestination(module, signedIn);
            const copy = moduleCopy(t, module);
            const card = (
              <div className="home-tool-card">
                <div className="home-tool-head">
                  <h2 className="home-tool-title">{copy.label}</h2>
                  {planned ? (
                    <span className="home-tool-badge">{t("home.planned")}</span>
                  ) : (
                    <span className="home-tool-arrow">&rarr;</span>
                  )}
                </div>
                <p className="home-tool-desc">{copy.description}</p>
                {planned || !signedIn ? (
                  <div className="home-tool-tags">
                    <span className="home-tool-tag">
                      {planned ? t("home.notBuilt") : t(ACCESS_NOTE[module.access])}
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
          <span className="home-tools-label">{t("home.otherProjects")}</span>
          <span className="home-tools-count">{otherProjects.length}</span>
        </div>
        <div className="home-project-list">
          {otherProjects.map((project) => {
            const body = (
              <>
                <div className="home-project-head">
                  <h2 className="home-project-title">{project.title}</h2>
                  <span className="home-project-note">{t(project.noteKey)}</span>
                  <span className="home-tool-arrow">&rarr;</span>
                </div>
                <p className="home-project-desc">{t(project.descriptionKey)}</p>
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
          <span className="home-tools-label">{t("home.lab")}</span>
        </div>
        <div className="home-lab-body">
          <p>
            <RichMessage id="home.labBody" values={{ name: <strong>Zhongxing Sun</strong> }} />
          </p>
          <div className="home-lab-links">
            <Link to="/about" className="home-lab-link">
              {t("home.aboutLab")}
            </Link>
            <a
              href="https://x.com/Zhongxing_Sun"
              target="_blank"
              rel="noopener noreferrer"
              className="home-lab-link"
            >
              {t("home.followX")}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
