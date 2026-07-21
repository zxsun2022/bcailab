import * as React from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { getTrialPassage, recordPassageAttemptStat } from "@bcailab/db";
import { getOptionalUser } from "~/utils/auth.server";
import {
  getFeatureQuotaStatus,
  recordFeatureUsage,
  resolveQuotaSubject
} from "~/utils/feature-quota.server";
import {
  EslAttemptSubmissionError,
  parseEslAttemptSubmission
} from "~/utils/esl-reading-attempt.server";
import { evaluateEslReadingAttempt } from "~/utils/esl-reading-eval.server";
import type { EslReadingEvaluationOutput } from "~/utils/esl-reading";
import { EslAttemptComposer } from "~/components/EslAttemptComposer";
import { EslEvaluation } from "~/components/EslEvaluation";
import { openLoginPopup } from "~/utils/login-popup";

/**
 * Anonymous reading trial (design Appendix A).
 *
 * Escapes the `/reading` layout (which calls `requireUser`) via the `reading_.`
 * route-name prefix.
 *
 * **Nothing is persisted, including the audio.** The signed-in flow writes the
 * recording to R2 and creates an attempt row before evaluating; the trial passes
 * the audio bytes straight to the evaluator and lets them fall out of scope. There
 * is therefore no `trial/` R2 prefix to clean up and no deletion task to get wrong —
 * the recording never lands anywhere. Only the daily quota counter is written.
 *
 * Because there is no attempt row to poll, evaluation runs inline rather than in a
 * `waitUntil` background task, and the result comes back in the action response.
 */

export const meta: MetaFunction = () => [
  { title: "Try Reading Practice · bcailab" },
  {
    name: "description",
    content:
      "Read a short passage aloud and get AI feedback on pronunciation, fluency, and rhythm. No account needed to try."
  }
];

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await getOptionalUser(request, context);
  // Signed-in users have the real tool, with their own passages and attempt history.
  if (user) throw redirect("/reading");

  const subject = resolveQuotaSubject(request, null);
  const quota = await getFeatureQuotaStatus(context.env.DB, "reading_trial", subject);

  // The trial sample now comes from the shared library rather than a code constant,
  // so a visitor practises the same graded material a signed-in learner would.
  const passage = await getTrialPassage(context.env.DB);
  if (!passage) throw new Response("Not found", { status: 404 });

  return json(
    {
      allowed: quota.allowed,
      remainingToday: quota.remainingToday,
      passage: { id: passage.id, title: passage.title, text: passage.content_text }
    },
    subject.setCookie ? { headers: { "Set-Cookie": subject.setCookie } } : undefined
  );
};

type ActionData =
  | { ok: true; evaluation: EslReadingEvaluationOutput }
  | { error: string; code?: "quota_exceeded" };

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const user = await getOptionalUser(request, context);
  if (user) return redirect("/reading");

  const subject = resolveQuotaSubject(request, null);
  const extraHeaders = subject.setCookie ? { "Set-Cookie": subject.setCookie } : undefined;

  const quota = await getFeatureQuotaStatus(context.env.DB, "reading_trial", subject);
  if (!quota.allowed) {
    return json<ActionData>(
      {
        code: "quota_exceeded",
        error: "You've used today's free reading feedback. Sign in to keep going — it's free."
      },
      { status: 429, headers: extraHeaders }
    );
  }

  const passage = await getTrialPassage(context.env.DB);
  if (!passage) throw new Response("Not found", { status: 404 });

  try {
    const formData = await request.formData();
    const submission = await parseEslAttemptSubmission(formData);

    const evaluation = await evaluateEslReadingAttempt({
      env: context.env,
      passageText: passage.content_text,
      mode: submission.mode,
      outputLanguage: submission.outputLanguage,
      audioBytes: new Uint8Array(submission.audioBuffer),
      audioMimeType: submission.audioMimeType,
      durationMs: submission.durationMs,
      history: [],
      // v1 trials never read or write the learner profile.
      learnerProfile: null
    });

    // A trial attempt is still a real attempt on this passage, so it feeds the
    // material layer's difficulty statistics — same rule as anonymous dictation.
    // The row carries no identity.
    await recordPassageAttemptStat(context.env.DB, {
      passageId: passage.id,
      mode: "reading",
      accuracy: Math.min(1, Math.max(0, evaluation.output.scores.overall / 100))
    });

    // Charged only after a successful evaluation, so a provider failure is free.
    await recordFeatureUsage(context.env.DB, "reading_trial", {
      ...subject,
      units: submission.durationMs ? Math.round(submission.durationMs / 1000) : 0
    });

    return json<ActionData>({ ok: true, evaluation: evaluation.output }, { headers: extraHeaders });
  } catch (error) {
    if (error instanceof EslAttemptSubmissionError) {
      return json<ActionData>(
        { error: error.message },
        { status: error.status ?? 400, headers: extraHeaders }
      );
    }
    return json<ActionData>(
      { error: "Evaluation failed. Please retry." },
      { status: 500, headers: extraHeaders }
    );
  }
};

export default function ReadingTrialPage() {
  const { allowed, remainingToday, passage } = useLoaderData<typeof loader>();
  const [evaluation, setEvaluation] = React.useState<EslReadingEvaluationOutput | null>(null);
  const [quotaSpent, setQuotaSpent] = React.useState(false);

  const handleResult = React.useCallback((data: unknown) => {
    const payload = data as ActionData;
    if ("ok" in payload && payload.ok) {
      setEvaluation(payload.evaluation);
      return;
    }
    if ("code" in payload && payload.code === "quota_exceeded") setQuotaSpent(true);
  }, []);

  if (!allowed || quotaSpent) {
    return (
      <div className="trial-page">
        <div className="trial-gate">
          <h1 className="trial-gate-title">You've used today's free reading feedback</h1>
          <p className="trial-gate-body">
            Sign in to keep practicing — it's free. You get the full graded library, twenty
            passages from CEFR A2 to C1, plus your own texts, every attempt kept, and scores
            you can watch move over time.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => openLoginPopup()}>
            Sign in — it's free
          </button>
          <Link to="/english" className="trial-back">
            Back to English Studio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="trial-page">
      <header className="trial-header">
        <p className="trial-eyebrow">Free trial · no account needed</p>
        <h1 className="trial-title">Reading Practice</h1>
        <p className="trial-subtitle">
          Read the passage below aloud. You'll get feedback on pronunciation, fluency,
          rhythm, and clarity.
        </p>
      </header>

      {evaluation ? (
        <>
          <EslEvaluation evaluation={evaluation} passageText={passage.text} />

          <div className="trial-cta">
            <p className="trial-cta-text">
              This attempt isn't saved. Sign in to unlock the full graded library — twenty
              passages from CEFR A2 to C1 — add your own texts, keep every recording, and
              track your scores over time.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => openLoginPopup()}>
              Sign in to save this
            </button>
          </div>
        </>
      ) : (
        <EslAttemptComposer submitLabel="Get feedback" mode="reading" onResult={handleResult}>
          {({ recorder }) => (
            <>
              <div className="trial-passage">
                <h2 className="trial-passage-title">{passage.title}</h2>
                <p className="trial-passage-text">{passage.text}</p>
              </div>
              {recorder}
              {remainingToday !== null ? (
                <p className="trial-remaining">
                  {remainingToday} free {remainingToday === 1 ? "try" : "tries"} left today
                </p>
              ) : null}
            </>
          )}
        </EslAttemptComposer>
      )}
    </div>
  );
}
