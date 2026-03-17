import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useFetcher, useNavigate } from "@remix-run/react";
import * as React from "react";
import { requireUser } from "~/utils/auth.server";
import { listWritingAgents, DEFAULT_AGENT_ID } from "~/utils/writing-agents";
import { getWritingAgentOrDefault } from "~/utils/writing-agents";
import { createArticleWithFirstRevision, countWords } from "~/utils/writing-article.server";
import { WritingEditor } from "~/components/WritingEditor";
import { useWritingFeedbackLanguage } from "~/utils/use-writing-feedback-language";

type ActionData = { error?: string; redirectTo?: string };

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const user = await requireUser(request, context);
  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "createArticle");
  const transport = String(formData.get("_transport") ?? "document");

  if (intent !== "createArticle") {
    return json<ActionData>({ error: "Unsupported action." }, { status: 400 });
  }

  const userText = String(formData.get("userText") ?? "").trim();
  if (!userText) {
    return json<ActionData>({ error: "Please write something before submitting." }, { status: 400 });
  }

  const wordCount = countWords(userText);
  if (wordCount < 10) {
    return json<ActionData>({ error: "Please write at least 10 words." }, { status: 400 });
  }

  const agentType = String(formData.get("agentType") ?? DEFAULT_AGENT_ID);
  const title = String(formData.get("title") ?? "").trim() || null;
  const feedbackLanguage = formData.get("feedbackLanguage") === "zh" ? "zh" as const : "en" as const;

  try {
    const { articleId } = await createArticleWithFirstRevision(context, {
      userId: user.id,
      agentType,
      userText,
      title,
      feedbackLanguage
    });
    const redirectTo = `/writing/${articleId}`;
    return transport === "fetcher"
      ? json<ActionData>({ redirectTo })
      : redirect(redirectTo);
  } catch {
    return json<ActionData>({ error: "Failed to create article. Please retry." }, { status: 500 });
  }
};

export default function WritingIndexPage() {
  const fetcher = useFetcher<ActionData>();
  const navigate = useNavigate();
  const [agentType, setAgentType] = React.useState(DEFAULT_AGENT_ID);
  const [text, setText] = React.useState("");
  const [feedbackLanguage] = useWritingFeedbackLanguage();
  const agent = getWritingAgentOrDefault(agentType);
  const agents = listWritingAgents();

  React.useEffect(() => {
    const redirectTo = fetcher.data?.redirectTo;
    if (!redirectTo) return;
    navigate(redirectTo);
  }, [fetcher.data, navigate]);

  return (
    <div className="writing-index">
      <div className="writing-index-header">
        <h2>New Writing Session</h2>
        <p className="writing-index-subtitle">{agent.description}</p>
      </div>

      <fetcher.Form method="post" action="?index" className="writing-index-form">
        <input type="hidden" name="_intent" value="createArticle" />
        <input type="hidden" name="_transport" value="fetcher" />
        <input type="hidden" name="feedbackLanguage" value={feedbackLanguage} />

        <WritingEditor value={text} onChange={setText} agent={agent} name="userText" />

        {fetcher.data?.error ? (
          <div className="form-error">{fetcher.data.error}</div>
        ) : null}

        <div className="writing-index-actions">
          <div className="writing-control-group">
            <label className="writing-label" htmlFor="agentType">
              Coach
            </label>
            <select
              id="agentType"
              name="agentType"
              className="writing-select"
              value={agentType}
              onChange={(e) => setAgentType(e.currentTarget.value)}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!text.trim() || fetcher.state === "submitting"}
          >
            {fetcher.state === "submitting" ? "Submitting..." : "Submit for feedback"}
          </button>
        </div>
      </fetcher.Form>
    </div>
  );
}
