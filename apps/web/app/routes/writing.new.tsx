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
  logWritingSchemaMissing
} from "~/utils/writing-schema.server";
import { useT } from "~/i18n/context";
import { metaTranslator } from "~/i18n/meta";
import { getRequestTranslator } from "~/i18n/locale.server";
import { writingAgentCopy } from "~/utils/writing-agent-copy";

type ActionData = { error?: string; redirectTo?: string };

export const meta: MetaFunction = ({ matches }) => [
  { title: metaTranslator(matches)("meta.writingNew.title") }
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
  const t = getRequestTranslator(request);
  if (intent !== "createArticle") {
    return json<ActionData>({ error: t("writing.error.unsupported") }, { status: 400 });
  }

  const userText = String(formData.get("userText") ?? "").trim();
  if (!userText) {
    return json<ActionData>({ error: t("writing.error.empty") }, { status: 400 });
  }
  if (countWords(userText) < 10) {
    return json<ActionData>({ error: t("writing.error.tooShort") }, { status: 400 });
  }

  const requestedAgent = String(formData.get("agentType") ?? DEFAULT_AGENT_ID);
  const agentType = requestedAgent === "ielts_task1" ? DEFAULT_AGENT_ID : requestedAgent;
  const feedbackLanguage = formData.get("feedbackLanguage") === "zh" ? "zh" as const : "en" as const;
  const topic = String(formData.get("topic") ?? "").trim() || undefined;
  const startKey = String(formData.get("startKey") ?? "");
  if (startKey.length < 16 || startKey.length > 200) {
    return json<ActionData>({ error: t("writing.error.draftExpired") }, { status: 400 });
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
      return json<ActionData>({ error: t("writing.unavailableError") }, { status: 503 });
    }
    return json<ActionData>({ error: t("writing.error.createFailed") }, { status: 500 });
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
  const t = useT();
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
          title={t("writing.newFreeform")}
          description={t("writing.newFreeformDescription")}
          action={<Link to="/writing" className="btn btn-secondary">{t("writing.browseAssignmentsButton")}</Link>}
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
                <label className="writing-label" htmlFor="agentType">{t("writing.coach")}</label>
                <select
                  id="agentType"
                  name="agentType"
                  className="writing-select"
                  value={agentType}
                  onChange={(event) => local.update({ coach: event.currentTarget.value })}
                >
                  {agents.map((entry) => (
                    <option key={entry.id} value={entry.id}>{writingAgentCopy(t, entry).label}</option>
                  ))}
                </select>
              </div>
              <p className="writing-coach-desc">{writingAgentCopy(t, agent).description}</p>
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

            {local.storageError ? <p role="alert">{t("writing.draftNotSaved")}</p> : null}
            {fetcher.data?.error ? <div className="form-error">{fetcher.data.error}</div> : null}
            <div className="writing-index-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!local.ready || !text.trim() || fetcher.state === "submitting"}
              >
                {fetcher.state === "submitting" ? t("writing.submitting") : t("writing.submitForFeedback")}
              </button>
            </div>
          </fetcher.Form>
        </StudioPageBody>
      </StudioPage>
    </div>
  );
}
