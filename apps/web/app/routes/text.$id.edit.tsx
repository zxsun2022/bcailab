import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData, useLoaderData } from "@remix-run/react";
import { Button, Card, Textarea } from "@bcailab/ui";
import { getPostById, softDeletePost, updatePost } from "@bcailab/db";
import { renderMarkdown } from "~/utils/markdown.server";
import { requireUser } from "~/utils/auth.server";

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
  const intent = String(formData.get("_intent") ?? "update");
  const existing = await getPostById(context.env.DB, id, { includeDeleted: true });
  if (!existing || existing.user_id !== user.id || existing.deleted_at) {
    throw new Response("Not found", { status: 404 });
  }

  if (intent === "delete") {
    await softDeletePost(context.env.DB, { id, userId: user.id });
    return redirect("/text");
  }

  const content = String(formData.get("content") ?? "").trim();
  if (!content) {
    return json({ error: "Content cannot be empty." }, { status: 400 });
  }

  const contentHtml = await renderMarkdown(content);
  await updatePost(context.env.DB, {
    id,
    userId: user.id,
    contentMd: content,
    contentHtml
  });

  return redirect(`/text/${id}`);
};

export default function EditPost() {
  const { post } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div style={{ padding: "40px 0 80px" }}>
      <h1>Edit Post</h1>
      <Card style={{ marginTop: "24px" }}>
        <form method="post">
          <Textarea name="content" defaultValue={post.content_md} />
          {actionData?.error ? (
            <div style={{ color: "var(--accent)", marginTop: "12px" }}>{actionData.error}</div>
          ) : null}
          <div style={{ marginTop: "16px", display: "flex", gap: "12px" }}>
            <Button type="submit">Save changes</Button>
            <Button type="submit" name="_intent" value="delete" variant="danger">
              Delete
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
