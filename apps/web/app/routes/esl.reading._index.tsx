import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData } from "@remix-run/react";
import { Button, Card, Textarea } from "@bcailab/ui";
import { createEslPassage } from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { MAX_ESL_PASSAGE_CHARS, normalizeEslPassageText } from "~/utils/esl-reading";
import { generatePassageTitle } from "~/utils/esl-reading-eval.server";
import * as React from "react";

type ActionData = { error?: string };

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const user = await requireUser(request, context);
  const formData = await request.formData();
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

  const title = await generatePassageTitle(context.env, content);
  const created = await createEslPassage(context.env.DB, {
    userId: user.id,
    title,
    contentText: content
  });

  return redirect(`/esl/reading/${created.id}`);
};

export default function EslReadingIndexPage() {
  const actionData = useActionData<typeof action>();
  const [content, setContent] = React.useState("");

  return (
    <div className="esl-center-panel">
      <div className="esl-welcome">
        <h2>Reading / Recitation</h2>
        <p className="esl-welcome-desc">
          Paste an English passage below, then record yourself reading or reciting it to get AI feedback.
        </p>
      </div>

      <Card className="tool-card-stack">
        <form method="post" action="?index" className="esl-passage-form">
          <Textarea
            name="content"
            rows={12}
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
          {actionData?.error ? <div className="form-error">{actionData.error}</div> : null}
          <div className="form-actions form-actions-inline">
            <Button type="submit" disabled={!content.trim()}>Create & start practicing</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
