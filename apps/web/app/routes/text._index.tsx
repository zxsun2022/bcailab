import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData, Link, useRevalidator } from "@remix-run/react";
import { Button, Card } from "@bcailab/ui";
import { createPost, getPostById, listPostsByUser, softDeletePost } from "@bcailab/db";
import { AutosizeTextarea } from "~/components/AutosizeTextarea";
import { renderMarkdown } from "~/utils/markdown.server";
import { requireUser } from "~/utils/auth.server";
import { MAX_TEXT_LENGTH } from "~/utils/text";
import * as React from "react";

type PublishedInfo = {
  id: string;
  url: string;
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
          url: `${url.origin}/text/${publishedPost.id}`
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
    return redirect("/text");
  }

  const content = String(formData.get("content") ?? "").trim();
  if (!content) {
    return json({ error: "Content cannot be empty." }, { status: 400 });
  }
  if (content.length > MAX_TEXT_LENGTH) {
    return json(
      { error: `Content exceeds ${MAX_TEXT_LENGTH.toLocaleString()} characters.` },
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
  const published = { id: post.id, url: `${url.origin}/text/${post.id}` };

  if (acceptsHtml) {
    return redirect(`/text?published=${post.id}`);
  }

  return json({ published });
};

export default function TextTool() {
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
    if (!fetcher.data?.published) return;
    if (fetcher.data.published.id === lastPublishedId.current) return;
    lastPublishedId.current = fetcher.data.published.id;
    setPublished(fetcher.data.published);
    setContent("");
    revalidator.revalidate();
  }, [fetcher.data, revalidator]);

  const errorMessage = fetcher.data?.error;
  const isSubmitting = fetcher.state !== "idle";
  const characterCount = content.length;

  return (
    <div className="tool-page">
      <p className="tool-desc">
        Write a note in Markdown and publish it instantly.
      </p>

      <Card style={{ marginTop: "24px" }}>
        <fetcher.Form method="post">
          <AutosizeTextarea
            name="content"
            placeholder="Write your text in Markdown..."
            value={content}
            onChange={(event) => setContent(event.currentTarget.value)}
            maxLength={MAX_TEXT_LENGTH}
          />
          <div className="textarea-meta">
            <span>Markdown supported</span>
            <span className="textarea-count">
              {characterCount.toLocaleString()} / {MAX_TEXT_LENGTH.toLocaleString()}
            </span>
          </div>
          {errorMessage ? (
            <div style={{ color: "var(--accent)", marginTop: "12px" }}>{errorMessage}</div>
          ) : null}
          <div style={{ marginTop: "16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Publishing..." : "Publish"}
            </Button>
            <Link to="/text/posts" className="posts-link">
              Your posts
              <span className="posts-count">{posts.length}</span>
            </Link>
          </div>
        </fetcher.Form>
      </Card>

      {published ? (
        <div className="banner" style={{ marginTop: "24px" }}>
          <div>
            Published! URL: <strong>{published.url}</strong>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigator.clipboard.writeText(published.url)}
          >
            Copy URL
          </Button>
        </div>
      ) : null}
    </div>
  );
}
