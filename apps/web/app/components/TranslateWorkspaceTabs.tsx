import { Link } from "@remix-run/react";

export function TranslateWorkspaceTabs({ active }: { active: "translate" | "saved" }) {
  return (
    <nav className="workspace-tabs translate-tabs" aria-label="Translate workspace">
      {active === "translate" ? (
        <span className="workspace-tab is-active" aria-current="page">Translate</span>
      ) : (
        <Link to="/translate" className="workspace-tab">Translate</Link>
      )}
      {active === "saved" ? (
        <span className="workspace-tab is-active" aria-current="page">Saved</span>
      ) : (
        <Link to="/translate/saved" className="workspace-tab">Saved</Link>
      )}
    </nav>
  );
}
