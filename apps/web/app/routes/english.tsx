import type { MetaFunction } from "@remix-run/cloudflare";
import { Link, useOutletContext } from "@remix-run/react";
import type { User } from "@bcailab/db";
import { openLoginPopup } from "~/utils/login-popup";
import {
  ENGLISH_MODULES,
  resolveEnglishModuleDestination,
  type EnglishModule
} from "~/english-modules";

export const handle = {
  breadcrumb: { label: "english", href: "/english" }
};

export const meta: MetaFunction = () => [
  { title: "English Studio · bcailab" },
  {
    name: "description",
    content:
      "One workspace for English practice: reading and recitation, writing coaching, speech audio, and LLM-powered translation."
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
          One workspace for deliberate English practice — read, write, listen,
          and translate with AI feedback in the loop.
        </p>
        <p className="landing-desc">
          English Studio brings the lab&rsquo;s language tools together as one product.
          Practice is organized around real workflows instead of drills: recite a passage
          and hear what needs work, revise an essay across rounds with a coach, turn text
          into audio for shadowing, and translate without leaving the workspace.
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
        <div className="landing-module-list">
          {ENGLISH_MODULES.map((mod) => {
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
                    <h2 className="landing-module-title">{mod.label}</h2>
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
