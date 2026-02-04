import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { getPostById } from "@bcailab/db";
import { getOptionalUser } from "~/utils/auth.server";

const formatDate = (value: string) => new Date(value).toLocaleString();

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

  return (
    <div style={{ padding: "40px 0 80px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1>Published Text</h1>
          <div className="post-meta">Updated {formatDate(post.updated_at)}</div>
        </div>
        {canEdit ? (
          <a className="btn btn-ghost btn-sm" href={`/text/${post.id}/edit`}>
            Edit
          </a>
        ) : null}
      </div>
      <article className="markdown" dangerouslySetInnerHTML={{ __html: post.content_html }} />
    </div>
  );
}
