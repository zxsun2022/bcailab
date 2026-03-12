import { Link, useOutletContext, useSearchParams } from "@remix-run/react";
import { Card } from "@bcailab/ui";
import type { User } from "@bcailab/db";

interface Tool {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  planned?: boolean;
}

interface Category {
  key: string;
  label: string;
  tools: Tool[];
}

const categories: Category[] = [
  {
    key: "english",
    label: "Language Learning",
    tools: [
      {
        slug: "reading",
        title: "Reading / Recitation",
        description: "Read aloud or recite passages with AI-powered evaluation.",
        tags: ["Speaking", "Practice"]
      },
      {
        slug: "speech",
        title: "Speech",
        description: "Generate natural speech audio with optional synced text.",
        tags: ["TTS", "Audio"]
      },
      {
        slug: "esl/dictionary",
        title: "AI Dictionary",
        description: "Word and phrase explanation with bilingual support.",
        tags: ["Vocabulary", "AI"],
        planned: true
      },
      {
        slug: "writing",
        title: "Writing Coach",
        description: "Iterative feedback loop for draft revisions.",
        tags: ["Writing", "AI"]
      }
    ]
  },
  {
    key: "utilities",
    label: "Utilities",
    tools: [
      {
        slug: "posts",
        title: "Posts",
        description: "Publish Markdown posts and share a clean public URL.",
        tags: ["Markdown", "Publish"]
      }
    ]
  }
];

const totalTools = categories.reduce((sum, cat) => sum + cat.tools.length, 0);

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

  const handleToolClick = (event: React.MouseEvent, planned?: boolean) => {
    if (planned) {
      event.preventDefault();
      return;
    }
    if (!user) {
      event.preventDefault();
      handleLogin();
    }
  };

  return (
    <div className="home">
      <section className="home-hero">
        <div className="home-eyebrow">
          <span className="home-eyebrow-line" />
          Exploring AI applications
        </div>
        <h1 className="home-title">
          Where AI meets
          <br />
          <em>everyday life.</em>
        </h1>
        <p className="home-desc">
          We explore, iterate, and build tools that bring AI into real
          workflows — reading, writing, speaking, creating. One useful tool at a
          time.
        </p>
        {loginHint ? (
          <div className="home-login-hint">
            Please sign in to access the tools.
          </div>
        ) : null}
      </section>

      <section className="home-catalog">
        {categories.map((cat) => (
          <div key={cat.key} className="home-category">
            <div className="home-tools-header">
              <span className="home-tools-label">{cat.label}</span>
              <span className="home-tools-count">{cat.tools.length}</span>
            </div>
            <div className="home-tool-grid">
              {cat.tools.map((tool) => (
                <Link
                  key={tool.slug}
                  to={`/${tool.slug}`}
                  className={`home-tool-card-link${tool.planned ? " is-planned" : ""}`}
                  onClick={(e) => handleToolClick(e, tool.planned)}
                >
                  <Card className="home-tool-card">
                    <div className="home-tool-head">
                      <h3 className="home-tool-title">{tool.title}</h3>
                      {tool.planned ? (
                        <span className="home-tool-badge">Soon</span>
                      ) : (
                        <span className="home-tool-arrow">&rarr;</span>
                      )}
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
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
