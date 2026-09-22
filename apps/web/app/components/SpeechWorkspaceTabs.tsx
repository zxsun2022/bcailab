import { NavLink } from "@remix-run/react";
import { useT } from "~/i18n/context";

/**
 * Speech-local navigation belongs to the workspace, not the global product rail.
 */
export function SpeechWorkspaceTabs() {
  const t = useT();
  return (
    <nav className="workspace-tabs" aria-label={t("speech.tabsLabel")}>
      <NavLink
        to="/speech"
        end
        className={({ isActive }) => `workspace-tab${isActive ? " is-active" : ""}`}
      >
        {t("speech.tab.generate")}
      </NavLink>
      <NavLink
        to="/speech/history"
        className={({ isActive }) => `workspace-tab${isActive ? " is-active" : ""}`}
      >
        {t("speech.tab.history")}
      </NavLink>
    </nav>
  );
}
