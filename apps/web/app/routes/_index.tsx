import { Link, useSearchParams } from "@remix-run/react";
import { Card, Button, Badge } from "@bcailab/ui";

const tools = [
  {
    slug: "text",
    title: "Text Publisher",
    description: "Publish lightweight notes with Markdown. Share a clean public URL."
  }
];

export default function Index() {
  const [params] = useSearchParams();
  const loginHint = params.get("login");

  return (
    <div>
      <section className="hero">
        <Badge>bcailab tools</Badge>
        <h1>Personal utilities, quietly useful.</h1>
        <p>
          bcailab is a small lab for personal tools. Everything shares the same login, so you can move
          from one tool to the next without friction.
        </p>
        {loginHint ? (
          <div style={{ marginTop: "20px", color: "var(--accent)" }}>
            Please sign in to access the tools.
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="section-title">Available tools</h2>
        <div className="tool-grid">
          {tools.map((tool) => (
            <Card key={tool.slug} className="tool-card">
              <h3>{tool.title}</h3>
              <p style={{ color: "var(--muted)" }}>{tool.description}</p>
              <Link to={`/${tool.slug}`}>
                <Button>Open tool</Button>
              </Link>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
