import * as React from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useFetcher, useLoaderData } from "@remix-run/react";
import { getOptionalUser } from "~/utils/auth.server";
import {
  getFeatureQuotaStatus,
  recordFeatureUsage,
  resolveQuotaSubject
} from "~/utils/feature-quota.server";
import { evaluateWriting, type WritingFeedback } from "~/utils/writing-eval.server";
import { countWords } from "~/utils/writing-article.server";
import {
  DEFAULT_AGENT_ID,
  getWritingAgentOrDefault,
  listWritingAgents
} from "~/utils/writing-agents";
import { WritingEditor } from "~/components/WritingEditor";
import { WritingFeedbackPanel } from "~/components/WritingFeedback";
import { useWritingFeedbackLanguage } from "~/utils/use-writing-feedback-language";
import { openLoginPopup } from "~/utils/login-popup";

/**
 * Anonymous writing trial (design Appendix A).
 *
 * Escapes the `/writing` layout (which calls `requireUser`) via the `writing_.`
 * route-name prefix, so it renders standalone under the site header.
 *
 * **Nothing is persisted.** The essay is evaluated and the result rendered from the
 * action's JSON response — no `writing_articles` row, no `writing_revisions` row, no
 * history. Only the daily quota counter is written. Signing in is what turns this
 * into saved, tracked practice.
 */

export const meta: MetaFunction = () => [
  { title: "Try the Writing Coach · bcailab" },
  {
    name: "description",
    content:
      "Submit one piece of writing and get structured AI feedback. No account needed to try."
  }
];

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await getOptionalUser(request, context);
  // Signed-in users have the real tool, with history and revision rounds.
  if (user) throw redirect("/writing");

  const subject = resolveQuotaSubject(request, null);
  const quota = await getFeatureQuotaStatus(context.env.DB, "writing_trial", subject);

  return json(
    { allowed: quota.allowed, remainingToday: quota.remainingToday },
    subject.setCookie ? { headers: { "Set-Cookie": subject.setCookie } } : undefined
  );
};

type ActionData =
  | { ok: true; feedback: WritingFeedback; agentType: string; wordCount: number }
  | { ok: false; error: string; code?: "quota_exceeded" };

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const user = await getOptionalUser(request, context);
  if (user) return redirect("/writing");

  const subject = resolveQuotaSubject(request, null);
  const extraHeaders = subject.setCookie ? { "Set-Cookie": subject.setCookie } : undefined;

  const formData = await request.formData();
  const userText = String(formData.get("userText") ?? "").trim();
  if (!userText) {
    return json<ActionData>(
      { ok: false, error: "Please write something before submitting." },
      { status: 400, headers: extraHeaders }
    );
  }

  const wordCount = countWords(userText);
  if (wordCount < 10) {
    return json<ActionData>(
      { ok: false, error: "Please write at least 10 words." },
      { status: 400, headers: extraHeaders }
    );
  }

  const quota = await getFeatureQuotaStatus(context.env.DB, "writing_trial", subject);
  if (!quota.allowed) {
    return json<ActionData>(
      {
        ok: false,
        code: "quota_exceeded",
        error: "You've used today's free writing feedback. Sign in to keep going — it's free."
      },
      { status: 429, headers: extraHeaders }
    );
  }

  const agentType = String(formData.get("agentType") ?? DEFAULT_AGENT_ID);
  const feedbackLanguage = formData.get("feedbackLanguage") === "zh" ? ("zh" as const) : ("en" as const);
  const topic = String(formData.get("topic") ?? "").trim() || undefined;

  try {
    const { feedback } = await evaluateWriting({
      env: context.env,
      agentType,
      userText,
      wordCount,
      feedbackLanguage,
      previousRound: null,
      historyScores: [],
      topic
    });
    // Charged only after a successful evaluation, so a provider failure is free.
    await recordFeatureUsage(context.env.DB, "writing_trial", { ...subject, units: wordCount });
    return json<ActionData>(
      { ok: true, feedback, agentType, wordCount },
      { headers: extraHeaders }
    );
  } catch {
    return json<ActionData>(
      { ok: false, error: "Feedback failed. Please retry." },
      { status: 500, headers: extraHeaders }
    );
  }
};

export default function WritingTrialPage() {
  const { allowed, remainingToday } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();
  const [agentType, setAgentType] = React.useState(DEFAULT_AGENT_ID);
  const [text, setText] = React.useState("");
  const [feedbackLanguage] = useWritingFeedbackLanguage();
  const agent = getWritingAgentOrDefault(agentType);
  const agents = listWritingAgents();

  const data = fetcher.data;
  const result = data && "ok" in data && data.ok ? data : null;
  const errorMessage = data && "ok" in data && !data.ok ? data.error : null;
  const gated = !allowed || (data && "ok" in data && !data.ok && data.code === "quota_exceeded");

  if (gated) {
    return (
      <div className="trial-page">
        <div className="trial-gate">
          <h1 className="trial-gate-title">You've used today's free feedback</h1>
          <p className="trial-gate-body">
            Sign in to keep writing — it's free, and your drafts, feedback rounds, and
            progress are saved.
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
        <h1 className="trial-title">Writing Coach</h1>
        <p className="trial-subtitle">
          Submit one piece of writing and get structured feedback: what's working, what to
          fix, and questions to guide your revision.
        </p>
      </header>

      {result ? (
        <>
          <WritingFeedbackPanel feedback={result.feedback} roundNumber={1} />

          <div className="trial-cta">
            <p className="trial-cta-text">
              This result isn't saved. Sign in to keep your drafts, work through revision
              rounds with the coach, and track your progress over time.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => openLoginPopup()}>
              Sign in to save this
            </button>
          </div>
        </>
      ) : (
        <fetcher.Form method="post" className="writing-index-form">
          <input type="hidden" name="feedbackLanguage" value={feedbackLanguage} />

          <div className="writing-coach-row">
            <div className="writing-control-group">
              <label className="writing-label" htmlFor="agentType">
                Coach
              </label>
              <select
                id="agentType"
                name="agentType"
                className="writing-select"
                value={agentType}
                onChange={(event) => setAgentType(event.currentTarget.value)}
              >
                {agents.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="writing-coach-desc">{agent.description}</p>
          </div>

          <WritingEditor value={text} onChange={setText} agent={agent} name="userText" />

          {errorMessage ? <div className="form-error">{errorMessage}</div> : null}

          <div className="writing-index-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!text.trim() || fetcher.state === "submitting"}
            >
              {fetcher.state === "submitting" ? "Getting feedback..." : "Get feedback"}
            </button>
            {remainingToday !== null ? (
              <span className="trial-remaining">
                {remainingToday} free {remainingToday === 1 ? "try" : "tries"} left today
              </span>
            ) : null}
          </div>
        </fetcher.Form>
      )}
    </div>
  );
}
