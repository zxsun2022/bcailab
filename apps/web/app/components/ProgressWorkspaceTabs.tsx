import { NavLink } from "@remix-run/react";

/**
 * One product-level Progress entry, with tool-native detail views inside the workspace.
 */
export function ProgressWorkspaceTabs() {
  return (
    <nav className="workspace-tabs" aria-label="Progress views">
      <NavLink
        to="/english/progress"
        end
        className={({ isActive }) => `workspace-tab${isActive ? " is-active" : ""}`}
      >
        Overview
      </NavLink>
      <NavLink
        to="/reading/progress"
        className={({ isActive }) => `workspace-tab${isActive ? " is-active" : ""}`}
      >
        Reading
      </NavLink>
      <NavLink
        to="/writing/progress"
        className={({ isActive }) => `workspace-tab${isActive ? " is-active" : ""}`}
      >
        Writing
      </NavLink>
    </nav>
  );
}
