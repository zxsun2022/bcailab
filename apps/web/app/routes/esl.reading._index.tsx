import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useActionData, useLoaderData } from "@remix-run/react";
import { Button, Card, Input, Textarea } from "@bcailab/ui";
import { createEslPassage, listEslPassagesByUser } from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { clipText, MAX_ESL_PASSAGE_CHARS, normalizeEslPassageText } from "~/utils/esl-reading";
import * as React from "react";

type ActionData = { error?: string };

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const passages = await listEslPassagesByUser(context.env.DB, user.id);
  return json({ passages });
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const user = await requireUser(request, context);
  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "createPassage");
  if (intent !== "createPassage") {
    return json<ActionData>({ error: "Unsupported action." }, { status: 400 });
  }

  const titleRaw = String(formData.get("title") ?? "").trim();
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

  const created = await createEslPassage(context.env.DB, {
    userId: user.id,
    title: titleRaw || null,
    contentText: content
  });

  return redirect(`/esl/reading/${created.id}`);
};

export default function EslReadingIndexPage() {
  const { passages } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const characterCount = content.length;

  return (
    <div className="tool-page">
      <p className="tool-desc">
        Create a passage, then submit multiple reading or recitation attempts to track progress.
      </p>

      <Card className="tool-card-stack">
        <form method="post" action="?index" className="esl-passage-form">
          <Input
            name="title"
            placeholder="Passage title (optional)"
            value={title}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setTitle(event.currentTarget.value)}
          />
          <Textarea
            name="content"
            rows={10}
            placeholder="Paste the English passage here..."
            value={content}
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
              setContent(event.currentTarget.value)
            }
          />
          <div className="textarea-meta">
            <span>Reading / Recitation source</span>
            <span className="textarea-count">
              {characterCount.toLocaleString()} / {MAX_ESL_PASSAGE_CHARS.toLocaleString()}
            </span>
          </div>
          {actionData?.error ? <div className="form-error">{actionData.error}</div> : null}
          <div className="form-actions form-actions-inline">
            <Button type="submit">Create passage</Button>
          </div>
        </form>
      </Card>

      <div className="esl-passage-list">
        <div className="esl-passage-list-head">
          <h2>Your passages</h2>
          <span>{passages.length}</span>
        </div>
        {passages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">No passages yet</div>
            <p className="empty-state-desc">Create your first passage to start practicing.</p>
          </div>
        ) : (
          <div className="esl-passage-grid">
            {passages.map((passage) => (
              <Card key={passage.id} className="esl-passage-card">
                <div className="esl-passage-card-head">
                  <h3>{passage.title || "Untitled passage"}</h3>
                  <span className="post-meta">{formatDate(passage.updated_at)}</span>
                </div>
                <p className="esl-passage-preview">{clipText(passage.content_text, 180)}</p>
                <div className="form-actions form-actions-inline">
                  <Link to={`/esl/reading/${passage.id}`} className="btn btn-primary btn-sm">
                    Practice
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
