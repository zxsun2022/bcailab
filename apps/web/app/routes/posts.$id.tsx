import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, Link } from "@remix-run/react";
import { getPostById } from "@bcailab/db";
import { getOptionalUser } from "~/utils/auth.server";
import * as React from "react";

type TocItem = {
  id: string;
  text: string;
  level: number;
};

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();

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

export default function PostPage() {
  const { post, canEdit } = useLoaderData<typeof loader>();
  const [copied, setCopied] = React.useState(false);
  const [toc, setToc] = React.useState<TocItem[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const articleRef = React.useRef<HTMLElement | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  React.useEffect(() => {
    const article = articleRef.current;
    if (!article) return;

    const headings = article.querySelectorAll("h1, h2, h3");
    const items: TocItem[] = [];
    const usedIds = new Set<string>();

    headings.forEach((heading) => {
      const text = heading.textContent?.trim() ?? "";
      if (!text) return;
      let id = heading.id || slugify(text);
      while (usedIds.has(id)) {
        id = `${id}-1`;
      }
      usedIds.add(id);
      if (!heading.id) {
        heading.id = id;
      }
      items.push({
        id,
        text,
        level: Number(heading.tagName[1])
      });
    });

    setToc(items);
  }, [post.content_html]);

  React.useEffect(() => {
    const article = articleRef.current;
    if (!article || toc.length === 0) return;

    const headingElements = toc
      .map((item) => document.getElementById(item.id))
      .filter(Boolean) as HTMLElement[];

    if (headingElements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: "-10% 0px -75% 0px", threshold: 0 }
    );

    headingElements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [toc]);

  const hasToc = toc.length > 1;

  return (
    <div className={`tool-page post-view-page ${hasToc ? "has-toc" : ""}`}>
      <div className="post-view-header">
        <div className="post-meta">{formatDate(post.updated_at)}</div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleCopy}>
            {copied ? "Copied!" : "Copy link"}
          </button>
          {canEdit && (
            <Link to={`/posts/${post.id}/edit`} className="btn btn-ghost btn-sm">
              Edit
            </Link>
          )}
        </div>
      </div>
      <div className="post-view-body">
        <article
          className="markdown"
          ref={articleRef}
          dangerouslySetInnerHTML={{ __html: post.content_html }}
        />
        {hasToc ? (
          <nav className="post-toc" aria-label="Table of contents">
            <div className="post-toc-title">Contents</div>
            <ul className="post-toc-list">
              {toc.map((item) => (
                <li
                  key={item.id}
                  className={`post-toc-item post-toc-h${item.level} ${activeId === item.id ? "is-active" : ""}`}
                >
                  <a href={`#${item.id}`} className="post-toc-link">
                    {item.text}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </div>
    </div>
  );
}
