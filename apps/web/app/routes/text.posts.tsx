import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, Link } from "@remix-run/react";
import { Button, Card } from "@bcailab/ui";
import { getPostById, listPostsByUser, softDeletePost } from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });

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
    return redirect("/text/posts");
  }

  return json({});
};

export default function PostsPage() {
  const { posts } = useLoaderData<typeof loader>();

  return (
    <div className="tool-page">
      <div className="posts-header">
        <p className="tool-desc">
          All your published texts.
        </p>
        <Link to="/text" className="btn btn-primary">
          New post
        </Link>
      </div>

      {posts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No posts yet</div>
          <p className="empty-state-desc">
            Write your first note and publish it instantly.
          </p>
        </div>
      ) : (
        <div className="posts-list">
          {posts.map((post) => (
            <Card key={post.id} className="post-row">
              <div className="post-row-content">
                <div className="post-row-preview">
                  {post.content_md.slice(0, 100)}
                  {post.content_md.length > 100 ? "..." : ""}
                </div>
                <div className="post-meta">{formatDate(post.updated_at)}</div>
              </div>
              <div className="post-row-actions">
                <Link to={`/text/${post.id}`} className="btn btn-ghost btn-sm">
                  View
                </Link>
                <Link to={`/text/${post.id}/edit`} className="btn btn-ghost btn-sm">
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
          ))}
        </div>
      )}
    </div>
  );
}
