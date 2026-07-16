import type { MetaFunction } from "@remix-run/cloudflare";
import { Link, useOutletContext } from "@remix-run/react";
import type { User } from "@bcailab/db";
import { openLoginPopup } from "~/utils/login-popup";

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

interface Module {
  slug: string;
  title: string;
  description: string;
  detail: string;
  tags: string[];
  planned?: boolean;
  /** Public modules are usable without signing in. */
  public?: boolean;
}

const modules: Module[] = [
  {
    slug: "reading",
    title: "Reading & Recitation",
    description: "Read aloud or recite passages, get AI evaluation on every attempt.",
    detail:
      "Save passages, record attempts, and receive structured feedback on pronunciation, fluency, and completeness — with a progress dashboard across attempts.",
    tags: ["Speaking", "Evaluation", "Progress"]
  },
  {
    slug: "writing",
    title: "Writing Coach",
    description: "Draft, get structured feedback, revise, and track rounds.",
    detail:
      "Choose a coach persona, submit a draft, and work through revision rounds with scored feedback that remembers where you left off.",
    tags: ["Writing", "Feedback", "Revision"]
  },
  {
    slug: "translate",
    title: "Translate",
    description: "DeepL-style translation between English, Chinese, and more.",
    detail:
      "Two-pane translation driven by an LLM: auto-detect the source language, keep formatting intact, and swap directions in one click. Free to try without an account.",
    tags: ["Translation", "LLM", "Free to try"],
    public: true
  },
  {
    slug: "speech",
    title: "Speech",
    description: "Turn any text into natural audio you can replay anywhere.",
    detail:
      "Generate MP3 audio with natural voices, keep a private history, and use it as listening or shadowing material.",
    tags: ["TTS", "Listening"]
  },
  {
    slug: "esl/dictionary",
    title: "AI Dictionary",
    description: "Word and phrase explanation with bilingual support.",
    detail: "Planned: contextual explanations that connect back to your reading and writing practice.",
    tags: ["Vocabulary"],
    planned: true
  }
];

export default function EnglishLanding() {
  const { user } = useOutletContext<{ user: User | null }>();

  const handleModuleClick = (event: React.MouseEvent, mod: Module) => {
    if (mod.planned) {
      event.preventDefault();
      return;
    }
    if (!user && !mod.public) {
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
            Continue with Google
          </button>
        ) : null}
      </section>

      <section className="landing-modules">
        <div className="home-tools-header">
          <span className="home-tools-label">Modules</span>
          <span className="home-tools-count">{modules.length}</span>
        </div>
        <div className="landing-module-list">
          {modules.map((mod) => (
            <Link
              key={mod.slug}
              to={`/${mod.slug}`}
              className={`landing-module${mod.planned ? " is-planned" : ""}`}
              onClick={(e) => handleModuleClick(e, mod)}
            >
              <div className="landing-module-main">
                <div className="landing-module-head">
                  <h2 className="landing-module-title">{mod.title}</h2>
                  {mod.planned ? (
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
          ))}
        </div>
      </section>

      <section className="landing-note">
        <h2 className="landing-note-title">One account, shared progress</h2>
        <p>
          Every module uses the same Google sign-in and the same design language.
          Reading and writing keep per-module progress dashboards, and history stays
          private to your account.
        </p>
      </section>
    </div>
  );
}
