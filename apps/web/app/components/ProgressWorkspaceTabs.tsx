import { NavLink } from "@remix-run/react";
import { useT } from "~/i18n/context";

/**
 * One product-level Progress entry, with tool-native detail views inside the workspace.
 */
export function ProgressWorkspaceTabs() {
  const t = useT();
  return (
    <nav className="workspace-tabs" aria-label={t("progressTabs.label")}>
      <NavLink
        to="/english/progress"
        end
        className={({ isActive }) => `workspace-tab${isActive ? " is-active" : ""}`}
      >
        {t("progressTabs.overview")}
      </NavLink>
      <NavLink
        to="/reading/progress"
        className={({ isActive }) => `workspace-tab${isActive ? " is-active" : ""}`}
      >
        {t("progressTabs.reading")}
      </NavLink>
      <NavLink
        to="/writing/progress"
        className={({ isActive }) => `workspace-tab${isActive ? " is-active" : ""}`}
      >
        {t("progressTabs.writing")}
      </NavLink>
    </nav>
  );
}
