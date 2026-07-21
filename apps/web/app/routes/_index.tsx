import { Link, useOutletContext, useSearchParams } from "@remix-run/react";
import type { User } from "@bcailab/db";
import { openLoginPopup } from "~/utils/login-popup";

interface Product {
  href: string;
  kicker: string;
  title: string;
  description: string;
  modules: string[];
  requiresAuth?: boolean;
}

const products: Product[] = [
  {
    href: "/english",
    kicker: "Flagship product",
    title: "English Studio",
    description:
      "One workspace for deliberate English practice. Take dictation sentence by sentence, recite passages with AI evaluation, revise essays with a writing coach, generate speech audio for shadowing, and translate with an LLM — all under one account with shared progress.",
    modules: [
      "Dictation",
      "Reading & Recitation",
      "Writing Coach",
      "Translate",
      "Speech",
      "Dictionary (soon)"
    ]
  },
  {
    href: "/posts",
    kicker: "Utility",
    title: "Posts",
    description:
      "A quiet publishing tool. Write in Markdown, publish in one step, and share a clean public URL without formatting overhead.",
    modules: ["Markdown", "Publish"],
    requiresAuth: true
  }
];

const principles = [
  {
    title: "One clear tool for one clear job",
    body: "Each product solves a concrete problem with a calm interface, instead of growing into a control panel of loosely related features."
  },
  {
    title: "AI in the loop, not in the way",
    body: "Models do the evaluating, coaching, and translating behind the scenes; the surface stays simple enough to use every day."
  },
  {
    title: "Shared foundations",
    body: "One account, one design language, one infrastructure. Products stay small because the platform underneath does the heavy lifting."
  }
];

export default function Index() {
  const { user } = useOutletContext<{ user: User | null }>();
  const [params] = useSearchParams();
  const loginHint = params.get("login");

  const handleProductClick = (event: React.MouseEvent, product: Product) => {
    if (product.requiresAuth && !user) {
      event.preventDefault();
      openLoginPopup();
    }
  };

  return (
    <div className="home">
      <section className="home-hero">
        <div className="home-eyebrow">
          <span className="home-eyebrow-line" />
          An independent AI product lab
        </div>
        <h1 className="home-title">
          Where AI meets
          <br />
          <em>everyday life.</em>
        </h1>
        <p className="home-desc">
          bcailab is a small studio that designs and ships focused AI products —
          tools that bring language models into real workflows like reading,
          writing, speaking, and publishing.
        </p>
        {loginHint ? (
          <div className="home-login-hint">
            Please sign in to access the tools.
          </div>
        ) : null}
      </section>

      <section className="home-products">
        <div className="home-tools-header">
          <span className="home-tools-label">Products</span>
          <span className="home-tools-count">{products.length}</span>
        </div>
        <div className="home-product-list">
          {products.map((product) => (
            <Link
              key={product.href}
              to={product.href}
              className="home-product"
              onClick={(e) => handleProductClick(e, product)}
            >
              <div className="home-product-kicker">{product.kicker}</div>
              <div className="home-product-head">
                <h2 className="home-product-title">{product.title}</h2>
                <span className="home-tool-arrow">&rarr;</span>
              </div>
              <p className="home-product-desc">{product.description}</p>
              <div className="home-tool-tags">
                {product.modules.map((mod) => (
                  <span key={mod} className="home-tool-tag">
                    {mod}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-principles">
        <div className="home-tools-header">
          <span className="home-tools-label">How we build</span>
        </div>
        <div className="home-principle-grid">
          {principles.map((principle, index) => (
            <div key={principle.title} className="home-principle">
              <div className="home-principle-index">{String(index + 1).padStart(2, "0")}</div>
              <h3 className="home-principle-title">{principle.title}</h3>
              <p className="home-principle-body">{principle.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="home-lab">
        <div className="home-tools-header">
          <span className="home-tools-label">The lab</span>
        </div>
        <div className="home-lab-body">
          <p>
            bcailab is built and run by <strong>Zhongxing Sun</strong> from Burnaby,
            British Columbia, Canada. The lab stays small on purpose so the shipped
            tools can stay sharp — growth is deliberate, one useful product at a time.
          </p>
          <div className="home-lab-links">
            <Link to="/about" className="home-lab-link">
              About the lab &rarr;
            </Link>
            <a
              href="https://x.com/Zhongxing_Sun"
              target="_blank"
              rel="noopener noreferrer"
              className="home-lab-link"
            >
              Follow on X &rarr;
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
