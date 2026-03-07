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

  // Extract headings and assign stable index-based IDs (works for any language)
  React.useEffect(() => {
    const article = articleRef.current;
    if (!article) return;

    const headings = article.querySelectorAll("h1, h2, h3");
    const items: TocItem[] = [];

    headings.forEach((heading, index) => {
      const text = heading.textContent?.trim() ?? "";
      if (!text) return;
      const id = `heading-${index}`;
      heading.id = id;
      items.push({
        id,
        text,
        level: Number(heading.tagName[1])
      });
    });

    setToc(items);
  }, [post.content_html]);

  // Scroll tracking: IntersectionObserver + bottom-of-page detection
  React.useEffect(() => {
    if (toc.length === 0) return;

    const headingElements = toc
      .map((item) => document.getElementById(item.id))
      .filter(Boolean) as HTMLElement[];

    if (headingElements.length === 0) return;

    // Track which headings have been scrolled past
    const visibleSet = new Set<string>();
    let lastEnteredId: string | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleSet.add(entry.target.id);
            lastEnteredId = entry.target.id;
          } else {
            visibleSet.delete(entry.target.id);
          }
        }

        // If any heading is in the observation zone, use the last one that entered
        if (lastEnteredId && visibleSet.has(lastEnteredId)) {
          setActiveId(lastEnteredId);
          return;
        }

        // Fallback: find the last heading that's above the viewport center
        const viewportMiddle = window.innerHeight * 0.3;
        let bestId: string | null = null;
        for (const el of headingElements) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= viewportMiddle) {
            bestId = el.id;
          }
        }
        if (bestId) {
          setActiveId(bestId);
        }
      },
      { rootMargin: "0px 0px -65% 0px", threshold: 0 }
    );

    headingElements.forEach((el) => observer.observe(el));

    // Bottom-of-page detection: highlight last heading when scrolled near bottom
    const handleScroll = () => {
      const nearBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 60;
      if (nearBottom && toc.length > 0) {
        setActiveId(toc[toc.length - 1].id);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", handleScroll);
    };
  }, [toc]);

  const hasToc = toc.length > 1;

  const handleTocClick = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    // Update URL hash without triggering a jump
    window.history.replaceState(null, "", `#${id}`);
    setActiveId(id);
  };

  return (
    <div className={`tool-page post-view-page ${hasToc ? "has-toc" : ""}`}>
      <div className="post-view-header">
        <div className="post-view-meta">
          <span className="post-meta">Created {formatDate(post.created_at)}</span>
          <span className="post-meta">Last edited {formatDate(post.updated_at)}</span>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleCopy}>
            {copied ? "Copied!" : "Copy link"}
          </button>
          {canEdit && (
            <Link to={`/posts?editing=${post.id}`} className="btn btn-ghost btn-sm">
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
                  <a
                    href={`#${item.id}`}
                    className="post-toc-link"
                    onClick={(e) => handleTocClick(e, item.id)}
                  >
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
