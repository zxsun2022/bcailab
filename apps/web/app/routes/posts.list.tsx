import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, Link, useNavigate } from "@remix-run/react";
import { Button, Card } from "@bcailab/ui";
import { getPostById, listPostsByUser, softDeletePost } from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { extractTitle, stripMarkdown } from "~/utils/posts";

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });

const previewText = (md: string, maxLen = 120): string => {
  const plain = stripMarkdown(md);
  return plain.length > maxLen ? `${plain.slice(0, maxLen)}...` : plain;
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const posts = await listPostsByUser(context.env.DB, user.id);
  return json({ posts });
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const user = await requireUser(request, context);
  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "");

  if (intent === "delete") {
    const id = String(formData.get("id") ?? "");
    const post = await getPostById(context.env.DB, id, { includeDeleted: true });
    if (!post || post.user_id !== user.id) {
      return json({ error: "Not authorized." }, { status: 403 });
    }
    await softDeletePost(context.env.DB, { id, userId: user.id });
    return redirect("/posts/list");
  }

  return json({});
};

export default function PostsListPage() {
  const { posts } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <div className="tool-page">
      <div className="posts-header">
        <p className="tool-desc">
          All your published posts.
        </p>
        <Link to="/posts" className="btn btn-primary">
          New post
        </Link>
      </div>

      {posts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No posts yet</div>
          <p className="empty-state-desc">
            Write your first post and publish it instantly.
          </p>
        </div>
      ) : (
        <div className="posts-list">
          {posts.map((post) => {
            const title = extractTitle(post.content_md);
            return (
              <Card
                key={post.id}
                className="post-row post-row-clickable"
                onClick={() => navigate(`/posts/${post.id}`)}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/posts/${post.id}`);
                  }
                }}
              >
                <div className="post-row-content">
                  {title ? (
                    <>
                      <div className="post-row-title">{title}</div>
                      <div className="post-row-excerpt">{previewText(post.content_md)}</div>
                    </>
                  ) : (
                    <div className="post-row-preview">{previewText(post.content_md)}</div>
                  )}
                  <div className="post-meta">{formatDate(post.updated_at)}</div>
                </div>
                <div className="post-row-actions" onClick={(e) => e.stopPropagation()}>
                  <Link to={`/posts/${post.id}/edit`} className="btn btn-ghost btn-sm">
                    Edit
                  </Link>
                  <form method="post" style={{ display: "inline" }} onSubmit={(e) => { if (!confirm("Delete this post? This cannot be undone.")) e.preventDefault(); }}>
                    <input type="hidden" name="_intent" value="delete" />
                    <input type="hidden" name="id" value={post.id} />
                    <Button type="submit" variant="danger" size="sm">
                      Delete
                    </Button>
                  </form>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
