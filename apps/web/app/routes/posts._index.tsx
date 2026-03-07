import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData, Link, useNavigate } from "@remix-run/react";
import { Button } from "@bcailab/ui";
import { createPost, getPostById, listPostsByUser, softDeletePost, updatePost } from "@bcailab/db";
import { AutosizeTextarea } from "~/components/AutosizeTextarea";
import { renderMarkdown } from "~/utils/markdown.server";
import { requireUser } from "~/utils/auth.server";
import { MAX_POST_LENGTH, extractTitle, normalizePostContent, stripMarkdown } from "~/utils/posts";
import * as React from "react";

type ComposerNotice = {
  id: string;
  status: string;
};

const previewText = (md: string, maxLen = 84): string => {
  const plain = stripMarkdown(md);
  return plain.length > maxLen ? `${plain.slice(0, maxLen)}...` : plain;
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const posts = await listPostsByUser(context.env.DB, user.id);
  const url = new URL(request.url);
  const publishedId = url.searchParams.get("published");
  const savedId = url.searchParams.get("saved");
  const noticeId = savedId ?? publishedId;
  const noticeStatus = savedId ? "saved" : publishedId ? "published" : null;
  const noticePost = noticeId
    ? await getPostById(context.env.DB, noticeId, { includeDeleted: true })
    : null;
  const notice =
    noticeStatus && noticePost && noticePost.user_id === user.id && !noticePost.deleted_at
      ? {
          id: noticePost.id,
          status: noticeStatus
        }
      : null;
  const editingId = url.searchParams.get("editing");
  const editingPost = editingId
    ? await getPostById(context.env.DB, editingId, { includeDeleted: true })
    : null;
  const editing =
    editingPost && editingPost.user_id === user.id && !editingPost.deleted_at
      ? {
          id: editingPost.id,
          contentMd: editingPost.content_md,
          url: `${url.origin}/posts/${editingPost.id}`
        }
      : null;

  return json({
    posts,
    notice,
    editing
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
    if (acceptsHtml) {
      return redirect("/posts");
    }
    return json({ deletedId: id });
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

  const id = String(formData.get("id") ?? "").trim();
  const contentHtml = await renderMarkdown(content);

  if (id) {
    const existing = await getPostById(context.env.DB, id, { includeDeleted: true });
    if (!existing || existing.user_id !== user.id || existing.deleted_at) {
      return json({ error: "Not authorized." }, { status: 403 });
    }

    await updatePost(context.env.DB, {
      id,
      userId: user.id,
      contentMd: content,
      contentHtml
    });

    const redirectTo = `/posts?editing=${id}&saved=${id}`;

    if (acceptsHtml) {
      return redirect(redirectTo);
    }

    return json({ redirectTo });
  }

  const post = await createPost(context.env.DB, {
    userId: user.id,
    contentMd: content,
    contentHtml
  });
  const redirectTo = `/posts?editing=${post.id}&published=${post.id}`;

  if (acceptsHtml) {
    return redirect(redirectTo);
  }

  return json({ redirectTo });
};

export default function PostsTool() {
  const { posts, notice, editing } = useLoaderData<typeof loader>();
  const saveFetcher = useFetcher<typeof action>();
  const deleteFetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const [content, setContent] = React.useState(editing?.contentMd ?? "");
  const [copyState, setCopyState] = React.useState<"idle" | "copied" | "failed">("idle");
  const copyTimeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    setContent(editing?.contentMd ?? "");
    setCopyState("idle");
  }, [editing?.id, editing?.contentMd]);

  React.useEffect(() => {
    if (!saveFetcher.data || !("redirectTo" in saveFetcher.data)) return;
    navigate(saveFetcher.data.redirectTo, { replace: true });
  }, [saveFetcher.data, navigate]);

  React.useEffect(() => {
    if (!deleteFetcher.data || !("deletedId" in deleteFetcher.data)) return;
    navigate("/posts", { replace: true });
  }, [deleteFetcher.data, navigate]);

  React.useEffect(() => {
    return () => {
      if (copyTimeoutRef.current != null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const errorMessage = saveFetcher.data && "error" in saveFetcher.data ? saveFetcher.data.error : undefined;
  const deleteError =
    deleteFetcher.data && "error" in deleteFetcher.data ? deleteFetcher.data.error : undefined;
  const isSubmitting = saveFetcher.state !== "idle";
  const isDeleting = deleteFetcher.state !== "idle";
  const characterCount = content.length;
  const activePostId = editing?.id ?? null;
  const activePostUrl = editing?.url ?? null;
  const isEditing = Boolean(activePostId);
  const statusLabel =
    notice && notice.id === activePostId
      ? notice.status === "saved"
        ? "Saved"
        : "Published"
      : isEditing
        ? "Editing"
        : "New post";
  const submitLabel = isSubmitting
    ? isEditing
      ? "Saving..."
      : "Publishing..."
    : isEditing
      ? "Save changes"
      : "Publish";

  const handleCopyUrl = () => {
    if (!activePostUrl) return;
    navigator.clipboard.writeText(activePostUrl).then(
      () => {
        if (copyTimeoutRef.current != null) {
          window.clearTimeout(copyTimeoutRef.current);
        }
        setCopyState("copied");
        copyTimeoutRef.current = window.setTimeout(() => {
          setCopyState("idle");
          copyTimeoutRef.current = null;
        }, 1500);
      },
      () => {
        if (copyTimeoutRef.current != null) {
          window.clearTimeout(copyTimeoutRef.current);
          copyTimeoutRef.current = null;
        }
        setCopyState("failed");
      }
    );
  };

  const handleDelete = () => {
    if (!activePostId) return;
    if (!confirm("Delete this post? This cannot be undone.")) return;
    deleteFetcher.submit({ _intent: "delete", id: activePostId }, { method: "post" });
  };

  return (
    <div className="tool-page posts-compose-page">
      <div className="posts-compose-layout">
        <aside className="posts-history-panel" aria-label="Post history">
          <div className="posts-history-panel-header">
            <div className="posts-panel-eyebrow">History</div>
            <Link to="/posts" className="btn btn-primary btn-sm posts-history-new">
              New post
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
              {posts.map((post) => {
                const title = extractTitle(post.content_md);
                return (
                  <Link
                    key={post.id}
                    to={`/posts?editing=${post.id}`}
                    className={`posts-history-item ${activePostId === post.id ? "is-active" : ""}`}
                    aria-current={activePostId === post.id ? "page" : undefined}
                  >
                    <div className="posts-history-item-title">{title || "Untitled post"}</div>
                    <div className="posts-history-item-excerpt">{previewText(post.content_md)}</div>
                  </Link>
                );
              })}
            </div>
          )}
        </aside>

        <section className="posts-compose-main">
          <div className="posts-editor-toolbar">
            <div className="posts-editor-status">{statusLabel}</div>
            <div
              className={`posts-editor-toolbar-actions ${isEditing ? "" : "is-empty"}`.trim()}
              aria-hidden={isEditing ? undefined : true}
            >
              {isEditing ? (
                <>
                  <a
                    href={activePostUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm"
                  >
                    Open
                  </a>
                  <Button type="button" variant="ghost" size="sm" onClick={handleCopyUrl}>
                    {copyState === "copied"
                      ? "Copied!"
                      : copyState === "failed"
                        ? "Copy failed"
                        : "Copy link"}
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={isDeleting}
                    onClick={handleDelete}
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          {deleteError ? <div className="form-error">{deleteError}</div> : null}

          <saveFetcher.Form method="post" className="posts-compose-form">
            {activePostId ? <input type="hidden" name="id" value={activePostId} /> : null}
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
                <Button type="submit" disabled={isSubmitting || isDeleting}>
                  {submitLabel}
                </Button>
              </div>
            </div>
          </saveFetcher.Form>
        </section>
      </div>
    </div>
  );
}
