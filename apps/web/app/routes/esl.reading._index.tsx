import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData, useNavigation } from "@remix-run/react";
import { Card, Textarea } from "@bcailab/ui";
import { createEslPassage, softDeleteEslPassage } from "@bcailab/db";
import { EslAttemptComposer } from "~/components/EslAttemptComposer";
import { EslReadingHistoryRail } from "~/components/EslReadingHistoryRail";
import { requireUser } from "~/utils/auth.server";
import {
  createAndScheduleEslReadingAttempt,
  EslAttemptSubmissionError,
  parseEslAttemptSubmission
} from "~/utils/esl-reading-attempt.server";
import { generatePassageTitle } from "~/utils/esl-reading-eval.server";
import { MAX_ESL_PASSAGE_CHARS, normalizeEslPassageText } from "~/utils/esl-reading";
import * as React from "react";

type ActionData = { error?: string };

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const user = await requireUser(request, context);
  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "submitAttempt");
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
    return redirect(`/esl/reading/${created.id}?attempt=${attemptId}`);
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
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting =
    navigation.state === "submitting" && navigation.formData?.get("_intent") === "submitAttempt";
  const [content, setContent] = React.useState("");

  return (
    <div className="esl-practice-layout">
      <div className="esl-center-panel">
        <div className="esl-welcome">
          <h2>New Passage</h2>
          <p className="esl-welcome-desc">
            Paste an English passage, record your first attempt, and we will create the first
            history entry from that submission.
          </p>
        </div>

        <EslAttemptComposer
          action="?index"
          submitLabel="Create Passage"
          isSubmitting={isSubmitting}
          canSubmit={Boolean(content.trim())}
          error={actionData?.error}
        >
          {() => (
            <Card className="tool-card-stack esl-compose-card">
              <Textarea
                name="content"
                rows={18}
                className="esl-compose-textarea"
                placeholder="Paste the English passage here..."
                value={content}
                onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setContent(event.currentTarget.value)
                }
              />
              <div className="textarea-meta">
                <span>Title will be auto-generated</span>
                <span className="textarea-count">
                  {content.length.toLocaleString()} / {MAX_ESL_PASSAGE_CHARS.toLocaleString()}
                </span>
              </div>
            </Card>
          )}
        </EslAttemptComposer>
      </div>

      <EslReadingHistoryRail attempts={[]} disableNewAttempt />
    </div>
  );
}
