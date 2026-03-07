import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import {
  Link,
  useFetcher,
  useActionData,
  useLoaderData
} from "@remix-run/react";
import { Badge, Card } from "@bcailab/ui";
import {
  deleteEslReadingEvaluationsByAttemptIds,
  getEslPassageById,
  getEslReadingAttemptById,
  getLatestEslReadingEvaluationByAttemptId,
  listEslReadingAttemptsByPassage,
  softDeleteEslPassage,
  softDeleteEslReadingAttempt,
  softDeleteEslReadingAttemptsByPassage
} from "@bcailab/db";
import { CompactAudioPlayer } from "~/components/CompactAudioPlayer";
import { EslAttemptComposer } from "~/components/EslAttemptComposer";
import { LocalDateTime } from "~/components/LocalDateTime";
import { EslReadingHistoryRail } from "~/components/EslReadingHistoryRail";
import { requireUser } from "~/utils/auth.server";
import {
  createAndScheduleEslReadingAttempt,
  EslAttemptSubmissionError,
  parseEslAttemptSubmission,
  retryEslReadingAttemptEvaluation
} from "~/utils/esl-reading-attempt.server";
import {
  buildReferenceFallbackR2Key,
  schedulePassageReferenceSynthesis
} from "~/utils/esl-passage-reference.server";
import {
  deriveEslAttemptEvaluationState,
  formatDuration,
  getDisplayEslPassageTitle,
  parseEslReadingEvaluationOutput,
  type EslReadingEvaluationOutput
} from "~/utils/esl-reading";
import { parseReadingOutputLanguage } from "~/utils/reading-settings";
import { useReadingOutputLanguage } from "~/utils/use-reading-output-language";
import * as React from "react";

type ActionData = { error?: string; redirectTo?: string; ok?: boolean };

const deleteAttemptArtifacts = async (
  context: ActionFunctionArgs["context"],
  input: { userId: string; attempts: Array<{ id: string; r2_key: string }> }
) => {
  for (const attempt of input.attempts) {
    await context.env.R2.delete(attempt.r2_key);
  }
  await deleteEslReadingEvaluationsByAttemptIds(context.env.DB, {
    userId: input.userId,
    attemptIds: input.attempts.map((attempt) => attempt.id)
  });
};

export const loader = async ({ request, context, params }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const passageId = params.id;
  if (!passageId) throw new Response("Not found", { status: 404 });

  const passage = await getEslPassageById(context.env.DB, passageId, { includeDeleted: true });
  if (!passage || passage.user_id !== user.id || passage.deleted_at) {
    throw new Response("Not found", { status: 404 });
  }

  const attempts = await listEslReadingAttemptsByPassage(context.env.DB, {
    userId: user.id,
    passageId
  });
  const evaluations = await Promise.all(
    attempts.map((attempt) => getLatestEslReadingEvaluationByAttemptId(context.env.DB, attempt.id))
  );

  const attemptsWithEval = attempts.map((attempt, index) => {
    const evaluation = evaluations[index];
    const parsed = evaluation ? parseEslReadingEvaluationOutput(evaluation.output_json) : null;
    const effective = deriveEslAttemptEvaluationState({
      storedStatus: attempt.evaluation_status,
      hasEvaluation: Boolean(parsed),
      createdAt: attempt.created_at
    });
    return {
      id: attempt.id,
      mode: attempt.mode,
      createdAt: attempt.created_at,
      durationMs: attempt.duration_ms,
      evaluationStatus: effective.status,
      score: parsed?.scores.overall ?? null
    };
  });

  const url = new URL(request.url);
  const composeView = url.searchParams.get("compose") === "1" || attemptsWithEval.length === 0;
  const selectedAttemptId = composeView
    ? null
    : url.searchParams.get("attempt") || attemptsWithEval[0]?.id || null;
  const selectedAttempt = selectedAttemptId
    ? attempts.find((attempt) => attempt.id === selectedAttemptId) ?? null
    : null;
  const selectedEvaluation = selectedAttempt
    ? await getLatestEslReadingEvaluationByAttemptId(context.env.DB, selectedAttempt.id)
    : null;
  const selectedOutput = selectedEvaluation
    ? parseEslReadingEvaluationOutput(selectedEvaluation.output_json)
    : null;
  const selectedEffective = selectedAttempt
    ? deriveEslAttemptEvaluationState({
        storedStatus: selectedAttempt.evaluation_status,
        hasEvaluation: Boolean(selectedOutput),
        createdAt: selectedAttempt.created_at
      })
    : null;

  const fallbackReferenceKey = buildReferenceFallbackR2Key(user.id, passage.id);
  const hasFallbackReference =
    passage.reference_tts_status !== "completed" || !passage.reference_tts_r2_key
      ? Boolean(await context.env.R2.head(fallbackReferenceKey).catch(() => null))
      : false;

  return json({
    passage,
    composeView,
    attempts: attemptsWithEval,
    referenceAudio: {
      status:
        passage.reference_tts_status === "completed" ||
        passage.reference_tts_status === "pending" ||
        passage.reference_tts_status === "failed"
          ? passage.reference_tts_status
          : hasFallbackReference
            ? "completed"
            : null,
      audioUrl:
        (passage.reference_tts_status === "completed" && passage.reference_tts_r2_key) ||
        hasFallbackReference
          ? `/esl/passage-audio/${passage.id}`
          : null
    },
    selected: selectedAttempt
      ? {
          id: selectedAttempt.id,
          mode: selectedAttempt.mode,
          createdAt: selectedAttempt.created_at,
          durationMs: selectedAttempt.duration_ms,
          evaluationStatus: selectedEffective?.status ?? "completed",
          isStalePending: selectedEffective?.isStalePending ?? false,
          canRetryEvaluation:
            Boolean(selectedEffective?.isStalePending) ||
            selectedEffective?.status === "failed",
          audioUrl: `/esl/audio/${selectedAttempt.id}`,
          evaluation: selectedOutput
        }
      : null
  });
};

export const action = async ({ request, context, params }: ActionFunctionArgs) => {
  const user = await requireUser(request, context);
  const passageId = params.id;
  if (!passageId) throw new Response("Not found", { status: 404 });

  const passage = await getEslPassageById(context.env.DB, passageId, { includeDeleted: true });
  if (!passage || passage.user_id !== user.id || passage.deleted_at) {
    throw new Response("Not found", { status: 404 });
  }

  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "submitAttempt");
  const transport = String(formData.get("_transport") ?? "document");

  if (intent === "deleteAttempt") {
    const attemptId = String(formData.get("attemptId") ?? "");
    if (!attemptId) return json<ActionData>({ error: "Missing attempt id." }, { status: 400 });

    const attempt = await getEslReadingAttemptById(context.env.DB, attemptId, { includeDeleted: true });
    if (!attempt || attempt.user_id !== user.id || attempt.passage_id !== passage.id || attempt.deleted_at) {
      return json<ActionData>({ error: "Attempt not found." }, { status: 404 });
    }

    try {
      await deleteAttemptArtifacts(context, { userId: user.id, attempts: [attempt] });
      await softDeleteEslReadingAttempt(context.env.DB, { id: attempt.id, userId: user.id });
      return redirect(`/esl/reading/${passage.id}`);
    } catch {
      return json<ActionData>({ error: "Failed to delete. Please try again." }, { status: 500 });
    }
  }

  if (intent === "deletePassage") {
    const attempts = await listEslReadingAttemptsByPassage(
      context.env.DB,
      { userId: user.id, passageId: passage.id },
      { includeDeleted: true }
    );

    try {
      await deleteAttemptArtifacts(context, { userId: user.id, attempts });
      if (passage.reference_tts_r2_key) {
        await context.env.R2.delete(passage.reference_tts_r2_key).catch(() => undefined);
      }
      await context.env.R2
        .delete(buildReferenceFallbackR2Key(user.id, passage.id))
        .catch(() => undefined);
      await softDeleteEslReadingAttemptsByPassage(context.env.DB, {
        passageId: passage.id,
        userId: user.id
      });
      await softDeleteEslPassage(context.env.DB, { id: passage.id, userId: user.id });
      return redirect("/esl/reading");
    } catch {
      return json<ActionData>(
        { error: "Failed to delete passage. Please try again." },
        { status: 500 }
      );
    }
  }

  if (intent === "retryEvaluation") {
    const attemptId = String(formData.get("attemptId") ?? "");
    const outputLanguage = parseReadingOutputLanguage(formData.get("outputLanguage"));
    const retryTransport = String(formData.get("_transport") ?? "document");
    if (!attemptId) return json<ActionData>({ error: "Missing attempt id." }, { status: 400 });

    try {
      await retryEslReadingAttemptEvaluation(context, {
        userId: user.id,
        passage,
        attemptId,
        outputLanguage
      });
      return retryTransport === "fetcher"
        ? json<ActionData>({ ok: true })
        : redirect(`/esl/reading/${passage.id}?attempt=${attemptId}`);
    } catch (error) {
      if (error instanceof EslAttemptSubmissionError) {
        return json<ActionData>({ error: error.message }, { status: error.status });
      }
      return json<ActionData>({ error: "Failed to request feedback. Please retry." }, { status: 500 });
    }
  }

  if (intent === "requestReferenceAudio") {
    const requestTransport = String(formData.get("_transport") ?? "document");

    try {
      const scheduled = await schedulePassageReferenceSynthesis(context, {
        userId: user.id,
        passage
      });
      if (!scheduled) {
        return json<ActionData>(
          { error: "Reference audio generation is unavailable right now." },
          { status: 503 }
        );
      }
      return requestTransport === "fetcher"
        ? json<ActionData>({ ok: true })
        : redirect(`/esl/reading/${passage.id}`);
    } catch {
      return json<ActionData>(
        { error: "Failed to start reference audio. Please retry." },
        { status: 500 }
      );
    }
  }

  if (intent !== "submitAttempt") {
    return json<ActionData>({ error: "Unsupported action." }, { status: 400 });
  }

  try {
    const submission = await parseEslAttemptSubmission(formData);
    const { attemptId } = await createAndScheduleEslReadingAttempt(context, {
      userId: user.id,
      passage,
      submission
    });
    const redirectTo = `/esl/reading/${passage.id}?attempt=${attemptId}`;
    return transport === "fetcher"
      ? json({ redirectTo })
      : redirect(redirectTo);
  } catch (error) {
    if (error instanceof EslAttemptSubmissionError) {
      return json<ActionData>({ error: error.message }, { status: error.status });
    }
    return json<ActionData>({ error: "Failed to submit. Please retry." }, { status: 500 });
  }
};

export default function EslReadingPracticePage() {
  const { passage, composeView, attempts, referenceAudio, selected } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const displayTitle = getDisplayEslPassageTitle(passage.title, passage.content_text);
  const actionError = actionData && "error" in actionData ? actionData.error : undefined;
  const [liveAttempts, setLiveAttempts] = React.useState(attempts);
  const [liveReferenceAudio, setLiveReferenceAudio] = React.useState(referenceAudio);
  const [liveSelected, setLiveSelected] = React.useState(selected);
  const headingSubtitle = composeView
    ? attempts.length === 0
      ? "Record the first attempt for this passage."
      : null
    : null;

  React.useEffect(() => {
    setLiveAttempts(attempts);
  }, [attempts]);

  React.useEffect(() => {
    setLiveReferenceAudio(referenceAudio);
  }, [referenceAudio]);

  React.useEffect(() => {
    setLiveSelected(selected);
  }, [selected]);

  const handleReferenceStateChange = React.useCallback(
    (next: { status: "pending" | "completed" | "failed" | null; hasAudio: boolean }) => {
      setLiveReferenceAudio({
        status: next.status,
        audioUrl: next.hasAudio ? `/esl/passage-audio/${passage.id}` : null
      });
    },
    [passage.id]
  );

  const handleSelectedStateChange = React.useCallback(
    (next: {
      evaluationStatus: "pending" | "completed" | "failed";
      isStalePending: boolean;
      canRetryEvaluation: boolean;
      evaluation: EslReadingEvaluationOutput | null;
      score: number | null;
    }) => {
      setLiveSelected((current) =>
        current
          ? {
              ...current,
              evaluationStatus: next.evaluationStatus,
              isStalePending: next.isStalePending,
              canRetryEvaluation: next.canRetryEvaluation,
              evaluation: next.evaluation
            }
          : current
      );
      setLiveAttempts((current) =>
        current.map((attempt) =>
          attempt.id === selected?.id
            ? {
                ...attempt,
                evaluationStatus: next.evaluationStatus,
                score: next.score
              }
            : attempt
        )
      );
    },
    [selected?.id]
  );

  return (
    <div className="esl-practice-layout">
      <div className="esl-center-panel">
        <div className="esl-passage-header">
          <Link to="/esl/reading" className="posts-link esl-mobile-back">
            &larr; Passages
          </Link>
          <div className="esl-passage-heading-row">
            <div className="esl-passage-heading-copy">
              <h1>{displayTitle}</h1>
              {headingSubtitle ? (
                <p className="esl-passage-heading-subtitle">{headingSubtitle}</p>
              ) : null}
            </div>
          </div>
        </div>

        {actionError ? <div className="form-error">{actionError}</div> : null}

        {composeView ? (
          <EslAttemptComposer
            submitLabel="Submit"
          >
            {({ hideText }) => (
              <Card className="tool-card-stack esl-compose-card esl-compose-card-readonly">
                {hideText ? (
                  <div className="esl-passage-hidden">
                    Text hidden for recitation mode. Try reciting from memory.
                  </div>
                ) : (
                  <div className="esl-passage-body">{passage.content_text}</div>
                )}
              </Card>
            )}
          </EslAttemptComposer>
        ) : liveSelected ? (
          <AttemptDetail
            passageId={passage.id}
            attemptId={liveSelected.id}
            passageText={passage.content_text}
            referenceAudio={liveReferenceAudio}
            audioUrl={liveSelected.audioUrl}
            createdAt={liveSelected.createdAt}
            durationMs={liveSelected.durationMs}
            mode={liveSelected.mode}
            evaluationStatus={liveSelected.evaluationStatus}
            isStalePending={liveSelected.isStalePending}
            canRetryEvaluation={liveSelected.canRetryEvaluation}
            evaluation={liveSelected.evaluation}
            onReferenceStateChange={handleReferenceStateChange}
            onSelectedStateChange={handleSelectedStateChange}
          />
        ) : (
          <Card className="tool-card-stack">
            No attempt selected. Choose a history item or start a new attempt.
          </Card>
        )}
      </div>

      <EslReadingHistoryRail
        passageId={passage.id}
        attempts={liveAttempts}
        selectedAttemptId={liveSelected?.id ?? null}
        isComposeView={composeView}
        disableNewAttempt={composeView}
      />
    </div>
  );
}

function AttemptDetail(props: {
  passageId: string;
  attemptId: string;
  passageText: string;
  referenceAudio: {
    status: "pending" | "completed" | "failed" | null;
    audioUrl: string | null;
  };
  audioUrl: string;
  createdAt: string;
  durationMs: number | null;
  mode: string;
  evaluationStatus: "pending" | "completed" | "failed";
  isStalePending: boolean;
  canRetryEvaluation: boolean;
  evaluation: EslReadingEvaluationOutput | null;
  onReferenceStateChange: (next: {
    status: "pending" | "completed" | "failed" | null;
    hasAudio: boolean;
  }) => void;
  onSelectedStateChange: (next: {
    evaluationStatus: "pending" | "completed" | "failed";
    isStalePending: boolean;
    canRetryEvaluation: boolean;
    evaluation: EslReadingEvaluationOutput | null;
    score: number | null;
  }) => void;
}) {
  const retryFetcher = useFetcher<ActionData>();
  const referenceFetcher = useFetcher<ActionData>();
  const [outputLanguage] = useReadingOutputLanguage();
  const autoRequestedReferenceRef = React.useRef(false);
  const isRetrySubmitting = retryFetcher.state === "submitting";
  const isRetryEvaluating =
    Boolean(retryFetcher.data?.ok) && !props.evaluation && props.evaluationStatus !== "completed";
  const retryError = retryFetcher.data?.error;
  const [referenceAutoPlayToken, setReferenceAutoPlayToken] = React.useState<number | null>(null);
  const [optimisticReferencePending, setOptimisticReferencePending] = React.useState(false);
  const isReferenceRequesting = referenceFetcher.state !== "idle";
  const isReferencePreparing =
    isReferenceRequesting ||
    props.referenceAudio.status === "pending" ||
    optimisticReferencePending;
  const referenceError = referenceFetcher.data?.error;

  React.useEffect(() => {
    autoRequestedReferenceRef.current = false;
  }, [props.passageId]);

  React.useEffect(() => {
    if (!retryFetcher.data?.ok) return;
    props.onSelectedStateChange({
      evaluationStatus: "pending",
      isStalePending: false,
      canRetryEvaluation: false,
      evaluation: null,
      score: null
    });
  }, [props.onSelectedStateChange, retryFetcher.data]);

  React.useEffect(() => {
    if (!referenceFetcher.data?.ok) return;
    props.onReferenceStateChange({
      status: "pending",
      hasAudio: false
    });
  }, [props.onReferenceStateChange, referenceFetcher.data]);

  React.useEffect(() => {
    const shouldPollEvaluation =
      props.evaluationStatus === "pending" && !props.isStalePending;
    const shouldPollReference = isReferencePreparing;
    if (!shouldPollEvaluation && !shouldPollReference) return;

    let cancelled = false;
    let inFlight = false;

    const intervalId = window.setInterval(() => {
      if (cancelled || inFlight) return;
      inFlight = true;
      const statusUrl = new URL(
        `/esl/reading/${props.passageId}/status`,
        window.location.origin
      );
      statusUrl.searchParams.set("attempt", props.attemptId);

      void fetch(statusUrl.toString(), {
        headers: { Accept: "application/json" }
      })
        .then(async (response) => {
          if (!response.ok) return null;
          return (await response.json()) as {
            referenceStatus: "pending" | "completed" | "failed" | null;
            hasReferenceAudio: boolean;
            selected: {
              evaluationStatus: "pending" | "completed" | "failed";
              hasEvaluation: boolean;
              isStalePending: boolean;
              canRetryEvaluation: boolean;
              evaluation: EslReadingEvaluationOutput | null;
              score: number | null;
            } | null;
          };
        })
        .then((statusPayload) => {
          if (cancelled || !statusPayload) return;
          props.onReferenceStateChange({
            status: statusPayload.referenceStatus,
            hasAudio: statusPayload.hasReferenceAudio
          });
          if (statusPayload.selected) {
            props.onSelectedStateChange({
              evaluationStatus: statusPayload.selected.evaluationStatus,
              isStalePending: statusPayload.selected.isStalePending,
              canRetryEvaluation: statusPayload.selected.canRetryEvaluation,
              evaluation: statusPayload.selected.evaluation,
              score: statusPayload.selected.score
            });
          }
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
  }, [
    isReferencePreparing,
    props.attemptId,
    props.evaluation,
    props.evaluationStatus,
    props.isStalePending,
    props.onReferenceStateChange,
    props.onSelectedStateChange,
    props.passageId,
    props.referenceAudio.audioUrl,
    props.referenceAudio.status
  ]);

  React.useEffect(() => {
    if (
      autoRequestedReferenceRef.current ||
      props.referenceAudio.status !== null ||
      props.referenceAudio.audioUrl ||
      referenceFetcher.state !== "idle"
    ) {
      return;
    }
    autoRequestedReferenceRef.current = true;
    setOptimisticReferencePending(true);
    props.onReferenceStateChange({
      status: "pending",
      hasAudio: Boolean(props.referenceAudio.audioUrl)
    });
    referenceFetcher.submit(
      {
        _intent: "requestReferenceAudio",
        _transport: "fetcher"
      },
      { method: "post" }
    );
  }, [
    props.referenceAudio.audioUrl,
    props.referenceAudio.status,
    referenceFetcher
  ]);

  React.useEffect(() => {
    if (referenceError) {
      setOptimisticReferencePending(false);
    }
  }, [referenceError]);

  React.useEffect(() => {
    if (!optimisticReferencePending) return;
    if (props.referenceAudio.status === "pending" || props.referenceAudio.status === "completed") {
      setOptimisticReferencePending(false);
    }
  }, [optimisticReferencePending, props.referenceAudio.status]);

  React.useEffect(() => {
    if (!optimisticReferencePending) return;
    const timeoutId = window.setTimeout(() => {
      setOptimisticReferencePending(false);
    }, 8000);
    return () => window.clearTimeout(timeoutId);
  }, [optimisticReferencePending]);

  const requestReferenceAudio = React.useCallback(() => {
    setReferenceAutoPlayToken((current) => (current == null ? 1 : current + 1));
    setOptimisticReferencePending(true);
    referenceFetcher.submit(
      {
        _intent: "requestReferenceAudio",
        _transport: "fetcher"
      },
      { method: "post" }
    );
  }, [props.onReferenceStateChange, props.referenceAudio.audioUrl, referenceFetcher]);

  const referenceStatus = isReferencePreparing
    ? "pending"
    : props.referenceAudio.status === "completed"
      ? "ready"
      : props.referenceAudio.status === "failed"
        ? "failed"
        : "missing";

  return (
    <div className="esl-detail-stack">
      <Card className="tool-card-stack esl-detail-passage-card">
        <div className="esl-detail-section-label">Passage</div>
        <div className="esl-passage-body">{props.passageText}</div>
      </Card>

      <Card className="tool-card-stack esl-detail-card">
        <div className="esl-detail-head">
          <div className="esl-detail-head-main">
            {props.evaluationStatus !== "completed" ? (
              <Badge className={`esl-status-badge is-${props.evaluationStatus}`}>
                {props.isStalePending ? "Needs Retry" : props.evaluationStatus === "pending" ? "Evaluating" : "AI Failed"}
              </Badge>
            ) : null}
          </div>
          <div className="esl-audio-pair">
            <CompactAudioPlayer
              label="Reference"
              src={props.referenceAudio.audioUrl}
              status={referenceStatus}
              onRequestSource={requestReferenceAudio}
              autoPlayToken={referenceAutoPlayToken}
            />
            <CompactAudioPlayer
              label="Your attempt"
              src={props.audioUrl}
              status="ready"
            />
          </div>
        </div>

        {referenceError ? <div className="form-error">{referenceError}</div> : null}

        {isRetrySubmitting || isRetryEvaluating ? (
          <div className="esl-attempt-state">
            <div className="esl-attempt-state-title">Evaluating</div>
            <p className="esl-attempt-state-desc">
              {isRetrySubmitting
                ? "The feedback request is being sent now."
                : "Feedback request sent. AI evaluation is running again for this attempt."}
            </p>
          </div>
        ) : props.evaluationStatus === "pending" && !props.isStalePending ? (
          <div className="esl-attempt-state">
            <div className="esl-attempt-state-title">Evaluating</div>
            <p className="esl-attempt-state-desc">
              Your recording is saved. AI feedback is still running, so you can wait here while it
              appears automatically.
            </p>
          </div>
        ) : props.isStalePending ? (
          <div className="esl-attempt-state">
            <div className="esl-attempt-state-title">Evaluation interrupted</div>
            <p className="esl-attempt-state-desc">
              The recording appears to be saved, but the feedback job did not finish. You can retry
              the AI evaluation without re-recording.
            </p>
          </div>
        ) : props.evaluationStatus === "failed" ? (
          <div className="esl-attempt-state">
            <div className="esl-attempt-state-title">Evaluation unavailable</div>
            <p className="esl-attempt-state-desc">
              The recording is saved, but AI feedback did not finish for this attempt.
            </p>
          </div>
        ) : props.evaluation ? (
          <AttemptEvaluation evaluation={props.evaluation} />
        ) : (
          <div className="esl-attempt-state">
            <div className="esl-attempt-state-title">Evaluation unavailable</div>
            <p className="esl-attempt-state-desc">
              This attempt does not have feedback available to display.
            </p>
          </div>
        )}

        {retryError ? <div className="form-error">{retryError}</div> : null}

        {props.canRetryEvaluation ? (
          <retryFetcher.Form method="post" className="esl-eval-retry">
            <input type="hidden" name="_intent" value="retryEvaluation" />
            <input type="hidden" name="attemptId" value={props.attemptId} />
            <input type="hidden" name="_transport" value="fetcher" />
            <input type="hidden" name="outputLanguage" value={outputLanguage} />
            <button type="submit" className="btn btn-ghost btn-sm" disabled={isRetrySubmitting}>
              {isRetrySubmitting ? "Requesting..." : isRetryEvaluating ? "Evaluating..." : "Retry feedback"}
            </button>
          </retryFetcher.Form>
        ) : null}

        <div className="esl-eval-meta esl-eval-meta-bottom">
          <span>{props.mode === "recitation" ? "Recitation" : "Reading"}</span>
          <LocalDateTime value={props.createdAt} />
          {props.durationMs ? <span>{formatDuration(props.durationMs)}</span> : null}
        </div>
      </Card>
    </div>
  );
}

function AttemptEvaluation(props: { evaluation: EslReadingEvaluationOutput }) {
  const { evaluation } = props;
  const dimensions = [
    { label: "Pronunciation", score: evaluation.scores.pronunciation },
    { label: "Fluency", score: evaluation.scores.fluency },
    { label: "Stress / Rhythm", score: evaluation.scores.stress_rhythm },
    { label: "Clarity", score: evaluation.scores.clarity }
  ];

  return (
    <div className="esl-eval-content">
      <div className="esl-score-summary">
        <div className="esl-score-overview">
          <div className="esl-score-overview-label">Overall</div>
          <div className="esl-score-overview-value">{evaluation.scores.overall}</div>
          <div className="esl-score-overview-meta">
            {evaluation.cefr_guess ? `CEFR ${evaluation.cefr_guess}` : "Speaking score"}
          </div>
        </div>

        <div className="esl-score-grid">
          {dimensions.map((dimension) => (
            <div key={dimension.label} className="esl-score-card">
              <div className="esl-score-card-top">
                <span className="esl-score-card-label">{dimension.label}</span>
                <span className="esl-score-card-value">{dimension.score}</span>
              </div>
              <div className="esl-score-card-track">
                <div
                  className="esl-score-card-fill"
                  style={{ width: `${Math.max(4, dimension.score)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {evaluation.commentary_zh ? (
        <div className="esl-eval-commentary">{evaluation.commentary_zh}</div>
      ) : null}

      {evaluation.progress_vs_last.length > 0 && (
        <div className="esl-eval-progress">
          {evaluation.progress_vs_last.map((item, index) => (
            <div key={index} className="esl-eval-progress-item">
              {item}
            </div>
          ))}
        </div>
      )}

      {evaluation.top_actions_zh.length > 0 && (
        <>
          <div className="esl-eval-subtitle">Actions</div>
          <ul className="esl-eval-list">
            {evaluation.top_actions_zh.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      )}

      {evaluation.highlights.length > 0 && (
        <>
          <div className="esl-eval-subtitle">Highlights</div>
          <div className="esl-highlights">
            {evaluation.highlights.map((highlight, index) => (
              <div key={index} className={`esl-highlight sev-${highlight.severity}`}>
                <span className="esl-highlight-kind">{highlight.kind}</span>
                <span className="esl-highlight-note">{highlight.note_zh}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
