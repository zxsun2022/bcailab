import { NavLink } from "@remix-run/react";

/**
 * Speech-local navigation belongs to the workspace, not the global product rail.
 */
export function SpeechWorkspaceTabs() {
  return (
    <nav className="workspace-tabs" aria-label="Speech workspace">
      <NavLink
        to="/speech"
        end
        className={({ isActive }) => `workspace-tab${isActive ? " is-active" : ""}`}
      >
        Generate
      </NavLink>
      <NavLink
        to="/speech/history"
        className={({ isActive }) => `workspace-tab${isActive ? " is-active" : ""}`}
      >
        History
      </NavLink>
    </nav>
  );
}
