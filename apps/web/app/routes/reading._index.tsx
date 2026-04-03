import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Card, Textarea } from "@bcailab/ui";
import { createEslPassage, softDeleteEslPassage } from "@bcailab/db";
import { EslAttemptComposer, EslModeToggle } from "~/components/EslAttemptComposer";
import { EslReadingHistoryRail } from "~/components/EslReadingHistoryRail";
import { requireUser } from "~/utils/auth.server";
import {
  createAndScheduleEslReadingAttempt,
  EslAttemptSubmissionError,
  parseEslAttemptSubmission
} from "~/utils/esl-reading-attempt.server";
import { schedulePassageReferenceSynthesis } from "~/utils/esl-passage-reference.server";
import { generatePassageTitle } from "~/utils/esl-reading-eval.server";
import { MAX_ESL_PASSAGE_CHARS, normalizeEslPassageText, type EslReadingMode } from "~/utils/esl-reading";
import * as React from "react";

type ActionData = { error?: string; redirectTo?: string };
const HISTORY_RAIL_COLLAPSED_KEY = "reading-history-rail-collapsed";

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const user = await requireUser(request, context);
  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "submitAttempt");
  const transport = String(formData.get("_transport") ?? "document");
  if (intent !== "submitAttempt") {
    return json<ActionData>({ error: "Unsupported action." }, { status: 400 });
  }

  const content = normalizeEslPassageText(String(formData.get("content") ?? "")).trim();
  if (!content) {
    return json<ActionData>({ error: "Passage cannot be empty." }, { status: 400 });
  }
  if (content.length > MAX_ESL_PASSAGE_CHARS) {
    return json<ActionData>(
      { error: `Passage exceeds ${MAX_ESL_PASSAGE_CHARS.toLocaleString()} characters.` },
      { status: 400 }
    );
  }

  let submission;
  try {
    submission = await parseEslAttemptSubmission(formData);
  } catch (error) {
    if (error instanceof EslAttemptSubmissionError) {
      return json<ActionData>({ error: error.message }, { status: error.status });
    }
    return json<ActionData>({ error: "Failed to submit. Please retry." }, { status: 500 });
  }

  const title = await generatePassageTitle(context.env, content);
  let created: Awaited<ReturnType<typeof createEslPassage>> | null = null;

  try {
    created = await createEslPassage(context.env.DB, {
      userId: user.id,
      title,
      contentText: content
    });
    const { attemptId } = await createAndScheduleEslReadingAttempt(context, {
      userId: user.id,
      passage: created,
      submission
    });
    await schedulePassageReferenceSynthesis(context, {
      userId: user.id,
      passage: created
    });
    const redirectTo = `/reading/${created.id}?attempt=${attemptId}`;
    return transport === "fetcher"
      ? json({ redirectTo })
      : redirect(redirectTo);
  } catch (error) {
    if (created) {
      await softDeleteEslPassage(context.env.DB, { id: created.id, userId: user.id });
    }

    if (error instanceof EslAttemptSubmissionError) {
      return json<ActionData>({ error: error.message }, { status: error.status });
    }
    return json<ActionData>({ error: "Failed to submit. Please retry." }, { status: 500 });
  }
};

export default function EslReadingIndexPage() {
  const [content, setContent] = React.useState("");
  const [mode, setMode] = React.useState<EslReadingMode>("reading");
  const [historyRailCollapsed, setHistoryRailCollapsed] = React.useState(() => {
    try {
      const stored = localStorage.getItem(HISTORY_RAIL_COLLAPSED_KEY);
      return stored === null ? true : stored === "true";
    } catch {
      return true;
    }
  });

  const handleHistoryRailToggle = React.useCallback(() => {
    setHistoryRailCollapsed((current) => {
      const next = !current;
      try { localStorage.setItem(HISTORY_RAIL_COLLAPSED_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  return (
    <div className={`esl-practice-layout reading-workspace${historyRailCollapsed ? " is-history-collapsed" : ""}`}>
      <div className="reading-center-stage">
        <div className="reading-content-column">
          <div className="esl-center-panel">
            <div className="esl-welcome">
              <h2>New Passage</h2>
              <EslModeToggle mode={mode} onModeChange={setMode} />
            </div>

            <EslAttemptComposer
              action="?index"
              submitLabel="Submit"
              canSubmit={Boolean(content.trim())}
              mode={mode}
              onModeChange={setMode}
            >
              {({ hideText, recorder }) => (
                <Card className="tool-card-stack esl-compose-card esl-compose-draft-card">
                  <div className={`esl-compose-editor${hideText ? " is-masked" : ""}`}>
                    <Textarea
                      name="content"
                      rows={18}
                      className={`esl-compose-textarea${hideText ? " is-masked" : ""}`}
                      placeholder="Paste an English passage here. Record and submit the first attempt to create the first history entry automatically."
                      value={content}
                      readOnly={hideText}
                      onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                        setContent(event.currentTarget.value)
                      }
                    />
                    {hideText ? (
                      <div className="esl-compose-mask" aria-hidden="true">
                        <div className="esl-compose-mask-chip">Recite Mode</div>
                        <div className="esl-compose-mask-copy">
                          Text hidden for recitation mode. Switch back to Read if you want to review or edit the passage.
                        </div>
                      </div>
                    ) : null}
                    <div
                      className={`esl-compose-count ${
                        content.length > 0 ? "is-visible" : ""
                      } ${content.length > MAX_ESL_PASSAGE_CHARS ? "is-over-limit" : ""}`}
                    >
                      <span className="textarea-count">
                        {content.length.toLocaleString()} / {MAX_ESL_PASSAGE_CHARS.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {recorder}
                </Card>
              )}
            </EslAttemptComposer>
          </div>
        </div>
      </div>

      <div className="reading-detail-rail">
        <EslReadingHistoryRail
          attempts={[]}
          disableNewAttempt
          collapsed={historyRailCollapsed}
          onToggle={handleHistoryRailToggle}
        />
      </div>
    </div>
  );
}
