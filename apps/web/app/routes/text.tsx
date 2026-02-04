import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData, useLoaderData } from "@remix-run/react";
import { Button, Card, Textarea } from "@bcailab/ui";
import { createPost, getPostById, listPostsByUser, softDeletePost } from "@bcailab/db";
import { renderMarkdown } from "~/utils/markdown.server";
import { requireUser } from "~/utils/auth.server";

const formatDate = (value: string) => new Date(value).toLocaleString();

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const posts = await listPostsByUser(context.env.DB, user.id);
  const url = new URL(request.url);
  const publishedId = url.searchParams.get("published");
  const publishedPost = publishedId
    ? await getPostById(context.env.DB, publishedId, { includeDeleted: true })
    : null;
  const published =
    publishedPost && publishedPost.user_id === user.id && !publishedPost.deleted_at
      ? publishedPost
      : null;

  return json({
    user,
    posts,
    published,
    origin: url.origin
  });
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const user = await requireUser(request, context);
  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "publish");

  if (intent === "delete") {
    const id = String(formData.get("id") ?? "");
    const post = await getPostById(context.env.DB, id, { includeDeleted: true });
    if (!post || post.user_id !== user.id) {
      return json({ error: "Not authorized." }, { status: 403 });
    }
    await softDeletePost(context.env.DB, { id, userId: user.id });
    return redirect("/text");
  }

  const content = String(formData.get("content") ?? "").trim();
  if (!content) {
    return json({ error: "Content cannot be empty." }, { status: 400 });
  }

  const contentHtml = await renderMarkdown(content);
  const post = await createPost(context.env.DB, {
    userId: user.id,
    contentMd: content,
    contentHtml
  });

  return redirect(`/text?published=${post.id}`);
};

export default function TextTool() {
  const { posts, published, origin } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div style={{ padding: "32px 0 80px" }}>
      <h1>Text Publisher</h1>
      <p style={{ color: "var(--muted)" }}>
        Write a note in Markdown and publish it instantly.
      </p>

      <Card style={{ marginTop: "24px" }}>
        <form method="post">
          <Textarea name="content" placeholder="Write your text in Markdown..." />
          {actionData?.error ? (
            <div style={{ color: "var(--accent)", marginTop: "12px" }}>{actionData.error}</div>
          ) : null}
          <div style={{ marginTop: "16px" }}>
            <Button type="submit">Publish</Button>
          </div>
        </form>
      </Card>

      {published ? (
        <div className="banner" style={{ marginTop: "24px" }}>
          <div>
            Published! URL: <strong>{`${origin}/text/${published.id}`}</strong>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigator.clipboard.writeText(`${origin}/text/${published.id}`)}
          >
            Copy URL
          </Button>
        </div>
      ) : null}

      <h2 className="section-title">Your posts</h2>
      <div className="list">
        {posts.length === 0 ? (
          <Card>No posts yet.</Card>
        ) : (
          posts.map((post) => (
            <Card key={post.id} className="post-item">
              <div className="post-meta">Updated {formatDate(post.updated_at)}</div>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <a href={`/text/${post.id}`} className="btn btn-ghost btn-sm">
                  View
                </a>
                <a href={`/text/${post.id}/edit`} className="btn btn-ghost btn-sm">
                  Edit
                </a>
                <form method="post">
                  <input type="hidden" name="_intent" value="delete" />
                  <input type="hidden" name="id" value={post.id} />
                  <Button type="submit" variant="danger" size="sm">
                    Delete
                  </Button>
                </form>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
