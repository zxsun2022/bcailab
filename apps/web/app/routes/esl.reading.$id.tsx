import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import {
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
  useRevalidator
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
import { EslAttemptComposer } from "~/components/EslAttemptComposer";
import { EslReadingHistoryRail } from "~/components/EslReadingHistoryRail";
import { requireUser } from "~/utils/auth.server";
import {
  createAndScheduleEslReadingAttempt,
  EslAttemptSubmissionError,
  parseEslAttemptSubmission
} from "~/utils/esl-reading-attempt.server";
import {
  formatDuration,
  parseEslReadingEvaluationOutput,
  type EslReadingEvaluationOutput
} from "~/utils/esl-reading";
import * as React from "react";

type ActionData = { error?: string };

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

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
    return {
      id: attempt.id,
      mode: attempt.mode,
      createdAt: attempt.created_at,
      durationMs: attempt.duration_ms,
      evaluationStatus: attempt.evaluation_status,
      score: parsed?.scores.overall ?? null,
      modelName: evaluation?.model_name ?? null
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

  return json({
    passage,
    composeView,
    attempts: attemptsWithEval,
    selected: selectedAttempt
      ? {
          id: selectedAttempt.id,
          mode: selectedAttempt.mode,
          createdAt: selectedAttempt.created_at,
          durationMs: selectedAttempt.duration_ms,
          evaluationStatus: selectedAttempt.evaluation_status,
          audioUrl: `/esl/audio/${selectedAttempt.id}`,
          evaluation: selectedOutput,
          modelName: selectedEvaluation?.model_name ?? null
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
    return redirect(`/esl/reading/${passage.id}?attempt=${attemptId}`);
  } catch (error) {
    if (error instanceof EslAttemptSubmissionError) {
      return json<ActionData>({ error: error.message }, { status: error.status });
    }
    return json<ActionData>({ error: "Failed to submit. Please retry." }, { status: 500 });
  }
};

export default function EslReadingPracticePage() {
  const { passage, composeView, attempts, selected } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const pendingIntent = navigation.formData?.get("_intent");
  const isSubmitting = navigation.state === "submitting" && pendingIntent === "submitAttempt";
  const isDeletingPassage = navigation.state === "submitting" && pendingIntent === "deletePassage";

  React.useEffect(() => {
    if (selected?.evaluationStatus !== "pending") return;
    const timeoutId = window.setTimeout(() => {
      revalidator.revalidate();
    }, 2000);
    return () => window.clearTimeout(timeoutId);
  }, [revalidator, selected?.evaluationStatus, selected?.id]);

  return (
    <div className="esl-practice-layout">
      <div className="esl-center-panel">
        <div className="esl-passage-header">
          <Link to="/esl/reading" className="posts-link esl-mobile-back">
            &larr; Passages
          </Link>
          <div className="esl-passage-heading-row">
            <div className="esl-passage-heading-copy">
              <h1>{passage.title || "Untitled passage"}</h1>
              <p className="esl-passage-heading-subtitle">
                {composeView
                  ? attempts.length === 0
                    ? "Record the first attempt for this passage."
                    : "Record a new attempt. The passage text stays locked."
                  : "Open any history entry from the right rail to review it here."}
              </p>
            </div>
            <form
              method="post"
              className="esl-passage-delete"
              onSubmit={(event) => {
                if (!confirm("Delete this passage and all of its recordings and AI feedback?")) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="_intent" value="deletePassage" />
              <button
                type="submit"
                className="btn btn-ghost btn-sm esl-delete-btn"
                disabled={isDeletingPassage}
              >
                {isDeletingPassage ? "Deleting..." : "Delete passage"}
              </button>
            </form>
          </div>
        </div>

        {actionData?.error ? <div className="form-error">{actionData.error}</div> : null}

        {composeView ? (
          <EslAttemptComposer
            submitLabel={attempts.length === 0 ? "Submit First Attempt" : "Submit Attempt"}
            isSubmitting={isSubmitting}
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
        ) : selected ? (
          <AttemptDetail
            attemptId={selected.id}
            passageText={passage.content_text}
            audioUrl={selected.audioUrl}
            createdAt={selected.createdAt}
            durationMs={selected.durationMs}
            mode={selected.mode}
            evaluationStatus={selected.evaluationStatus}
            evaluation={selected.evaluation}
            modelName={selected.modelName}
          />
        ) : (
          <Card className="tool-card-stack">
            No attempt selected. Choose a history item or start a new attempt.
          </Card>
        )}
      </div>

      <EslReadingHistoryRail
        passageId={passage.id}
        attempts={attempts}
        selectedAttemptId={selected?.id ?? null}
        isComposeView={composeView}
        disableNewAttempt={composeView}
      />
    </div>
  );
}

function AttemptDetail(props: {
  attemptId: string;
  passageText: string;
  audioUrl: string;
  createdAt: string;
  durationMs: number | null;
  mode: string;
  evaluationStatus: "pending" | "completed" | "failed";
  evaluation: EslReadingEvaluationOutput | null;
  modelName: string | null;
}) {
  return (
    <div className="esl-detail-stack">
      <Card className="tool-card-stack esl-detail-passage-card">
        <div className="esl-detail-section-label">Passage</div>
        <div className="esl-passage-body">{props.passageText}</div>
      </Card>

      <Card className="tool-card-stack esl-detail-card">
        <div className="esl-detail-head">
          <div className="esl-detail-head-main">
            <Badge className={`esl-status-badge is-${props.evaluationStatus}`}>
              {props.evaluationStatus === "pending"
                ? "AI Pending"
                : props.evaluationStatus === "failed"
                  ? "AI Failed"
                  : "AI Ready"}
            </Badge>
            <div className="esl-eval-meta">
              <span>{props.mode === "recitation" ? "Recitation" : "Reading"}</span>
              <span>{formatDateTime(props.createdAt)}</span>
              {props.durationMs ? <span>{formatDuration(props.durationMs)}</span> : null}
            </div>
          </div>
          <audio controls src={props.audioUrl} className="esl-audio-player" />
        </div>

        {props.evaluationStatus === "pending" ? (
          <div className="esl-attempt-state">
            <div className="esl-attempt-state-title">AI evaluation in progress</div>
            <p className="esl-attempt-state-desc">
              This attempt is saved. Keep this page open and the feedback will appear automatically.
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

        {props.modelName ? <div className="esl-model-note">Model: {props.modelName}</div> : null}

        <form
          method="post"
          className="esl-eval-delete"
          onSubmit={(event) => {
            if (!confirm("Delete this attempt and its AI feedback?")) event.preventDefault();
          }}
        >
          <input type="hidden" name="_intent" value="deleteAttempt" />
          <input type="hidden" name="attemptId" value={props.attemptId} />
          <button type="submit" className="btn btn-ghost btn-sm esl-delete-btn">
            Delete attempt
          </button>
        </form>
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
      <div className="esl-eval-head">
        <div className="esl-eval-overall">{evaluation.scores.overall}</div>
        <div className="esl-eval-overall-label">
          Overall
          {evaluation.cefr_guess ? ` · ${evaluation.cefr_guess}` : ""}
        </div>
      </div>

      <div className="esl-score-bars">
        {dimensions.map((dimension) => (
          <div key={dimension.label} className="esl-score-bar-row">
            <span className="esl-score-bar-label">{dimension.label}</span>
            <div className="esl-score-bar-track">
              <div
                className="esl-score-bar-fill"
                style={{ width: `${Math.max(4, dimension.score)}%` }}
              />
            </div>
            <span className="esl-score-bar-value">{dimension.score}</span>
          </div>
        ))}
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
