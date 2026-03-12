import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData } from "@remix-run/react";
import * as React from "react";
import { requireUser } from "~/utils/auth.server";
import { listWritingAgents, DEFAULT_AGENT_ID } from "~/utils/writing-agents";
import { getWritingAgentOrDefault } from "~/utils/writing-agents";
import { createArticleWithFirstRevision, countWords } from "~/utils/writing-article.server";
import { WritingEditor } from "~/components/WritingEditor";

type ActionData = { error?: string };

const FEEDBACK_LANGUAGE_KEY = "bcailab-writing-feedback-language";

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const user = await requireUser(request, context);
  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "createArticle");

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
    return redirect(`/writing/${articleId}`);
  } catch {
    return json<ActionData>({ error: "Failed to create article. Please retry." }, { status: 500 });
  }
};

export default function WritingIndexPage() {
  const actionData = useActionData<typeof action>();
  const [agentType, setAgentType] = React.useState(DEFAULT_AGENT_ID);
  const [text, setText] = React.useState("");
  const [feedbackLanguage, setFeedbackLanguage] = React.useState<"en" | "zh">("en");
  const agent = getWritingAgentOrDefault(agentType);
  const agents = listWritingAgents();

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(FEEDBACK_LANGUAGE_KEY);
    if (stored === "zh" || stored === "en") setFeedbackLanguage(stored);
  }, []);

  const handleLanguageChange = (lang: "en" | "zh") => {
    setFeedbackLanguage(lang);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FEEDBACK_LANGUAGE_KEY, lang);
    }
  };

  return (
    <div className="writing-index">
      <div className="writing-index-header">
        <h2>New Writing Session</h2>
        <p className="writing-index-subtitle">{agent.description}</p>
      </div>

      <form method="post" action="?index" className="writing-index-form">
        <input type="hidden" name="_intent" value="createArticle" />
        <input type="hidden" name="feedbackLanguage" value={feedbackLanguage} />

        <div className="writing-index-controls">
          <div className="writing-control-group">
            <label className="writing-label" htmlFor="agentType">
              Writing type
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

          <div className="writing-control-group">
            <label className="writing-label" htmlFor="feedbackLang">
              Feedback language
            </label>
            <select
              id="feedbackLang"
              className="writing-select"
              value={feedbackLanguage}
              onChange={(e) => handleLanguageChange(e.currentTarget.value as "en" | "zh")}
            >
              <option value="en">English</option>
              <option value="zh">Chinese</option>
            </select>
          </div>
        </div>

        <WritingEditor value={text} onChange={setText} agent={agent} />

        {actionData?.error ? (
          <div className="form-error">{actionData.error}</div>
        ) : null}

        <div className="writing-index-actions">
          <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
            Submit for feedback
          </button>
        </div>
      </form>
    </div>
  );
}
