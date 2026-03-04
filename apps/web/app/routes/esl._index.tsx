import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link } from "@remix-run/react";
import { Card } from "@bcailab/ui";
import { requireUser } from "~/utils/auth.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  await requireUser(request, context);
  return json({});
};

const modules = [
  {
    key: "reading",
    title: "Reading / Recitation",
    description: "Read aloud or recite passages with versioned attempt tracking.",
    href: "/esl/reading",
    status: "Available"
  },
  {
    key: "dictionary",
    title: "AI Dictionary",
    description: "Word/phrase/sentence explanation with bilingual support.",
    href: "",
    status: "Planned"
  },
  {
    key: "writing",
    title: "Writing Coach",
    description: "Iterative feedback loop for draft revisions.",
    href: "",
    status: "Planned"
  }
] as const;

export default function EslIndexPage() {
  return (
    <div className="tool-page">
      <p className="tool-desc">
        ESL groups reading, dictionary, and writing practice into one shared learner profile.
      </p>
      <div className="esl-module-grid">
        {modules.map((module) => (
          <Card key={module.key} className="esl-module-card">
            <div className="esl-module-head">
              <h3 className="esl-module-title">{module.title}</h3>
              <span className={`badge esl-module-status ${module.status === "Available" ? "is-live" : ""}`}>
                {module.status}
              </span>
            </div>
            <p className="esl-module-desc">{module.description}</p>
            {module.href ? (
              <Link to={module.href} className="btn btn-primary btn-sm">
                Open
              </Link>
            ) : (
              <span className="btn btn-ghost btn-sm is-disabled">Coming soon</span>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
