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
import {
  FEATURED_WRITING_TRIAL_SLUG,
  classifyWritingTrialAssignment
} from "~/utils/writing-trial";
import {
  isWritingSchemaMissingError,
  logWritingSchemaMissing
} from "~/utils/writing-schema.server";
import { useT } from "~/i18n/context";
import { metaTranslator } from "~/i18n/meta";
import { getRequestTranslator } from "~/i18n/locale.server";
import { writingAgentCopy } from "~/utils/writing-agent-copy";

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

export const meta: MetaFunction = ({ matches }) => {
  const t = metaTranslator(matches);
  return [
    { title: t("meta.writingTrial.title") },
    { name: "description", content: t("meta.writingTrial.description") }
  ];
};

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
      FEATURED_WRITING_TRIAL_SLUG
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
  const t = getRequestTranslator(request);

  const formData = await request.formData();
  const userText = String(formData.get("userText") ?? "").trim();
  if (!userText) {
    return json<ActionData>(
      { ok: false, error: t("writing.error.empty") },
      { status: 400, headers: extraHeaders }
    );
  }

  const wordCount = countWords(userText);
  if (wordCount < 10) {
    return json<ActionData>(
      { ok: false, error: t("writing.error.tooShort") },
      { status: 400, headers: extraHeaders }
    );
  }

  const quota = await getFeatureQuotaStatus(context.env.DB, "writing_trial", subject);
  if (!quota.allowed) {
    return json<ActionData>(
      {
        ok: false,
        code: "quota_exceeded",
        error: t("writing.error.trialQuota")
      },
      { status: 429, headers: extraHeaders }
    );
  }

  let agentType = String(formData.get("agentType") ?? DEFAULT_AGENT_ID);
  const feedbackLanguage = formData.get("feedbackLanguage") === "zh" ? ("zh" as const) : ("en" as const);
  let topic = String(formData.get("topic") ?? "").trim() || undefined;
  let assignment = null;
  const featuredSlug = String(formData.get("featuredSlug") ?? "");
  const assignmentMode = classifyWritingTrialAssignment(featuredSlug);
  if (assignmentMode === "invalid") {
    return json<ActionData>(
      { ok: false, error: t("writing.error.trialUnavailable") },
      { status: 409, headers: extraHeaders }
    );
  }
  if (assignmentMode === "featured") {
    let row;
    try {
      row = await getPublishedWritingPromptBySlug(
        context.env.DB,
        FEATURED_WRITING_TRIAL_SLUG
      );
    } catch (error) {
      if (!isWritingSchemaMissingError(error)) throw error;
      logWritingSchemaMissing("writing.trial.action", error);
      return json<ActionData>(
        { ok: false, error: t("writing.unavailableError") },
        { status: 503, headers: extraHeaders }
      );
    }
    const renderedHash = String(formData.get("contentHash") ?? "");
    if (!row || row.content_hash !== renderedHash) {
      return json<ActionData>(
        { ok: false, error: t("writing.error.trialChanged") },
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
      { ok: false, error: t("writing.error.feedbackFailed") },
      { status: 500, headers: extraHeaders }
    );
  }
};

export default function WritingTrialPage() {
  const { allowed, remainingToday, featured } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();
  const t = useT();
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
          <h1 className="trial-gate-title">{t("writingTrial.gateTitle")}</h1>
          <p className="trial-gate-body">{t("writingTrial.gateBody")}</p>
          <button type="button" className="btn btn-primary" onClick={() => openLoginPopup()}>
            {t("common.signInFree")}
          </button>
          <Link to="/english" className="trial-back">
            {t("trial.backToStudio")}
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
          {t("trial.studioLink")}
        </Link>
        <p className="trial-eyebrow">{t("trial.eyebrow")}</p>
        <h1 className="trial-title">{t("writingTrial.title")}</h1>
        <p className="trial-subtitle">
          {featured ? t("writingTrial.subtitleFeatured") : t("writingTrial.subtitle")}
        </p>
      </header>

      {result ? (
        <>
          <WritingFeedbackPanel feedback={result.feedback} roundNumber={1} />

          <div className="trial-cta">
            <p className="trial-cta-text">{t("writingTrial.ctaText")}</p>
            <button type="button" className="btn btn-primary" onClick={() => openLoginPopup()}>
              {t("readingTrial.signInToSave")}
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
                <p className="writing-section-eyebrow">{t("writingTrial.featured")}</p>
                <h2 id="trial-assignment-heading" lang="en">{featured.title}</h2>
                <p lang="en">{featured.promptText}</p>
              </section>
              <WritingPromptMaterial assignment={featured} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setUseFeatured(false)}>
                {t("writingTrial.ownTopic")}
              </button>
            </>
          ) : null}

          {!useFeatured || !featured ? (
            <div className="writing-coach-row">
              <div className="writing-control-group">
                <label className="writing-label" htmlFor="agentType">
                  {t("writing.coach")}
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
                      {writingAgentCopy(t, entry).label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="writing-coach-desc">{writingAgentCopy(t, activeAgent).description}</p>
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
              {fetcher.state === "submitting" ? t("writingTrial.gettingFeedback") : t("writingTrial.getFeedback")}
            </button>
            {remainingToday !== null ? (
              <span className="trial-remaining">
                {t(remainingToday === 1 ? "readingTrial.remainingOne" : "readingTrial.remainingMany", {
                  count: remainingToday
                })}
              </span>
            ) : null}
          </div>
        </fetcher.Form>
      )}
    </div>
  );
}
