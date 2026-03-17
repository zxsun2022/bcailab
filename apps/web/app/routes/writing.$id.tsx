import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData, Link, useNavigate } from "@remix-run/react";
import * as React from "react";
import {
  getWritingArticleById,
  listWritingRevisionsByArticle,
  softDeleteWritingArticle,
  softDeleteWritingRevisionsByArticle,
  updateWritingArticleTitle
} from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { getWritingAgentOrDefault } from "~/utils/writing-agents";
import { submitRevision, retryRevisionFeedback } from "~/utils/writing-article.server";
import type { WritingFeedback } from "~/utils/writing-eval.server";
import { WritingEditor } from "~/components/WritingEditor";
import { WritingFeedbackPanel } from "~/components/WritingFeedback";
import { WritingRevisionRail, type RevisionEntry } from "~/components/WritingRevisionRail";
import { useWritingFeedbackLanguage } from "~/utils/use-writing-feedback-language";

type ActionData = {
  error?: string;
  ok?: boolean;
  redirectTo?: string;
  revision?: {
    id: string;
    roundNumber: number;
    createdAt: string;
    wordCount: number;
    userText: string;
  };
};
const PENDING_STALE_MS = 60_000;

export const loader = async ({ request, context, params }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const articleId = params.id;
  if (!articleId) throw new Response("Not found", { status: 404 });

  const article = await getWritingArticleById(context.env.DB, articleId, { includeDeleted: true });
  if (!article || article.user_id !== user.id || article.deleted_at) {
    throw new Response("Not found", { status: 404 });
  }

  const revisions = await listWritingRevisionsByArticle(context.env.DB, articleId);
  const agent = getWritingAgentOrDefault(article.agent_type);

  const url = new URL(request.url);
  const isComposeView = url.searchParams.get("compose") === "1";
  const requestedRound = url.searchParams.get("round");
  const viewingRound = requestedRound
    ? Math.max(1, Math.min(Number(requestedRound), revisions.length))
    : null;

  const latestRevision = revisions.length > 0 ? revisions[revisions.length - 1] : null;
  const activeRevision = viewingRound
    ? revisions.find((r) => r.round_number === viewingRound) ?? latestRevision
    : latestRevision;

  const parseFeedback = (rev: typeof revisions[number]): WritingFeedback | null => {
    if (!rev.feedback_json) return null;
    try {
      return JSON.parse(rev.feedback_json) as WritingFeedback;
    } catch {
      return null;
    }
  };

  const revisionEntries: RevisionEntry[] = revisions.map((r) => {
    const fb = parseFeedback(r);
    return {
      id: r.id,
      round_number: r.round_number,
      word_count: r.word_count,
      feedback_status: r.feedback_status,
      band_estimate: fb?.round_summary?.band_estimate ?? null,
      created_at: r.created_at
    };
  });

  const activeFeedback = activeRevision ? parseFeedback(activeRevision) : null;
  const isViewingPastRound = viewingRound !== null && viewingRound !== (latestRevision?.round_number ?? 0);
  const isPending = activeRevision?.feedback_status === "pending";
  const isStalePending =
    isPending &&
    activeRevision &&
    Date.now() - new Date(activeRevision.created_at + "Z").getTime() > PENDING_STALE_MS;

  return json({
    article: {
      id: article.id,
      title: article.title,
      agent_type: article.agent_type
    },
    agent: { id: agent.id, label: agent.label, minWords: agent.minWords, maxWords: agent.maxWords },
    revisions: revisionEntries,
    activeRevision: activeRevision
      ? {
          id: activeRevision.id,
          round_number: activeRevision.round_number,
          user_text: activeRevision.user_text,
          word_count: activeRevision.word_count,
          feedback_status: activeRevision.feedback_status,
          created_at: activeRevision.created_at
        }
      : null,
    activeFeedback,
    isComposeView,
    isViewingPastRound,
    isPending,
    isStalePending: Boolean(isStalePending),
    latestRound: latestRevision?.round_number ?? 0,
    latestText: latestRevision?.user_text ?? ""
  });
};

export const action = async ({ request, context, params }: ActionFunctionArgs) => {
  const user = await requireUser(request, context);
  const articleId = params.id;
  if (!articleId) throw new Response("Not found", { status: 404 });

  const article = await getWritingArticleById(context.env.DB, articleId, { includeDeleted: true });
  if (!article || article.user_id !== user.id || article.deleted_at) {
    throw new Response("Not found", { status: 404 });
  }

  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "");

  if (intent === "deleteArticle") {
    try {
      await softDeleteWritingRevisionsByArticle(context.env.DB, {
        articleId: article.id,
        userId: user.id
      });
      await softDeleteWritingArticle(context.env.DB, { id: article.id, userId: user.id });
      return redirect("/writing");
    } catch {
      return json<ActionData>({ error: "Failed to delete. Please try again." }, { status: 500 });
    }
  }

  if (intent === "updateTitle") {
    const title = String(formData.get("title") ?? "").trim();
    if (!title) return json<ActionData>({ error: "Title cannot be empty." }, { status: 400 });
    try {
      await updateWritingArticleTitle(context.env.DB, {
        id: article.id,
        userId: user.id,
        title
      });
      return json<ActionData>({ ok: true });
    } catch {
      return json<ActionData>({ error: "Failed to update title." }, { status: 500 });
    }
  }

  if (intent === "submitRevision") {
    const userText = String(formData.get("userText") ?? "").trim();
    if (!userText) {
      return json<ActionData>({ error: "Please write something before submitting." }, { status: 400 });
    }
    const transport = String(formData.get("_transport") ?? "document");
    const feedbackLanguage = formData.get("feedbackLanguage") === "zh" ? "zh" as const : "en" as const;

    try {
      const result = await submitRevision(context, {
        userId: user.id,
        articleId: article.id,
        agentType: article.agent_type,
        userText,
        feedbackLanguage
      });
      return transport === "fetcher"
        ? json<ActionData>({
            ok: true,
            redirectTo: `/writing/${article.id}`,
            revision: {
              id: result.revisionId,
              roundNumber: result.roundNumber,
              createdAt: result.createdAt,
              wordCount: result.wordCount,
              userText: result.userText
            }
          })
        : redirect(`/writing/${article.id}`);
    } catch {
      return json<ActionData>({ error: "Failed to submit revision. Please retry." }, { status: 500 });
    }
  }

  if (intent === "retryFeedback") {
    const revisionId = String(formData.get("revisionId") ?? "");
    if (!revisionId) return json<ActionData>({ error: "Missing revision." }, { status: 400 });
    const feedbackLanguage = formData.get("feedbackLanguage") === "zh" ? "zh" as const : "en" as const;

    try {
      await retryRevisionFeedback(context, {
        userId: user.id,
        revisionId,
        articleId: article.id,
        agentType: article.agent_type,
        feedbackLanguage
      });
      return json<ActionData>({ ok: true });
    } catch {
      return json<ActionData>({ error: "Failed to retry feedback." }, { status: 500 });
    }
  }

  return json<ActionData>({ error: "Unsupported action." }, { status: 400 });
};

export default function WritingArticlePage() {
  const {
    article,
    agent,
    revisions,
    activeRevision,
    activeFeedback,
    isComposeView,
    isViewingPastRound,
    isPending,
    isStalePending,
    latestRound,
    latestText
  } = useLoaderData<typeof loader>();

  const [text, setText] = React.useState(latestText);
  const [liveTitle, setLiveTitle] = React.useState(article.title);
  const [liveRevisions, setLiveRevisions] = React.useState(revisions);
  const [liveActiveRevision, setLiveActiveRevision] = React.useState(activeRevision);
  const [liveActiveFeedback, setLiveActiveFeedback] = React.useState(activeFeedback);
  const [liveLatestRound, setLiveLatestRound] = React.useState(latestRound);
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [titleValue, setTitleValue] = React.useState(article.title ?? "");
  const submitFetcher = useFetcher<ActionData>();
  const navigate = useNavigate();
  const titleFetcher = useFetcher<ActionData>();
  const retryFetcher = useFetcher<ActionData>();
  const titleInputRef = React.useRef<HTMLInputElement>(null);

  const fullAgent = getWritingAgentOrDefault(agent.id);

  const [feedbackLanguage] = useWritingFeedbackLanguage();

  React.useEffect(() => {
    setText(latestText);
  }, [latestText]);

  React.useEffect(() => {
    setLiveTitle(article.title);
  }, [article.title]);

  React.useEffect(() => {
    setLiveRevisions(revisions);
  }, [revisions]);

  React.useEffect(() => {
    setLiveActiveRevision(activeRevision);
  }, [activeRevision]);

  React.useEffect(() => {
    setLiveActiveFeedback(activeFeedback);
  }, [activeFeedback]);

  React.useEffect(() => {
    setLiveLatestRound(latestRound);
  }, [latestRound]);

  React.useEffect(() => {
    const redirectTo = submitFetcher.data?.redirectTo;
    if (!redirectTo) return;
    navigate(redirectTo);
  }, [navigate, submitFetcher.data]);

  React.useEffect(() => {
    setTitleValue(article.title ?? "");
  }, [article.title]);

  React.useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  const liveIsPending = !isViewingPastRound && liveActiveRevision?.feedback_status === "pending";
  const liveIsStalePending =
    liveIsPending &&
    liveActiveRevision &&
    Date.now() - new Date(liveActiveRevision.created_at + "Z").getTime() > PENDING_STALE_MS;

  React.useEffect(() => {
    const nextRevision = submitFetcher.data?.revision;
    if (!submitFetcher.data?.ok || !nextRevision) return;

    setText(nextRevision.userText);
    setLiveLatestRound(nextRevision.roundNumber);
    setLiveActiveFeedback(null);
    setLiveActiveRevision({
      id: nextRevision.id,
      round_number: nextRevision.roundNumber,
      user_text: nextRevision.userText,
      word_count: nextRevision.wordCount,
      feedback_status: "pending",
      created_at: nextRevision.createdAt
    });
    setLiveRevisions((current) => {
      const nextEntry: RevisionEntry = {
        id: nextRevision.id,
        round_number: nextRevision.roundNumber,
        word_count: nextRevision.wordCount,
        feedback_status: "pending",
        band_estimate: null,
        created_at: nextRevision.createdAt
      };
      const filtered = current.filter((revision) => revision.id !== nextRevision.id);
      return [...filtered, nextEntry].sort((a, b) => a.round_number - b.round_number);
    });
  }, [submitFetcher.data]);

  React.useEffect(() => {
    if (!retryFetcher.data?.ok || !liveActiveRevision) return;
    setLiveActiveRevision((current) =>
      current
        ? {
            ...current,
            feedback_status: "pending"
          }
        : current
    );
    setLiveActiveFeedback(null);
    setLiveRevisions((current) =>
      current.map((revision) =>
        revision.id === liveActiveRevision.id
          ? {
              ...revision,
              feedback_status: "pending",
              band_estimate: null
            }
          : revision
      )
    );
  }, [liveActiveRevision, retryFetcher.data]);

  // Poll pending latest-round feedback without reloading the whole page.
  React.useEffect(() => {
    if (!liveIsPending || !liveActiveRevision || liveIsStalePending) return;
    let cancelled = false;
    let inFlight = false;

    const intervalId = window.setInterval(() => {
      if (cancelled || inFlight) return;
      inFlight = true;
      const statusUrl = new URL(`/writing/${article.id}/status`, window.location.origin);

      void fetch(statusUrl.toString(), {
        headers: { Accept: "application/json" }
      })
        .then(async (response) => {
          if (!response.ok) return null;
          return (await response.json()) as {
            articleTitle: string | null;
            feedbackStatus: "pending" | "completed" | "failed";
            feedback: WritingFeedback | null;
            roundNumber: number;
            bandEstimate: string | null;
          };
        })
        .then((statusPayload) => {
          if (cancelled || !statusPayload) return;
          if (statusPayload.articleTitle !== null) {
            setLiveTitle(statusPayload.articleTitle);
            if (!editingTitle) {
              setTitleValue(statusPayload.articleTitle);
            }
          }
          if (statusPayload.roundNumber !== liveActiveRevision.round_number) return;

          setLiveActiveRevision((current) =>
            current
              ? {
                  ...current,
                  feedback_status: statusPayload.feedbackStatus
                }
              : current
          );
          setLiveActiveFeedback(statusPayload.feedback);
          setLiveRevisions((current) =>
            current.map((revision) =>
              revision.round_number === statusPayload.roundNumber
                ? {
                    ...revision,
                    feedback_status: statusPayload.feedbackStatus,
                    band_estimate: statusPayload.bandEstimate
                  }
                : revision
            )
          );
        })
        .catch(() => undefined)
        .finally(() => {
          inFlight = false;
        });
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [article.id, editingTitle, liveActiveRevision, liveIsPending, liveIsStalePending]);

  const handleTitleSave = () => {
    const trimmed = titleValue.trim();
    if (!trimmed || trimmed === liveTitle) {
      setEditingTitle(false);
      setTitleValue(liveTitle ?? "");
      return;
    }
    titleFetcher.submit(
      { _intent: "updateTitle", title: trimmed },
      { method: "post" }
    );
    setLiveTitle(trimmed);
    setEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleTitleSave();
    } else if (e.key === "Escape") {
      setEditingTitle(false);
      setTitleValue(liveTitle ?? "");
    }
  };

  const displayTitle = liveTitle || "Untitled";

  return (
    <div className="writing-detail-layout">
      <div className="writing-center-panel">
        <div className="writing-detail-header">
          <Link to="/writing" className="writing-mobile-back">&larr; Articles</Link>
          <div className="writing-title-row">
            {editingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                className="writing-title-input"
                value={titleValue}
                onChange={(e) => setTitleValue(e.currentTarget.value)}
                onBlur={handleTitleSave}
                onKeyDown={handleTitleKeyDown}
              />
            ) : (
              <h1
                className="writing-title"
                onClick={() => setEditingTitle(true)}
                title="Click to edit title"
              >
                {displayTitle}
                <button
                  type="button"
                  className="writing-title-edit-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingTitle(true);
                  }}
                  aria-label="Edit title"
                >
                  ✎
                </button>
              </h1>
            )}
            <span className="writing-agent-label">{agent.label}</span>
          </div>

          {isViewingPastRound && liveActiveRevision ? (
            <div className="writing-past-round-banner">
              Viewing Round {liveActiveRevision.round_number} of {liveLatestRound}
              <Link to={`/writing/${article.id}`} className="btn btn-ghost btn-sm">
                Back to latest
              </Link>
            </div>
          ) : null}
        </div>

        {isComposeView ? (
          <submitFetcher.Form method="post" className="writing-submit-form is-compose">
            <input type="hidden" name="_intent" value="submitRevision" />
            <input type="hidden" name="_transport" value="fetcher" />
            <input type="hidden" name="feedbackLanguage" value={feedbackLanguage} />
            <WritingEditor value={text} onChange={setText} agent={fullAgent} name="userText" />
            <div className="writing-submit-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!text.trim() || liveIsPending || submitFetcher.state === "submitting"}
              >
                {submitFetcher.state === "submitting" ? "Submitting..." : "Submit revision"}
              </button>
            </div>
            {submitFetcher.data?.error ? <div className="form-error">{submitFetcher.data.error}</div> : null}
          </submitFetcher.Form>
        ) : liveActiveRevision ? (
          <div className="writing-readonly-view">
            <div className="writing-readonly-text">{liveActiveRevision.user_text}</div>
            <div className="writing-editor-footer">
              <span className="writing-editor-count">{liveActiveRevision.word_count} words</span>
            </div>
          </div>
        ) : (
          <div className="writing-status-card">
            <div className="writing-status-title">Start writing</div>
            <p className="writing-status-desc">
              Choose New Revision to draft the next round.
            </p>
          </div>
        )}

        {!isComposeView ? (
          <div className="writing-feedback-section">
            {liveIsPending && !liveIsStalePending ? (
              <div className="writing-status-card">
                <div className="writing-status-title">Analyzing...</div>
                <p className="writing-status-desc">
                  Your text has been submitted. AI feedback is being generated.
                </p>
              </div>
            ) : liveIsStalePending && liveActiveRevision ? (
              <div className="writing-status-card">
                <div className="writing-status-title">Feedback interrupted</div>
                <p className="writing-status-desc">
                  The feedback job did not finish. You can retry without resubmitting.
                </p>
                <retryFetcher.Form method="post" className="writing-retry-form">
                  <input type="hidden" name="_intent" value="retryFeedback" />
                  <input type="hidden" name="revisionId" value={liveActiveRevision.id} />
                  <input type="hidden" name="feedbackLanguage" value={feedbackLanguage} />
                  <button
                    type="submit"
                    className="btn btn-ghost btn-sm"
                    disabled={retryFetcher.state === "submitting"}
                  >
                    {retryFetcher.state === "submitting" ? "Requesting..." : "Retry feedback"}
                  </button>
                </retryFetcher.Form>
              </div>
            ) : liveActiveRevision?.feedback_status === "failed" ? (
              <div className="writing-status-card">
                <div className="writing-status-title">Feedback unavailable</div>
                <p className="writing-status-desc">
                  AI feedback failed for this round.
                </p>
                <retryFetcher.Form method="post" className="writing-retry-form">
                  <input type="hidden" name="_intent" value="retryFeedback" />
                  <input type="hidden" name="revisionId" value={liveActiveRevision.id} />
                  <input type="hidden" name="feedbackLanguage" value={feedbackLanguage} />
                  <button
                    type="submit"
                    className="btn btn-ghost btn-sm"
                    disabled={retryFetcher.state === "submitting"}
                  >
                    Retry feedback
                  </button>
                </retryFetcher.Form>
              </div>
            ) : liveActiveFeedback && liveActiveRevision ? (
              <WritingFeedbackPanel
                feedback={liveActiveFeedback}
                roundNumber={liveActiveRevision.round_number}
                assessmentPrefix={fullAgent.assessmentPrefix}
              />
            ) : liveLatestRound === 0 ? (
              <div className="writing-status-card">
                <div className="writing-status-title">Start writing</div>
                <p className="writing-status-desc">
                  Write your first draft above and submit for AI feedback.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <WritingRevisionRail
        articleId={article.id}
        revisions={liveRevisions}
        activeRound={isComposeView ? null : liveActiveRevision?.round_number ?? null}
        latestRound={liveLatestRound}
        isComposeView={isComposeView}
        disableNewRevision={liveIsPending}
        assessmentPrefix={fullAgent.assessmentPrefix}
      />
    </div>
  );
}
