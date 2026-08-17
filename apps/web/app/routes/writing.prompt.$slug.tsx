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
  type WritingAssignmentSnapshot
} from "@bcailab/db";
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
  logWritingSchemaMissing,
  WRITING_UNAVAILABLE_ERROR
} from "~/utils/writing-schema.server";

type ActionData = { error?: string; redirectTo?: string; code?: "stale_prompt" };

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  {
    title: data?.assignment?.title
      ? `${data.assignment.title} · Writing · English Studio · bcailab`
      : "Writing assignment · English Studio · bcailab"
  }
];

export const loader = async ({ request, context, params }: LoaderFunctionArgs) => {
  await requireUser(request, context);
  const slug = params.slug;
  if (!slug) throw new Response("Not found", { status: 404 });
  try {
    const row = await getPublishedWritingPromptBySlug(context.env.DB, slug);
    if (!row) throw new Response("Not found", { status: 404 });
    const { snapshot } = materializeWritingPrompt(row);
    return json({ schemaReady: true as const, assignment: snapshot, startKey: crypto.randomUUID() });
  } catch (error) {
    if (!isWritingSchemaMissingError(error)) throw error;
    logWritingSchemaMissing("writing.prompt.loader", error);
    return json(
      { schemaReady: false as const, assignment: null, startKey: null },
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
  if (!userText) {
    return json<ActionData>({ error: "Please write something before submitting." }, { status: 400 });
  }
  if (countWords(userText) < 10) {
    return json<ActionData>({ error: "Please write at least 10 words." }, { status: 400 });
  }
  if (startKey.length < 16 || startKey.length > 200) {
    return json<ActionData>({ error: "This draft has expired. Refresh and try again." }, { status: 400 });
  }

  try {
    const row = await getPublishedWritingPromptBySlug(context.env.DB, slug);
    if (!row || row.content_hash !== renderedHash) {
      return json<ActionData>(
        {
          code: "stale_prompt",
          error: "This assignment changed or is no longer available. Your draft is still here; refresh the assignment before submitting."
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
      return json<ActionData>({ error: WRITING_UNAVAILABLE_ERROR }, { status: 503 });
    }
    return json<ActionData>({ error: "Failed to start this assignment. Please retry." }, { status: 500 });
  }
};

export default function WritingPromptPage() {
  const data = useLoaderData<typeof loader>();
  if (!data.schemaReady) return <WritingUnavailableState />;

  return (
    <WritingPromptReadyPage assignment={data.assignment} startKey={data.startKey} />
  );
}

function WritingPromptReadyPage({
  assignment,
  startKey
}: {
  assignment: WritingAssignmentSnapshot;
  startKey: string;
}) {
  const startIdentity = `${assignment.promptId}:${assignment.contentHash}`;
  const stableStartRef = React.useRef({ identity: startIdentity, key: startKey });
  if (stableStartRef.current.identity !== startIdentity) {
    stableStartRef.current = { identity: startIdentity, key: startKey };
  }
  const stableStartKey = stableStartRef.current.key;
  const fetcher = useFetcher<ActionData>();
  const navigate = useNavigate();
  const [feedbackLanguage] = useWritingFeedbackLanguage();
  const draftKey = `writing-prompt-draft:${assignment.promptId}:${assignment.contentHash}`;
  const [text, setText] = React.useState("");
  const agent = getWritingAgentOrDefault(assignment.coachId);
  const collection = assignment.taskType === "academic_task_1"
    ? { label: "Visual reports", to: "/writing/library?category=task1" }
    : assignment.taskType === "academic_task_2"
      ? { label: "Academic essays", to: "/writing/library?category=task2" }
      : { label: "Everyday writing", to: "/writing/library?category=general" };

  React.useEffect(() => {
    try {
      setText(localStorage.getItem(draftKey) ?? "");
    } catch {
      // localStorage may be unavailable in private browsing contexts.
    }
  }, [draftKey]);
  const updateText = (value: string) => {
    setText(value);
    try {
      localStorage.setItem(draftKey, value);
    } catch {
      // localStorage may be unavailable in private browsing contexts.
    }
  };
  React.useEffect(() => {
    const redirectTo = fetcher.data?.redirectTo;
    if (!redirectTo) return;
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // localStorage may be unavailable in private browsing contexts.
    }
    navigate(redirectTo);
  }, [draftKey, fetcher.data, navigate]);

  return (
    <div className="studio-main-scroll">
      <StudioPage width="standard">
        <StudioBreadcrumbs items={[
          { label: "Writing", to: "/writing" },
          collection,
          { label: assignment.title }
        ]} />
        <StudioPageHeader
          title={assignment.title}
          description={`${assignment.cefrBand ? `${assignment.cefrBand} discovery level · ` : ""}${assignment.topic} · ${assignment.targetMinutes} minutes · ${assignment.targetWords}+ words`}
          action={<Link to="/writing/new" className="btn btn-secondary">Use my own topic</Link>}
        />
        <StudioPageBody className="writing-prompt-workspace">
          <section className="writing-assignment-copy" aria-labelledby="writing-assignment-heading">
            <p className="writing-section-eyebrow">
              {assignment.taskType === "academic_task_1"
                ? "IELTS Academic Task 1"
                : assignment.taskType === "academic_task_2"
                  ? "IELTS Academic Task 2"
                  : `${assignment.cefrBand} guided practice`}
            </p>
            <h2 id="writing-assignment-heading">Your assignment</h2>
            <p>{assignment.promptText}</p>
          </section>

          <WritingPromptMaterial assignment={assignment} />

          <fetcher.Form method="post" className="writing-index-form">
            <input type="hidden" name="_transport" value="fetcher" />
            <input type="hidden" name="feedbackLanguage" value={feedbackLanguage} />
            <input type="hidden" name="contentHash" value={assignment.contentHash} />
            <input type="hidden" name="startKey" value={stableStartKey} />
            <WritingEditor value={text} onChange={updateText} agent={agent} name="userText" />
            {fetcher.data?.error ? <div className="form-error" role="alert">{fetcher.data.error}</div> : null}
            <div className="writing-index-actions">
              <span className="writing-submit-note">The assignment is saved only when you submit this first draft.</span>
              <button type="submit" className="btn btn-primary" disabled={!text.trim() || fetcher.state === "submitting"}>
                {fetcher.state === "submitting" ? "Starting feedback..." : "Submit first draft"}
              </button>
            </div>
          </fetcher.Form>
        </StudioPageBody>
      </StudioPage>
    </div>
  );
}
