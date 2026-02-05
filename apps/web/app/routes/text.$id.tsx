import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, Link } from "@remix-run/react";
import { getPostById } from "@bcailab/db";
import { getOptionalUser } from "~/utils/auth.server";
import * as React from "react";

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });

export const loader = async ({ request, context, params }: LoaderFunctionArgs) => {
  const id = params.id;
  if (!id) {
    throw new Response("Not found", { status: 404 });
  }
  const post = await getPostById(context.env.DB, id);
  if (!post) {
    throw new Response("Not found", { status: 404 });
  }
  const user = await getOptionalUser(request, context);

  return json({
    post,
    canEdit: user?.id === post.user_id
  });
};

export default function TextPost() {
  const { post, canEdit } = useLoaderData<typeof loader>();
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="tool-page">
      <div className="post-view-header">
        <div className="post-meta">{formatDate(post.updated_at)}</div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleCopy}>
            {copied ? "Copied!" : "Copy link"}
          </button>
          {canEdit && (
            <Link to={`/text/${post.id}/edit`} className="btn btn-ghost btn-sm">
              Edit
            </Link>
          )}
        </div>
      </div>
      <article className="markdown" dangerouslySetInnerHTML={{ __html: post.content_html }} />
    </div>
  );
}
