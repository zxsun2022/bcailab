import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData, useLoaderData, Link } from "@remix-run/react";
import { Button, Card } from "@bcailab/ui";
import { getPostById, updatePost } from "@bcailab/db";
import { AutosizeTextarea } from "~/components/AutosizeTextarea";
import { renderMarkdown } from "~/utils/markdown.server";
import { requireUser } from "~/utils/auth.server";
import { MAX_POST_LENGTH, normalizePostContent } from "~/utils/posts";
import * as React from "react";

export const loader = async ({ request, context, params }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const id = params.id;
  if (!id) {
    throw new Response("Not found", { status: 404 });
  }
  const post = await getPostById(context.env.DB, id, { includeDeleted: true });
  if (!post || post.user_id !== user.id || post.deleted_at) {
    throw new Response("Not found", { status: 404 });
  }
  return json({ post });
};

export const action = async ({ request, context, params }: ActionFunctionArgs) => {
  const user = await requireUser(request, context);
  const id = params.id;
  if (!id) {
    throw new Response("Not found", { status: 404 });
  }

  const formData = await request.formData();
  const existing = await getPostById(context.env.DB, id, { includeDeleted: true });
  if (!existing || existing.user_id !== user.id || existing.deleted_at) {
    throw new Response("Not found", { status: 404 });
  }

  const content = normalizePostContent(String(formData.get("content") ?? "")).trim();
  if (!content) {
    return json({ error: "Content cannot be empty." }, { status: 400 });
  }
  if (content.length > MAX_POST_LENGTH) {
    return json(
      { error: `Content exceeds ${MAX_POST_LENGTH.toLocaleString()} characters.` },
      { status: 400 }
    );
  }

  const contentHtml = await renderMarkdown(content);
  await updatePost(context.env.DB, {
    id,
    userId: user.id,
    contentMd: content,
    contentHtml
  });

  return redirect(`/posts/${id}`);
};

export default function EditPost() {
  const { post } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [content, setContent] = React.useState(post.content_md);
  const characterCount = content.length;

  return (
    <div className="tool-page">
      <Card>
        <form method="post">
          <AutosizeTextarea
            name="content"
            value={content}
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
              setContent(event.currentTarget.value)
            }
            maxLength={MAX_POST_LENGTH}
          />
          <div className="textarea-meta">
            <span>Markdown supported</span>
            <span className="textarea-count">
              {characterCount.toLocaleString()} / {MAX_POST_LENGTH.toLocaleString()}
            </span>
          </div>
          {actionData?.error && <div className="form-error">{actionData.error}</div>}
          <div className="form-actions form-actions-inline">
            <Button type="submit">Save changes</Button>
            <Link to={`/posts/${post.id}`} className="btn btn-ghost">Cancel</Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
