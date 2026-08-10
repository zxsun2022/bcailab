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
import { getPublishedWritingPromptBySlug } from "@bcailab/db";
import { materializeWritingPrompt } from "~/utils/writing-prompt.server";
import { WritingPromptMaterial } from "~/components/WritingPromptMaterial";

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
  let featured = null;
  try {
    const row = await getPublishedWritingPromptBySlug(
      context.env.DB,
      "general-a2-study-invitation"
    );
    featured = row ? materializeWritingPrompt(row).snapshot : null;
  } catch {
    // A safe empty state during additive migration or before owner-reviewed publication.
  }

  return json(
    { allowed: quota.allowed, remainingToday: quota.remainingToday, featured },
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

  let agentType = String(formData.get("agentType") ?? DEFAULT_AGENT_ID);
  const feedbackLanguage = formData.get("feedbackLanguage") === "zh" ? ("zh" as const) : ("en" as const);
  let topic = String(formData.get("topic") ?? "").trim() || undefined;
  let assignment = null;
  const featuredSlug = String(formData.get("featuredSlug") ?? "");
  if (featuredSlug) {
    const row = await getPublishedWritingPromptBySlug(context.env.DB, featuredSlug);
    const renderedHash = String(formData.get("contentHash") ?? "");
    if (!row || row.content_hash !== renderedHash) {
      return json<ActionData>(
        { ok: false, error: "This trial assignment changed. Refresh before submitting." },
        { status: 409, headers: extraHeaders }
      );
    }
    assignment = materializeWritingPrompt(row).snapshot;
    agentType = assignment.coachId;
    topic = assignment.promptText;
  }
  if (agentType === "ielts_task1" && !assignment) agentType = DEFAULT_AGENT_ID;

  try {
    const { feedback } = await evaluateWriting({
      env: context.env,
      agentType,
      userText,
      wordCount,
      feedbackLanguage,
      previousRound: null,
      historyScores: [],
      topic,
      assignment
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
  const { allowed, remainingToday, featured } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();
  const [agentType, setAgentType] = React.useState(DEFAULT_AGENT_ID);
  const [text, setText] = React.useState("");
  const [useFeatured, setUseFeatured] = React.useState(Boolean(featured));
  const [feedbackLanguage] = useWritingFeedbackLanguage();
  const agent = getWritingAgentOrDefault(agentType);
  const agents = listWritingAgents().filter((entry) => entry.id !== "ielts_task1");
  const activeAgent = useFeatured && featured
    ? getWritingAgentOrDefault(featured.coachId)
    : agent;

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
        {/* The studio rail now routes anonymous visitors here from inside other modules,
            so the trial needs a way back before the quota runs out — not only on the gate. */}
        <Link to="/english" className="trial-studio-back">
          &larr; English Studio
        </Link>
        <p className="trial-eyebrow">Free trial · no account needed</p>
        <h1 className="trial-title">Writing Coach</h1>
        <p className="trial-subtitle">
          {featured
            ? "Start from a reviewed assignment or bring your own topic. Nothing is saved unless you later sign in and submit inside Writing."
            : "Submit one piece of writing and get structured feedback: what's working, what to fix, and questions to guide your revision."}
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
          {useFeatured && featured ? (
            <>
              <input type="hidden" name="featuredSlug" value={featured.promptSlug} />
              <input type="hidden" name="contentHash" value={featured.contentHash} />
              <section className="writing-assignment-copy" aria-labelledby="trial-assignment-heading">
                <p className="writing-section-eyebrow">Featured assignment</p>
                <h2 id="trial-assignment-heading">{featured.title}</h2>
                <p>{featured.promptText}</p>
              </section>
              <WritingPromptMaterial assignment={featured} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setUseFeatured(false)}>
                Use my own topic instead
              </button>
            </>
          ) : null}

          {!useFeatured || !featured ? (
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
              <p className="writing-coach-desc">{activeAgent.description}</p>
            </div>
          ) : null}

          <WritingEditor value={text} onChange={setText} agent={activeAgent} name="userText" />

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
