import { Link, useOutletContext, useSearchParams } from "@remix-run/react";
import { Card } from "@bcailab/ui";
import type { User } from "@bcailab/db";

const tools = [
  {
    slug: "posts",
    title: "Posts",
    description: "Publish Markdown posts and share a clean public URL.",
    tags: ["Markdown", "Publish"]
  },
  {
    slug: "tts",
    title: "Speech",
    description: "Generate Chirp3/Neural2 speech audio with optional synced text.",
    tags: ["TTS", "Chirp3"]
  }
];

export default function Index() {
  const { user } = useOutletContext<{ user: User | null }>();
  const [params] = useSearchParams();
  const loginHint = params.get("login");

  const handleLogin = () => {
    const width = 520;
    const height = 640;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    window.open(
      "/auth/google",
      "bcailab-auth",
      `width=${width},height=${height},left=${left},top=${top}`
    );
  };

  return (
    <div className="home">
      <section className="home-hero">
        <div className="home-hero-left">
          <div className="home-eyebrow">
            <span className="home-eyebrow-line" />
            Open for exploration
          </div>
          <h1 className="home-title">
            Personal utilities,
            <br />
            <em>quietly useful.</em>
          </h1>
          <p className="home-desc">
            A small lab for personal tools. Everything shares the same login, so you can move from
            one tool to the next without friction.
          </p>
          <div className="home-meta">Burnaby, British Columbia, Canada · © {new Date().getFullYear()}</div>
          {loginHint ? <div className="home-login-hint">Please sign in to access the tools.</div> : null}
        </div>

        <div className="home-hero-right">
          <div className="home-tools-header">
            <span className="home-tools-label">Tools</span>
            <span className="home-tools-count">{tools.length}</span>
          </div>
          <div className="home-tool-list">
            {tools.map((tool) => (
              <Link
                key={tool.slug}
                to={`/${tool.slug}`}
                className="home-tool-card-link"
                onClick={(event) => {
                  if (!user) {
                    event.preventDefault();
                    handleLogin();
                  }
                }}
              >
                <Card className="home-tool-card">
                  <div className="home-tool-head">
                    <h3 className="home-tool-title">{tool.title}</h3>
                    <span className="home-tool-arrow">→</span>
                  </div>
                  <p className="home-tool-desc">{tool.description}</p>
                  <div className="home-tool-tags">
                    {tool.tags.map((tag) => (
                      <span key={tag} className="home-tool-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </Card>
              </Link>
            ))}
            <div className="home-more-tools">
              <span className="home-more-tools-text">+ More tools in development</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
