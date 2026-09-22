import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
  SerializeFrom
} from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData, Link, useNavigate } from "@remix-run/react";
import * as React from "react";
import {
  getWritingArticleById,
  listWritingRevisionsByArticle,
  softDeleteWritingArticle,
  updateWritingArticleTitle
} from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { getWritingAgentOrDefault } from "~/utils/writing-agents";
import { submitRevision, retryRevisionFeedback } from "~/utils/writing-article.server";
import type { WritingFeedback } from "~/utils/writing-eval.server";
import {
  WritingEditor,
  WritingEssayPromptField,
  WritingGuidePanel
} from "~/components/WritingEditor";
import { WritingFeedbackPanel } from "~/components/WritingFeedback";
import { WritingDetailAside, type AsideRound } from "~/components/WritingDetailAside";
import { WritingPromptMaterial } from "~/components/WritingPromptMaterial";
import { StudioBreadcrumbs } from "~/components/StudioBreadcrumbs";
import { WritingUnavailableState } from "~/components/WritingUnavailableState";
import { useWritingFeedbackLanguage } from "~/utils/use-writing-feedback-language";
import {
  isWritingSchemaMissingError,
  logWritingSchemaMissing
} from "~/utils/writing-schema.server";
import { parseWritingAssignmentSnapshot } from "~/utils/writing-prompt.server";

import { useWritingDraft } from "~/utils/use-writing-draft";
import { useWritingRetryResult, type WritingRetryResult } from "~/utils/use-writing-retry-result";
import { useT } from "~/i18n/context";
import { metaTranslator } from "~/i18n/meta";
import { getRequestTranslator } from "~/i18n/locale.server";
import { writingAgentCopy } from "~/utils/writing-agent-copy";

type ActionData = {
  retry?: WritingRetryResult;
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
const PENDING_LONG_WAIT_MS = 15_000;
const ASIDE_COLLAPSED_KEY = "writing-aside-collapsed";
const ASIDE_PANEL_ID = "writing-feedback-panel";

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const t = metaTranslator(matches);
  return [
    {
      title: data?.article?.title
        ? t("meta.writingArticle.title", { title: data.article.title })
        : t("meta.writing.title")
    }
  ];
};

export const loader = async ({ request, context, params }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const articleId = params.id;
  if (!articleId) throw new Response("Not found", { status: 404 });

  try {
    const article = await getWritingArticleById(context.env.DB, articleId, { includeDeleted: true });
    if (!article || article.user_id !== user.id || article.deleted_at) {
      throw new Response("Not found", { status: 404 });
    }

    const revisions = await listWritingRevisionsByArticle(context.env.DB, articleId);
    const agent = getWritingAgentOrDefault(article.agent_type);
    const assignment = parseWritingAssignmentSnapshot(article.assignment_snapshot_json);
    if (article.prompt_id && !assignment) {
      throw new Error("Prompt-backed article is missing its assignment snapshot.");
    }
    const latestRevision = revisions.length > 0 ? revisions[revisions.length - 1] : null;

    const url = new URL(request.url);
    const isComposeRequested = url.searchParams.get("compose") === "1";
    const isComposeView = isComposeRequested && latestRevision?.feedback_status !== "pending";
    const requestedRound = url.searchParams.get("round");
    const parsedRound = requestedRound ? Number(requestedRound) : null;
    const viewingRound =
      parsedRound !== null && Number.isInteger(parsedRound)
        ? Math.max(1, Math.min(parsedRound, revisions.length))
        : null;
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

    const revisionEntries: AsideRound[] = revisions.map((r) => {
      const fb = parseFeedback(r);
      return {
        id: r.id,
        round_number: r.round_number,
        feedback_status: r.feedback_status,
        band_estimate: fb?.round_summary?.band_estimate ?? null
      };
    });

    const activeFeedback = activeRevision ? parseFeedback(activeRevision) : null;
    const isViewingPastRound = viewingRound !== null && viewingRound !== (latestRevision?.round_number ?? 0);
    const isPending = activeRevision?.feedback_status === "pending";
    const isStalePending =
      isPending &&
      activeRevision &&
      Date.now() - new Date((activeRevision.feedback_started_at ?? activeRevision.created_at) + "Z").getTime() > PENDING_STALE_MS;

    return json({
      schemaReady: true as const,
      userId: user.id,
      baseRevision: latestRevision?.id ?? null,
      article: {
        id: article.id,
        title: article.title,
        essay_prompt: article.essay_prompt,
        agent_type: article.agent_type,
        assignment
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
            created_at: activeRevision.created_at,
            feedback_started_at: activeRevision.feedback_started_at ?? activeRevision.created_at,
            feedback_generation: activeRevision.feedback_generation
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
  } catch (error) {
    if (!isWritingSchemaMissingError(error)) throw error;
    logWritingSchemaMissing("writing.detail.loader", error);
    return json(
      {
        schemaReady: false as const,
        article: null,
        agent: null,
        revisions: [],
        activeRevision: null,
        activeFeedback: null,
        isComposeView: false,
        isViewingPastRound: false,
        isPending: false,
        isStalePending: false,
        latestRound: 0,
        latestText: ""
      },
      { status: 503 }
    );
  }
};

type WritingArticleLoaderData = SerializeFrom<typeof loader>;
type WritingArticleReadyData = Extract<WritingArticleLoaderData, { schemaReady: true }>;

export const action = async ({ request, context, params }: ActionFunctionArgs) => {
  const user = await requireUser(request, context);
  const articleId = params.id;
  if (!articleId) throw new Response("Not found", { status: 404 });

  try {
    const article = await getWritingArticleById(context.env.DB, articleId, { includeDeleted: true });
    if (!article || article.user_id !== user.id || article.deleted_at) {
      throw new Response("Not found", { status: 404 });
    }

    const formData = await request.formData();
    const intent = String(formData.get("_intent") ?? "");
    // Errors below are shown to the learner as written, in the interface language.
    const t = getRequestTranslator(request);

    if (intent === "deleteArticle") {
      try {
        await softDeleteWritingArticle(context.env.DB, { id: article.id, userId: user.id });
        return redirect("/writing");
      } catch (error) {
        if (isWritingSchemaMissingError(error)) {
          logWritingSchemaMissing("writing.detail.action.delete", error);
          return json<ActionData>({ error: t("writing.unavailableError") }, { status: 503 });
        }
        return json<ActionData>({ error: t("writing.error.deleteFailed") }, { status: 500 });
      }
    }

    if (intent === "updateTitle") {
      const title = String(formData.get("title") ?? "").trim();
      if (!title) return json<ActionData>({ error: t("writing.error.titleEmpty") }, { status: 400 });
      try {
        await updateWritingArticleTitle(context.env.DB, {
          id: article.id,
          userId: user.id,
          title
        });
        return json<ActionData>({ ok: true });
      } catch (error) {
        if (isWritingSchemaMissingError(error)) {
          logWritingSchemaMissing("writing.detail.action.title", error);
          return json<ActionData>({ error: t("writing.unavailableError") }, { status: 503 });
        }
        return json<ActionData>({ error: t("writing.error.titleFailed") }, { status: 500 });
      }
    }

    if (intent === "submitRevision") {
      const userText = String(formData.get("userText") ?? "").trim();
      if (!userText) {
        return json<ActionData>({ error: t("writing.error.empty") }, { status: 400 });
      }
      const transport = String(formData.get("_transport") ?? "document");
      const feedbackLanguage = formData.get("feedbackLanguage") === "zh" ? "zh" as const : "en" as const;

      try {
        const result = await submitRevision(context, {
          userId: user.id,
          articleId: article.id,
          agentType: article.agent_type,
          userText,
          feedbackLanguage,
          topic: article.essay_prompt ?? undefined
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
      } catch (error) {
        if (isWritingSchemaMissingError(error)) {
          logWritingSchemaMissing("writing.detail.action.submit", error);
          return json<ActionData>({ error: t("writing.unavailableError") }, { status: 503 });
        }
        return json<ActionData>({ error: t("writing.error.submitRevisionFailed") }, { status: 500 });
      }
    }

    if (intent === "retryFeedback") {
      const revisionId = String(formData.get("revisionId") ?? "");
      if (!revisionId) return json<ActionData>({ error: t("writing.error.missingRevision") }, { status: 400 });
      const feedbackLanguage = formData.get("feedbackLanguage") === "zh" ? "zh" as const : "en" as const;

      try {
        const retry = await retryRevisionFeedback(context, {
          userId: user.id,
          revisionId,
          articleId: article.id,
          agentType: article.agent_type,
          feedbackLanguage
        });
        return json<ActionData>({ ok: true, retry });
      } catch (error) {
        if (isWritingSchemaMissingError(error)) {
          logWritingSchemaMissing("writing.detail.action.retry", error);
          return json<ActionData>({ error: t("writing.unavailableError") }, { status: 503 });
        }
        return json<ActionData>({ error: t("writing.error.retryFailed") }, { status: 500 });
      }
    }

    return json<ActionData>({ error: t("writing.error.unsupported") }, { status: 400 });
  } catch (error) {
    if (!isWritingSchemaMissingError(error)) throw error;
    logWritingSchemaMissing("writing.detail.action", error);
    return json<ActionData>(
      { error: getRequestTranslator(request)("writing.unavailableError") },
      { status: 503 }
    );
  }
};

export default function WritingArticlePage() {
  const data = useLoaderData<typeof loader>();

  if (!data.schemaReady) {
    return <WritingUnavailableState />;
  }

  return <WritingArticlePageReady key={`${data.userId}:${data.article.id}:${data.activeRevision?.id ?? "none"}:${data.baseRevision ?? "none"}`} data={data} />;
}

function WritingArticlePageReady({
  data
}: {
  data: WritingArticleReadyData;
}) {
  const {
    article,
    agent,
    revisions,
    activeRevision,
    activeFeedback,
    isComposeView,
    isViewingPastRound,
    latestRound,
    latestText
  } = data;

  const local = useWritingDraft(data.userId, `revision:${article.id}`, {
    text: latestText, coach: agent.id, startKey: `revision-${article.id}-${data.baseRevision}`,
    baseRevision: data.baseRevision, restoreEarlierBase: true, persistInitial: false
  });
  const text = local.draft.text;
  const { completeSubmit } = local;
  const [liveTitle, setLiveTitle] = React.useState(article.title);
  const [liveRevisions, setLiveRevisions] = React.useState<AsideRound[]>(revisions);
  const [liveActiveRevision, setLiveActiveRevision] = React.useState(activeRevision);
  const [liveActiveFeedback, setLiveActiveFeedback] = React.useState(activeFeedback);
  const [liveLatestRound, setLiveLatestRound] = React.useState(latestRound);
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [titleValue, setTitleValue] = React.useState(article.title ?? "");
  const [pendingClock, setPendingClock] = React.useState(() => Date.now());
  const submitFetcher = useFetcher<ActionData>();
  const navigate = useNavigate();
  const titleFetcher = useFetcher<ActionData>();
  const retryFetcher = useFetcher<ActionData>();
  const titleInputRef = React.useRef<HTMLInputElement>(null);

  const fullAgent = getWritingAgentOrDefault(agent.id);
  const t = useT();

  const [feedbackLanguage] = useWritingFeedbackLanguage();
  const essayPrompt = article.essay_prompt ?? "";
  const assignment = article.assignment;
  const [asideCollapsed, setAsideCollapsed] = React.useState(false);

  React.useEffect(() => {
    try {
      setAsideCollapsed(localStorage.getItem(ASIDE_COLLAPSED_KEY) === "true");
    } catch {
      // localStorage may be unavailable in private browsing contexts.
    }
  }, []);

  const handleAsideToggle = React.useCallback(() => {
    setAsideCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(ASIDE_COLLAPSED_KEY, String(next));
      } catch {
        // localStorage may be unavailable in private browsing contexts.
      }
      return next;
    });
  }, []);

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
    completeSubmit();
    navigate(redirectTo);
  }, [navigate, submitFetcher.data, completeSubmit]);

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
  const latestRevisionEntry = liveRevisions.find((revision) => revision.round_number === liveLatestRound) ?? null;
  const isLatestRoundPending = latestRevisionEntry?.feedback_status === "pending";
  const liveIsStalePending =
    liveIsPending &&
    liveActiveRevision &&
    pendingClock - new Date(liveActiveRevision.feedback_started_at + "Z").getTime() > PENDING_STALE_MS;
  const liveIsLongPending =
    liveIsPending &&
    liveActiveRevision &&
    pendingClock - new Date(liveActiveRevision.feedback_started_at + "Z").getTime() > PENDING_LONG_WAIT_MS;

  React.useEffect(() => {
    if (!liveIsPending) return;
    setPendingClock(Date.now());
    const intervalId = window.setInterval(() => setPendingClock(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [liveIsPending]);

  React.useEffect(() => {
    const nextRevision = submitFetcher.data?.revision;
    if (!submitFetcher.data?.ok || !nextRevision) return;

    setLiveLatestRound(nextRevision.roundNumber);
    setLiveActiveFeedback(null);
    setLiveActiveRevision({
      id: nextRevision.id,
      round_number: nextRevision.roundNumber,
      user_text: nextRevision.userText,
      word_count: nextRevision.wordCount,
      feedback_status: "pending",
      created_at: nextRevision.createdAt,
      feedback_started_at: nextRevision.createdAt,
      feedback_generation: 1
    });
    setLiveRevisions((current) => {
      const nextEntry: AsideRound = {
        id: nextRevision.id,
        round_number: nextRevision.roundNumber,
        feedback_status: "pending",
        band_estimate: null
      };
      const filtered = current.filter((revision) => revision.id !== nextRevision.id);
      return [...filtered, nextEntry].sort((a, b) => a.round_number - b.round_number);
    });
  }, [submitFetcher.data]);

  useWritingRetryResult(retryFetcher.data?.retry, article.id, liveActiveRevision, retry => {
    setLiveActiveRevision(current => current ? {
      ...current, feedback_status: "pending", feedback_generation: retry.generation,
      feedback_started_at: retry.startedAt
    } : current);
    setLiveActiveFeedback(null);
    setLiveRevisions(current => current.map(revision => revision.id === retry.revisionId
      ? { ...revision, feedback_status: "pending", band_estimate: null } : revision));
  });

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
            articleId: string;
            revisionId: string;
            feedbackGeneration: number;
            feedbackStartedAt: string;
            articleTitle: string | null;
            feedbackStatus: "pending" | "completed" | "failed";
            feedback: WritingFeedback | null;
            roundNumber: number;
            bandEstimate: string | null;
          };
        })
        .then((statusPayload) => {
          if (cancelled || !statusPayload || statusPayload.articleId !== article.id ||
              statusPayload.revisionId !== liveActiveRevision.id ||
              statusPayload.feedbackGeneration < liveActiveRevision.feedback_generation) return;
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
                  feedback_status: statusPayload.feedbackStatus,
                  feedback_generation: statusPayload.feedbackGeneration,
                  feedback_started_at: statusPayload.feedbackStartedAt
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

  const displayTitle = liveTitle || t("writingDetail.untitled");
  const collection = assignment?.taskType === "academic_task_1"
    ? { label: t("writing.collection.task1.title"), to: "/writing/library?category=task1" }
    : assignment?.taskType === "academic_task_2"
      ? { label: t("writing.collection.task2.title"), to: "/writing/library?category=task2" }
      : assignment
        ? { label: t("writing.collection.general.title"), to: "/writing/library?category=general" }
        : null;
  // The trail names places, not the current session: the session's own name is the H1.
  // A session keeps its assignment's title until the learner renames it, so repeating it as a
  // leaf would print the same words twice.
  const breadcrumbItems = assignment && collection
    ? [
        { label: t("writing.title"), to: "/writing" },
        collection,
        { label: assignment.title, to: `/writing/prompt/${assignment.promptSlug}`, lang: "en" },
        ...(displayTitle.trim() === assignment.title.trim() ? [] : [{ label: displayTitle }])
      ]
    : [{ label: t("writing.title"), to: "/writing" }, { label: displayTitle }];
  const currentWordCount = isComposeView
    ? text.trim().split(/\s+/).filter(Boolean).length
    : liveActiveRevision?.word_count ?? 0;

  const feedbackContent = (() => {
    if (isComposeView) {
      // Show previous round's feedback so the user can reference it while writing
      if (liveActiveFeedback && liveActiveRevision) {
        return (
          <>
            <div className="writing-compose-feedback-hint">
              {t("writingDetail.feedbackFromRound", { round: liveActiveRevision.round_number })}
            </div>
            <WritingFeedbackPanel
              feedback={liveActiveFeedback}
              roundNumber={liveActiveRevision.round_number}
              assessmentPrefix={fullAgent.assessmentPrefix}
            />
          </>
        );
      }
      return (
        <div className="writing-status-card">
          <div className="writing-status-title">{t("writingDetail.inProgressTitle")}</div>
          <p className="writing-status-desc">{t("writingDetail.inProgressBody")}</p>
        </div>
      );
    }
    if (liveIsPending && !liveIsStalePending) {
      return (
        <div className="writing-status-card" role="status" aria-live="polite">
          <div className="writing-status-title">{t("writingDetail.preparingTitle")}</div>
          <p className="writing-status-desc">
            {liveIsLongPending ? t("writingDetail.preparingLong") : t("writingDetail.preparingBody")}
          </p>
        </div>
      );
    }
    if (liveIsStalePending && liveActiveRevision) {
      return (
        <div className="writing-status-card">
          <div className="writing-status-title">{t("writingDetail.pausedTitle")}</div>
          <p className="writing-status-desc">{t("writingDetail.pausedBody")}</p>
          <retryFetcher.Form method="post" className="writing-retry-form">
            <input type="hidden" name="_intent" value="retryFeedback" />
            <input type="hidden" name="revisionId" value={liveActiveRevision.id} />
            <input type="hidden" name="feedbackLanguage" value={feedbackLanguage} />
            <button
              type="submit"
              className="btn btn-ghost btn-sm"
              disabled={retryFetcher.state === "submitting"}
            >
              {retryFetcher.state === "submitting" ? t("writingDetail.requesting") : t("writingDetail.retryFeedback")}
            </button>
          </retryFetcher.Form>
        </div>
      );
    }
    if (liveActiveRevision?.feedback_status === "failed") {
      return (
        <div className="writing-status-card">
          <div className="writing-status-title">{t("writingDetail.unavailableTitle")}</div>
          <p className="writing-status-desc">{t("writingDetail.unavailableBody")}</p>
          <retryFetcher.Form method="post" className="writing-retry-form">
            <input type="hidden" name="_intent" value="retryFeedback" />
            <input type="hidden" name="revisionId" value={liveActiveRevision.id} />
            <input type="hidden" name="feedbackLanguage" value={feedbackLanguage} />
            <button
              type="submit"
              className="btn btn-ghost btn-sm"
              disabled={retryFetcher.state === "submitting"}
            >
              {t("writingDetail.retryFeedback")}
            </button>
          </retryFetcher.Form>
        </div>
      );
    }
    if (liveActiveFeedback && liveActiveRevision) {
      return (
        <WritingFeedbackPanel
          feedback={liveActiveFeedback}
          roundNumber={liveActiveRevision.round_number}
          assessmentPrefix={fullAgent.assessmentPrefix}
        />
      );
    }
    if (liveLatestRound === 0) {
      return (
        <div className="writing-status-card">
          <div className="writing-status-title">{t("writingDetail.startTitle")}</div>
          <p className="writing-status-desc">{t("writingDetail.startBody")}</p>
        </div>
      );
    }
    return null;
  })();

  return (
    <div className={`writing-detail-layout${asideCollapsed ? " is-aside-collapsed" : ""}`}>
      <div className="writing-center-stage">
        <div className="writing-center-panel">
          <div className="writing-detail-header">
            <StudioBreadcrumbs items={breadcrumbItems} />
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
                <>
                  <h1
                    className="writing-title"
                    onClick={() => setEditingTitle(true)}
                    title={t("writingDetail.editTitleHint")}
                  >
                    {displayTitle}
                  </h1>
                  <button
                    type="button"
                    className="writing-title-edit-btn"
                    onClick={() => setEditingTitle(true)}
                    aria-label={t("writingDetail.editTitle")}
                  >
                    ✎
                  </button>
                </>
              )}
              <span className="writing-agent-label">{writingAgentCopy(t, fullAgent).label}</span>
              <div className="writing-detail-header-actions">
                {asideCollapsed ? (
                  <Link
                    to={isLatestRoundPending ? "#" : `/writing/${article.id}?compose=1`}
                    className={`btn btn-secondary btn-sm${isLatestRoundPending ? " is-disabled" : ""}`}
                    aria-disabled={Boolean(isLatestRoundPending)}
                    onClick={(e) => { if (isLatestRoundPending) e.preventDefault(); }}
                  >
                    {t("writingAside.newRevision")}
                  </Link>
                ) : null}
                <button
                  type="button"
                  className="writing-aside-toggle-btn"
                  aria-expanded={!asideCollapsed}
                  aria-controls={ASIDE_PANEL_ID}
                  aria-label={asideCollapsed ? t("writingDetail.showPanel") : t("writingDetail.hidePanel")}
                  onClick={handleAsideToggle}
                >
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="16" height="16">
                    <rect x="3.25" y="4.25" width="17.5" height="15.5" rx="2.25" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M15 4.5v15" stroke="currentColor" strokeWidth="1.6" />
                    {asideCollapsed ? null : (
                      <path d="M15 4.5h4.5a1.25 1.25 0 011.25 1.25v12.5A1.25 1.25 0 0119.5 19.5H15z" fill="currentColor" opacity="0.35" stroke="none" />
                    )}
                  </svg>
                </button>
              </div>
            </div>

            {isViewingPastRound && liveActiveRevision ? (
              <div className="writing-past-round-banner">
                {t("writingDetail.viewingRound", {
                  round: liveActiveRevision.round_number,
                  latest: liveLatestRound
                })}
                <Link to={`/writing/${article.id}`} className="btn btn-ghost btn-sm">
                  {t("writingDetail.backToLatest")}
                </Link>
              </div>
            ) : null}
          </div>

          {isComposeView ? (
            <submitFetcher.Form method="post" className="writing-submit-form is-compose" onSubmit={local.beginSubmit}>
              <input type="hidden" name="_intent" value="submitRevision" />
              <input type="hidden" name="_transport" value="fetcher" />
              <input type="hidden" name="feedbackLanguage" value={feedbackLanguage} />
              <WritingGuidePanel agent={fullAgent} />
              <WritingEssayPromptField value={essayPrompt} readOnly />
              {assignment ? <WritingPromptMaterial assignment={assignment} /> : null}
              {local.draft.editId && local.draft.baseRevision !== data.baseRevision ? (
                <p role="status">{t("writingDetail.recovered")}</p>
              ) : null}
              <WritingEditor
                value={text}
                onChange={text => local.update({ text })}
                agent={fullAgent}
                name="userText"
                showGuide={false}
              />
              <div className="writing-submit-actions">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!local.ready || !text.trim() || isLatestRoundPending || submitFetcher.state === "submitting"}
                >
                  {submitFetcher.state === "submitting" ? t("writing.submitting") : t("writingDetail.submitRevision")}
                </button>
              </div>
              {local.storageError ? <p role="alert">{t("writing.draftNotSaved")}</p> : null}
              {submitFetcher.data?.error ? <div className="form-error">{submitFetcher.data.error}</div> : null}
            </submitFetcher.Form>
          ) : liveActiveRevision ? (
            <div className="writing-readonly-view">
              <WritingGuidePanel agent={fullAgent} />
              <WritingEssayPromptField value={essayPrompt} readOnly />
              {assignment ? <WritingPromptMaterial assignment={assignment} /> : null}
              <div className="writing-readonly-text" lang="en">{liveActiveRevision.user_text}</div>
              <div className="writing-editor-footer">
                <span className="writing-editor-count">
                  {t(currentWordCount === 1 ? "writingEditor.wordOne" : "writingEditor.wordMany", {
                    count: currentWordCount
                  })}
                  {" · "}
                  {t("writingEditor.recommended", { min: fullAgent.minWords, max: fullAgent.maxWords })}
                </span>
              </div>
            </div>
          ) : (
            <div className="writing-status-card">
              <div className="writing-status-title">{t("writingDetail.startTitle")}</div>
              <p className="writing-status-desc">{t("writingDetail.chooseNewRevision")}</p>
            </div>
          )}

          {/* Feedback — visible on mobile only, hidden on desktop where aside shows it */}
          <div className="writing-feedback-section writing-feedback-mobile-only">
            {feedbackContent}
          </div>
        </div>
      </div>

      <div className="writing-detail-rail">
        <WritingDetailAside
          articleId={article.id}
          rounds={liveRevisions}
          activeRound={isComposeView ? null : liveActiveRevision?.round_number ?? null}
          latestRound={liveLatestRound}
          isComposeView={isComposeView}
          disableNewRevision={Boolean(isLatestRoundPending)}
          collapsed={asideCollapsed}
          panelId={ASIDE_PANEL_ID}
          assessmentPrefix={fullAgent.assessmentPrefix}
        >
          {feedbackContent}
        </WritingDetailAside>
      </div>
    </div>
  );
}
