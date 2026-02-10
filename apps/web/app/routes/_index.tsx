import { Link, useOutletContext, useSearchParams } from "@remix-run/react";
import { Card } from "@bcailab/ui";
import type { User } from "@bcailab/db";

const tools = [
  {
    slug: "posts",
    title: "Posts",
    description: "Publish Markdown posts and share a clean public URL.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    )
  },
  {
    slug: "tts",
    title: "Speech",
    description: "Generate Chirp3/Neural2 speech audio with optional synced text.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 6a9 9 0 0 1 0 12" />
      </svg>
    )
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
      <section className="hero">
        <div className="hero-badge">
          <span className="hero-badge-dot" />
          Open for exploration
        </div>
        <h1 className="hero-title">
          Personal utilities,<br />
          <span className="hero-title-accent">quietly useful.</span>
        </h1>
        <p className="hero-subtitle">
          A small lab for personal tools. Everything shares the same login,
          so you can move from one tool to the next without friction.
        </p>
        {loginHint && (
          <div className="hero-login-hint">
            Please sign in to access the tools.
          </div>
        )}
      </section>

      <section className="tools-section">
        <div className="section-header">
          <h2 className="section-title">Tools</h2>
          <span className="section-count">{tools.length}</span>
        </div>
        <div className="tool-grid">
          {tools.map((tool) => (
            <Link key={tool.slug} to={`/${tool.slug}`} className="tool-card-link" onClick={(e) => { if (!user) { e.preventDefault(); handleLogin(); } }}>
              <Card className="tool-card">
                <div className="tool-card-icon">{tool.icon}</div>
                <div className="tool-card-content">
                  <h3 className="tool-card-title">{tool.title}</h3>
                  <p className="tool-card-desc">{tool.description}</p>
                </div>
                <div className="tool-card-arrow">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </section>

    </div>
  );
}
