import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction
} from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import * as React from "react";
import { useWritingDraft } from "~/utils/use-writing-draft";
import { WritingEditor } from "~/components/WritingEditor";
import { StudioPage, StudioPageBody, StudioPageHeader } from "~/components/StudioPage";
import { requireUser } from "~/utils/auth.server";
import { useWritingFeedbackLanguage } from "~/utils/use-writing-feedback-language";
import { createArticleWithFirstRevision, countWords } from "~/utils/writing-article.server";
import {
  DEFAULT_AGENT_ID,
  getWritingAgentOrDefault,
  listWritingAgents
} from "~/utils/writing-agents";
import {
  isWritingSchemaMissingError,
  logWritingSchemaMissing,
  WRITING_UNAVAILABLE_ERROR
} from "~/utils/writing-schema.server";

type ActionData = { error?: string; redirectTo?: string };

export const meta: MetaFunction = () => [
  { title: "New freeform session · Writing · English Studio · bcailab" }
];

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  return json({ userId: user.id, startKey: crypto.randomUUID() });
};

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
  if (countWords(userText) < 10) {
    return json<ActionData>({ error: "Please write at least 10 words." }, { status: 400 });
  }

  const requestedAgent = String(formData.get("agentType") ?? DEFAULT_AGENT_ID);
  const agentType = requestedAgent === "ielts_task1" ? DEFAULT_AGENT_ID : requestedAgent;
  const feedbackLanguage = formData.get("feedbackLanguage") === "zh" ? "zh" as const : "en" as const;
  const topic = String(formData.get("topic") ?? "").trim() || undefined;
  const startKey = String(formData.get("startKey") ?? "");
  if (startKey.length < 16 || startKey.length > 200) {
    return json<ActionData>({ error: "This draft has expired. Refresh and try again." }, { status: 400 });
  }

  try {
    const { articleId } = await createArticleWithFirstRevision(context, {
      userId: user.id,
      agentType,
      userText,
      feedbackLanguage,
      topic,
      startKey
    });
    const redirectTo = `/writing/${articleId}`;
    return transport === "fetcher"
      ? json<ActionData>({ redirectTo })
      : redirect(redirectTo);
  } catch (error) {
    if (isWritingSchemaMissingError(error)) {
      logWritingSchemaMissing("writing.new.action", error);
      return json<ActionData>({ error: WRITING_UNAVAILABLE_ERROR }, { status: 503 });
    }
    return json<ActionData>({ error: "Unable to create this session. Please try again." }, { status: 500 });
  }
};

export default function WritingNewPage() {
  const data = useLoaderData<typeof loader>();
  return <WritingNewReady key={data.userId} {...data} />;
}
function WritingNewReady({ userId, startKey }: { userId: string; startKey: string }) {
  const local = useWritingDraft(userId, "freeform", { coach: DEFAULT_AGENT_ID, startKey });
  const { text, topic, coach: agentType, startKey: stableStartKey } = local.draft;
  const fetcher = useFetcher<ActionData>();
  const navigate = useNavigate();
  const [feedbackLanguage] = useWritingFeedbackLanguage();
  const agent = getWritingAgentOrDefault(agentType);
  const agents = listWritingAgents().filter((entry) => entry.id !== "ielts_task1");

  const { completeSubmit } = local;
  React.useEffect(() => {
    if (!fetcher.data?.redirectTo) return;
    completeSubmit();
    navigate(fetcher.data.redirectTo);
  }, [fetcher.data, navigate, completeSubmit]);

  return (
    <div className="studio-main-scroll">
      <StudioPage width="standard">
        <StudioPageHeader
          title="New freeform session"
          description="Bring your own topic, choose a coach, and keep revising after the first feedback round."
          action={<Link to="/writing" className="btn btn-secondary">Browse assignments</Link>}
        />
        <StudioPageBody className="writing-index">
          <fetcher.Form method="post" className="writing-index-form" onSubmit={local.beginSubmit}>
            <input type="hidden" name="_intent" value="createArticle" />
            <input type="hidden" name="_transport" value="fetcher" />
            <input type="hidden" name="feedbackLanguage" value={feedbackLanguage} />
            <input type="hidden" name="topic" value={topic} />
            <input type="hidden" name="startKey" value={stableStartKey} />

            <div className="writing-coach-row">
              <div className="writing-control-group">
                <label className="writing-label" htmlFor="agentType">Coach</label>
                <select
                  id="agentType"
                  name="agentType"
                  className="writing-select"
                  value={agentType}
                  onChange={(event) => local.update({ coach: event.currentTarget.value })}
                >
                  {agents.map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.label}</option>
                  ))}
                </select>
              </div>
              <p className="writing-coach-desc">{agent.description}</p>
            </div>

            <WritingEditor
              value={text}
              onChange={text => local.update({ text })}
              agent={agent}
              name="userText"
              showTopic
              topic={topic}
              onTopicChange={topic => local.update({ topic })}
            />

            {local.storageError ? <p role="alert">Draft could not be saved on this device. Keep this page open or copy your text before leaving.</p> : null}
            {fetcher.data?.error ? <div className="form-error">{fetcher.data.error}</div> : null}
            <div className="writing-index-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!local.ready || !text.trim() || fetcher.state === "submitting"}
              >
                {fetcher.state === "submitting" ? "Submitting..." : "Submit for feedback"}
              </button>
            </div>
          </fetcher.Form>
        </StudioPageBody>
      </StudioPage>
    </div>
  );
}
