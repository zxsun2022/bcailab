import { Link, useSearchParams } from "@remix-run/react";
import { Card, Button } from "@bcailab/ui";

const tools = [
  {
    slug: "text",
    title: "Text Publisher",
    description: "Publish lightweight notes with Markdown. Share a clean public URL.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    )
  }
];

export default function Index() {
  const [params] = useSearchParams();
  const loginHint = params.get("login");

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
            <Link key={tool.slug} to={`/${tool.slug}`} className="tool-card-link">
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
