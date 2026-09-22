import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useOutletContext } from "@remix-run/react";
import type { User } from "@bcailab/db";
import { getOptionalUser } from "~/utils/auth.server";
import { openLoginPopup } from "~/utils/login-popup";
import {
  ENGLISH_MODULES,
  moduleCopy,
  resolveEnglishModuleDestination,
  type EnglishModule
} from "~/english-modules";
import { useT } from "~/i18n/context";
import { metaTranslator } from "~/i18n/meta";

const MODULE_GROUPS = [
  { id: "practice", labelKey: "common.practice" },
  { id: "utility", labelKey: "common.tools" }
] as const;

export const handle = {
  breadcrumb: { label: "english", labelKey: "breadcrumb.english", href: "/english" }
};

/**
 * `/english` keeps its single, memorable URL but has one job per audience: signed-out
 * visitors get the public landing page (SEO, module cards, trial routing), signed-in
 * learners are sent to the Home. A redirect rather than one dual-purpose route, so
 * marketing concerns and the app surface stay separable — see the IA v2 design §4.1.
 */
export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await getOptionalUser(request, context);
  if (user) throw redirect("/english/home");
  return json({});
};

export const meta: MetaFunction = ({ matches }) => [
  { title: "English Studio · bcailab" },
  { name: "description", content: metaTranslator(matches)("meta.english.description") }
];

export default function EnglishLanding() {
  const { user } = useOutletContext<{ user: User | null }>();
  const t = useT();

  const handleModuleClick = (event: React.MouseEvent, mod: EnglishModule) => {
    if (mod.status === "planned") {
      event.preventDefault();
      return;
    }
    if (resolveEnglishModuleDestination(mod, Boolean(user)).requiresLogin) {
      event.preventDefault();
      openLoginPopup();
    }
  };

  return (
    <div className="landing">
      <section className="landing-hero">
        <div className="home-eyebrow">
          <span className="home-eyebrow-line" />
          {t("english.eyebrow")}
        </div>
        <h1 className="landing-title">English Studio</h1>
        <p className="landing-tagline">{t("english.tagline")}</p>
        <p className="landing-desc">{t("english.desc")}</p>
        {!user ? (
          <button type="button" className="landing-cta" onClick={() => openLoginPopup()}>
            {t("english.signInToStart")}
          </button>
        ) : null}
      </section>

      <section className="landing-modules">
        <div className="home-tools-header">
          <span className="home-tools-label">{t("english.modules")}</span>
          <span className="home-tools-count">{ENGLISH_MODULES.length}</span>
        </div>
        <div className="landing-module-groups">
          {MODULE_GROUPS.map((group) => (
            <section key={group.id} className="landing-module-group">
              <h2 className="landing-module-group-title">{t(group.labelKey)}</h2>
              <div className="landing-module-list">
                {ENGLISH_MODULES.filter((mod) => mod.group === group.id).map((mod) => {
                  const destination = resolveEnglishModuleDestination(mod, Boolean(user));
                  const copy = moduleCopy(t, mod);
                  return (
                    <Link
                      key={mod.id}
                      to={destination.href}
                      className={`landing-module${mod.status === "planned" ? " is-planned" : ""}`}
                      onClick={(e) => handleModuleClick(e, mod)}
                    >
                      <div className="landing-module-main">
                        <div className="landing-module-head">
                          <h3 className="landing-module-title">{copy.label}</h3>
                          {mod.status === "planned" ? (
                            <span className="home-tool-badge">{t("english.soon")}</span>
                          ) : (
                            <span className="home-tool-arrow">&rarr;</span>
                          )}
                        </div>
                        <p className="landing-module-desc">{copy.description}</p>
                        <p className="landing-module-detail">{copy.detail}</p>
                        <div className="home-tool-tags">
                          {copy.tags.map((tag) => (
                            <span key={tag} className="home-tool-tag">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section className="landing-note">
        <h2 className="landing-note-title">{t("english.noteTitle")}</h2>
        <p>{t("english.noteBody")}</p>
        {user ? (
          <p style={{ marginTop: "0.75rem" }}>
            <Link to="/english/progress" className="home-tool-arrow-link">
              {t("english.viewProgress")}
            </Link>
          </p>
        ) : null}
      </section>
    </div>
  );
}
