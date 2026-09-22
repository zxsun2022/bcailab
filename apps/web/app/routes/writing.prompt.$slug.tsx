import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction
} from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import * as React from "react";
import {
  getPublishedWritingPromptBySlug,
  listWritingSessionsByPrompt,
  type WritingAssignmentSnapshot,
  type WritingPromptSession
} from "@bcailab/db";
import { useWritingDraft } from "~/utils/use-writing-draft";
import { LocalDateTime } from "~/components/LocalDateTime";
import { StudioPage, StudioPageBody, StudioPageHeader } from "~/components/StudioPage";
import { StudioBreadcrumbs } from "~/components/StudioBreadcrumbs";
import { WritingEditor } from "~/components/WritingEditor";
import { WritingPromptMaterial } from "~/components/WritingPromptMaterial";
import { WritingUnavailableState } from "~/components/WritingUnavailableState";
import { requireUser } from "~/utils/auth.server";
import { useWritingFeedbackLanguage } from "~/utils/use-writing-feedback-language";
import { createArticleWithFirstRevision, countWords } from "~/utils/writing-article.server";
import { getWritingAgentOrDefault } from "~/utils/writing-agents";
import { materializeWritingPrompt } from "~/utils/writing-prompt.server";
import {
  isWritingSchemaMissingError,
  logWritingSchemaMissing
} from "~/utils/writing-schema.server";
import { RichMessage, useT } from "~/i18n/context";
import { metaTranslator } from "~/i18n/meta";
import { getRequestTranslator } from "~/i18n/locale.server";

type ActionData = { error?: string; redirectTo?: string; code?: "stale_prompt" };

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const t = metaTranslator(matches);
  return [
    {
      title: data?.assignment?.title
        ? t("meta.writingPrompt.title", { title: data.assignment.title })
        : t("meta.writingPromptFallback.title")
    }
  ];
};

export const loader = async ({ request, context, params }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const slug = params.slug;
  if (!slug) throw new Response("Not found", { status: 404 });
  try {
    const row = await getPublishedWritingPromptBySlug(context.env.DB, slug);
    if (!row) throw new Response("Not found", { status: 404 });
    const { snapshot } = materializeWritingPrompt(row);
    const sessions = await listWritingSessionsByPrompt(context.env.DB, {
      userId: user.id,
      promptId: snapshot.promptId,
      limit: 5
    });
    return json({
      schemaReady: true as const,
      userId: user.id,
      assignment: snapshot,
      sessions,
      startKey: crypto.randomUUID()
    });
  } catch (error) {
    if (!isWritingSchemaMissingError(error)) throw error;
    logWritingSchemaMissing("writing.prompt.loader", error);
    return json(
      {
        schemaReady: false as const,
        assignment: null,
        sessions: { items: [], has_more: false },
        startKey: null
      },
      { status: 503 }
    );
  }
};

export const action = async ({ request, context, params }: ActionFunctionArgs) => {
  const user = await requireUser(request, context);
  const slug = params.slug;
  if (!slug) throw new Response("Not found", { status: 404 });
  const formData = await request.formData();
  const userText = String(formData.get("userText") ?? "").trim();
  const startKey = String(formData.get("startKey") ?? "");
  const renderedHash = String(formData.get("contentHash") ?? "");
  const transport = String(formData.get("_transport") ?? "document");
  const feedbackLanguage = formData.get("feedbackLanguage") === "zh" ? "zh" as const : "en" as const;
  const t = getRequestTranslator(request);
  if (!userText) {
    return json<ActionData>({ error: t("writing.error.empty") }, { status: 400 });
  }
  if (countWords(userText) < 10) {
    return json<ActionData>({ error: t("writing.error.tooShort") }, { status: 400 });
  }
  if (startKey.length < 16 || startKey.length > 200) {
    return json<ActionData>({ error: t("writing.error.draftExpired") }, { status: 400 });
  }

  try {
    const row = await getPublishedWritingPromptBySlug(context.env.DB, slug);
    if (!row || row.content_hash !== renderedHash) {
      return json<ActionData>(
        {
          code: "stale_prompt",
          error: t("writing.error.stalePrompt")
        },
        { status: 409 }
      );
    }
    const { snapshot } = materializeWritingPrompt(row);
    const { articleId } = await createArticleWithFirstRevision(context, {
      userId: user.id,
      agentType: snapshot.coachId,
      userText,
      title: snapshot.title,
      feedbackLanguage,
      topic: snapshot.promptText,
      promptId: snapshot.promptId,
      assignmentSnapshotJson: JSON.stringify(snapshot),
      startKey
    });
    const redirectTo = `/writing/${articleId}`;
    return transport === "fetcher"
      ? json<ActionData>({ redirectTo })
      : redirect(redirectTo);
  } catch (error) {
    if (isWritingSchemaMissingError(error)) {
      logWritingSchemaMissing("writing.prompt.action", error);
      return json<ActionData>({ error: t("writing.unavailableError") }, { status: 503 });
    }
    return json<ActionData>({ error: t("writing.error.startFailed") }, { status: 500 });
  }
};

export default function WritingPromptPage() {
  const data = useLoaderData<typeof loader>();
  if (!data.schemaReady) return <WritingUnavailableState />;

  return (
    <WritingPromptReadyPage
      key={`${data.userId}:${data.assignment.promptId}:${data.assignment.contentHash}`}
      userId={data.userId}
      assignment={data.assignment}
      sessions={data.sessions}
      startKey={data.startKey}
    />
  );
}

function WritingPromptReadyPage({
  userId,
  assignment,
  sessions,
  startKey
}: {
  userId: string;
  assignment: WritingAssignmentSnapshot;
  sessions: { items: WritingPromptSession[]; has_more: boolean };
  startKey: string;
}) {
  const local = useWritingDraft(userId, `prompt:${assignment.promptId}:${assignment.contentHash}`, { coach: assignment.coachId, startKey });
  const { text, startKey: stableStartKey } = local.draft;
  const fetcher = useFetcher<ActionData>();
  const navigate = useNavigate();
  const [feedbackLanguage] = useWritingFeedbackLanguage();
  const agent = getWritingAgentOrDefault(assignment.coachId);
  const t = useT();
  const collection = assignment.taskType === "academic_task_1"
    ? { label: t("writing.collection.task1.title"), to: "/writing/library?category=task1" }
    : assignment.taskType === "academic_task_2"
      ? { label: t("writing.collection.task2.title"), to: "/writing/library?category=task2" }
      : { label: t("writing.collection.general.title"), to: "/writing/library?category=general" };

  const { completeSubmit } = local;
  React.useEffect(() => {
    if (!fetcher.data?.redirectTo) return;
    completeSubmit();
    navigate(fetcher.data.redirectTo);
  }, [fetcher.data, navigate, completeSubmit]);

  return (
    <div className="studio-main-scroll">
      <StudioPage
        width="standard"
        className={sessions.items.length > 0 ? "writing-prompt-page--with-sessions" : undefined}
      >
        <StudioBreadcrumbs items={[
          { label: t("writing.title"), to: "/writing" },
          collection,
          { label: assignment.title, lang: "en" }
        ]} />
        <StudioPageHeader
          title={<span lang="en">{assignment.title}</span>}
          description={
            <>
              {assignment.cefrBand ? `${t("writing.discoveryLevel", { band: assignment.cefrBand })} · ` : ""}
              <RichMessage
                id="writing.promptMeta"
                values={{
                  topic: <span lang="en">{assignment.topic}</span>,
                  minutes: assignment.targetMinutes,
                  words: assignment.targetWords
                }}
              />
            </>
          }
          action={<Link to="/writing/new" className="btn btn-secondary">{t("writing.useOwnTopic")}</Link>}
        />
        <StudioPageBody className={`writing-prompt-layout${sessions.items.length > 0 ? " has-sessions" : ""}`}>
          <div className="writing-prompt-workspace">
          <section className="writing-assignment-copy" aria-labelledby="writing-assignment-heading">
            <p className="writing-section-eyebrow">
              {assignment.taskType === "academic_task_1"
                ? t("writing.ieltsTask1")
                : assignment.taskType === "academic_task_2"
                  ? t("writing.ieltsTask2")
                  : t("writing.guidedPractice", { band: assignment.cefrBand ?? "" })}
            </p>
            <h2 id="writing-assignment-heading">{t("writing.yourAssignment")}</h2>
            <p lang="en">{assignment.promptText}</p>
          </section>

          <WritingPromptMaterial assignment={assignment} />

          <fetcher.Form method="post" className="writing-index-form" onSubmit={local.beginSubmit}>
            <input type="hidden" name="_transport" value="fetcher" />
            <input type="hidden" name="feedbackLanguage" value={feedbackLanguage} />
            <input type="hidden" name="contentHash" value={assignment.contentHash} />
            <input type="hidden" name="startKey" value={stableStartKey} />
            <WritingEditor value={text} onChange={text => local.update({ text })} agent={agent} name="userText" />
            {local.storageError ? <p role="alert">{t("writing.draftNotSaved")}</p> : null}
            {fetcher.data?.error ? <div className="form-error" role="alert">{fetcher.data.error}</div> : null}
            <div className="writing-index-actions">
              <span className="writing-submit-note">{t("writing.savedOnSubmit")}</span>
              <button type="submit" className="btn btn-primary" disabled={!local.ready || !text.trim() || fetcher.state === "submitting"}>
                {fetcher.state === "submitting" ? t("writing.startingFeedback") : t("writing.submitFirstDraft")}
              </button>
            </div>
          </fetcher.Form>
          </div>

          {sessions.items.length > 0 ? (
            <aside
              className="writing-prompt-sessions"
              aria-labelledby="writing-prompt-sessions-heading"
            >
              <h2 id="writing-prompt-sessions-heading">{t("writing.yourSessions")}</h2>
              <p className="writing-prompt-sessions-note">{t("writing.sessionsNote")}</p>
              <ul className="writing-prompt-sessions-list">
                {sessions.items.map((session) => (
                  <li key={session.id}>
                    <Link to={`/writing/${session.id}`}>
                      <span className="writing-prompt-session-title">
                        {session.title ?? t("writing.untitledSession")}
                      </span>
                      <span className="writing-prompt-session-meta">
                        {t(session.round_count === 1 ? "writing.roundOne" : "writing.roundMany", {
                          count: session.round_count
                        })}
                        {" · "}
                        <LocalDateTime
                          value={session.updated_at}
                          options={{ year: "numeric", month: "short", day: "numeric" }}
                        />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {sessions.has_more ? (
                <Link to="/writing/sessions" className="writing-prompt-sessions-more">
                  {t("writing.allSessions")}
                </Link>
              ) : null}
            </aside>
          ) : null}
        </StudioPageBody>
      </StudioPage>
    </div>
  );
}
