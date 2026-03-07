import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData, Link, useRevalidator } from "@remix-run/react";
import { Button } from "@bcailab/ui";
import { createPost, getPostById, listPostsByUser, softDeletePost } from "@bcailab/db";
import { AutosizeTextarea } from "~/components/AutosizeTextarea";
import { renderMarkdown } from "~/utils/markdown.server";
import { requireUser } from "~/utils/auth.server";
import { MAX_POST_LENGTH, extractTitle, normalizePostContent, stripMarkdown } from "~/utils/posts";
import * as React from "react";

type PublishedInfo = {
  id: string;
  url: string;
};

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });

const previewText = (md: string, maxLen = 84): string => {
  const plain = stripMarkdown(md);
  return plain.length > maxLen ? `${plain.slice(0, maxLen)}...` : plain;
};

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
      ? {
          id: publishedPost.id,
          url: `${url.origin}/posts/${publishedPost.id}`
        }
      : null;

  return json({
    posts,
    published
  });
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const user = await requireUser(request, context);
  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "publish");
  const acceptsHtml = request.headers.get("Accept")?.includes("text/html");

  if (intent === "delete") {
    const id = String(formData.get("id") ?? "");
    const post = await getPostById(context.env.DB, id, { includeDeleted: true });
    if (!post || post.user_id !== user.id) {
      return json({ error: "Not authorized." }, { status: 403 });
    }
    await softDeletePost(context.env.DB, { id, userId: user.id });
    return redirect("/posts");
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
  const post = await createPost(context.env.DB, {
    userId: user.id,
    contentMd: content,
    contentHtml
  });
  const url = new URL(request.url);
  const published = { id: post.id, url: `${url.origin}/posts/${post.id}` };

  if (acceptsHtml) {
    return redirect(`/posts?published=${post.id}`);
  }

  return json({ published });
};

export default function PostsTool() {
  const { posts, published: initialPublished } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const [content, setContent] = React.useState("");
  const [published, setPublished] = React.useState<PublishedInfo | null>(initialPublished ?? null);
  const lastPublishedId = React.useRef<string | null>(initialPublished?.id ?? null);

  React.useEffect(() => {
    if (initialPublished && initialPublished.id !== lastPublishedId.current) {
      lastPublishedId.current = initialPublished.id;
      setPublished(initialPublished);
    }
  }, [initialPublished]);

  React.useEffect(() => {
    if (!fetcher.data || !("published" in fetcher.data)) return;
    if (fetcher.data.published.id === lastPublishedId.current) return;
    lastPublishedId.current = fetcher.data.published.id;
    setPublished(fetcher.data.published);
    setContent("");
    revalidator.revalidate();
  }, [fetcher.data, revalidator]);

  const errorMessage = fetcher.data && "error" in fetcher.data ? fetcher.data.error : undefined;
  const isSubmitting = fetcher.state !== "idle";
  const characterCount = content.length;
  const recentPosts = posts.slice(0, 8);

  return (
    <div className="tool-page posts-compose-page">
      <div className="posts-compose-layout">
        <aside className="posts-history-panel" aria-label="Post history">
          <div className="posts-history-panel-header">
            <div>
              <div className="posts-panel-eyebrow">History</div>
              <h2 className="posts-panel-title">Your posts</h2>
            </div>
            <Link to="/posts/list" className="posts-link posts-history-link">
              View all
              <span className="posts-count">{posts.length}</span>
            </Link>
          </div>

          {posts.length === 0 ? (
            <div className="posts-history-empty">
              <div className="posts-history-empty-title">No posts yet</div>
              <p className="posts-history-empty-desc">
                Publish from the editor and your recent history will appear here.
              </p>
            </div>
          ) : (
            <div className="posts-history-list">
              {recentPosts.map((post) => {
                const title = extractTitle(post.content_md);
                return (
                  <Link key={post.id} to={`/posts/${post.id}`} className="posts-history-item">
                    <div className="posts-history-item-title">{title || "Untitled post"}</div>
                    <div className="posts-history-item-excerpt">
                      {previewText(post.content_md)}
                    </div>
                    <div className="post-meta">{formatDate(post.updated_at)}</div>
                  </Link>
                );
              })}
            </div>
          )}
        </aside>

        <section className="posts-compose-main">
          <div className="posts-compose-main-header">
            <p className="tool-desc posts-compose-desc">
              Write a post in Markdown and publish it instantly.
            </p>
          </div>

          {published ? (
            <div className="published-banner posts-published-banner">
              <div className="published-banner-header">
                <span className="published-banner-label">Published</span>
              </div>
              <div className="published-banner-url">{published.url}</div>
              <div className="published-banner-actions">
                <a
                  href={published.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-sm"
                >
                  Open
                </a>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => navigator.clipboard.writeText(published.url)}
                >
                  Copy URL
                </Button>
              </div>
            </div>
          ) : null}

          <fetcher.Form method="post" className="posts-compose-form">
            <AutosizeTextarea
              name="content"
              className="posts-compose-textarea"
              placeholder="Write your post in Markdown..."
              value={content}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                setContent(event.currentTarget.value)
              }
              maxLength={MAX_POST_LENGTH}
            />

            <div className="posts-compose-footer">
              <div className="posts-compose-status">
                <div className="textarea-meta posts-compose-meta">
                  <span>Markdown supported</span>
                  <span className="textarea-count">
                    {characterCount.toLocaleString()} / {MAX_POST_LENGTH.toLocaleString()}
                  </span>
                </div>
                {errorMessage ? <div className="form-error">{errorMessage}</div> : null}
              </div>
              <div className="posts-compose-actions">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Publishing..." : "Publish"}
                </Button>
              </div>
            </div>
          </fetcher.Form>
        </section>
      </div>
    </div>
  );
}
