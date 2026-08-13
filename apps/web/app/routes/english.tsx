import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useOutletContext } from "@remix-run/react";
import type { User } from "@bcailab/db";
import { getOptionalUser } from "~/utils/auth.server";
import { openLoginPopup } from "~/utils/login-popup";
import {
  ENGLISH_MODULES,
  resolveEnglishModuleDestination,
  type EnglishModule
} from "~/english-modules";

const MODULE_GROUPS = [
  { id: "practice", label: "Practice" },
  { id: "utility", label: "Tools" }
] as const;

export const handle = {
  breadcrumb: { label: "english", href: "/english" }
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

export const meta: MetaFunction = () => [
  { title: "English Studio · bcailab" },
  {
    name: "description",
    content:
      "One workspace for focused English practice: read, write, listen, speak, and translate with AI feedback along the way."
  }
];

export default function EnglishLanding() {
  const { user } = useOutletContext<{ user: User | null }>();

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
          A bcailab product
        </div>
        <h1 className="landing-title">English Studio</h1>
        <p className="landing-tagline">
          One workspace for focused English practice — read, write, listen, speak,
          and translate with AI feedback along the way.
        </p>
        <p className="landing-desc">
          English Studio brings the lab&rsquo;s language tools together in one place. Practice
          through real workflows: recite a passage and learn what needs work; revise an essay
          with an AI coach; turn text into audio for listening and shadowing; and translate
          without leaving your workspace.
        </p>
        {!user ? (
          <button type="button" className="landing-cta" onClick={() => openLoginPopup()}>
            Sign in to start
          </button>
        ) : null}
      </section>

      <section className="landing-modules">
        <div className="home-tools-header">
          <span className="home-tools-label">Modules</span>
          <span className="home-tools-count">{ENGLISH_MODULES.length}</span>
        </div>
        <div className="landing-module-groups">
          {MODULE_GROUPS.map((group) => (
            <section key={group.id} className="landing-module-group">
              <h2 className="landing-module-group-title">{group.label}</h2>
              <div className="landing-module-list">
                {ENGLISH_MODULES.filter((mod) => mod.group === group.id).map((mod) => {
                  const destination = resolveEnglishModuleDestination(mod, Boolean(user));
                  return (
                    <Link
                      key={mod.id}
                      to={destination.href}
                      className={`landing-module${mod.status === "planned" ? " is-planned" : ""}`}
                      onClick={(e) => handleModuleClick(e, mod)}
                    >
                      <div className="landing-module-main">
                        <div className="landing-module-head">
                          <h3 className="landing-module-title">{mod.label}</h3>
                          {mod.status === "planned" ? (
                            <span className="home-tool-badge">Soon</span>
                          ) : (
                            <span className="home-tool-arrow">&rarr;</span>
                          )}
                        </div>
                        <p className="landing-module-desc">{mod.description}</p>
                        <p className="landing-module-detail">{mod.detail}</p>
                        <div className="home-tool-tags">
                          {mod.tags.map((tag) => (
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
        <h2 className="landing-note-title">One account, shared progress</h2>
        <p>
          Every module uses the same Google sign-in and the same design language.
          Your practice feeds one shared learner profile — dictation and reading both
          contribute — and history stays private to your account.
        </p>
        {user ? (
          <p style={{ marginTop: "0.75rem" }}>
            <Link to="/english/progress" className="home-tool-arrow-link">
              View your progress &rarr;
            </Link>
          </p>
        ) : null}
      </section>
    </div>
  );
}
