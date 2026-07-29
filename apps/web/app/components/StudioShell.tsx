import * as React from "react";
import { ToolNavRail, type NavUser } from "~/components/ToolNavRail";

/**
 * Shell for the studio-level pages (Home, Progress) that are not a tool.
 *
 * The rail is universal by design (`docs/english-studio-ia-v2-design.md` §3.2): because it
 * always lists every module, the Home's body carries no "explore" section of its own. These
 * pages have nothing to create, so the rail shows no pinned actions.
 */
export function StudioShell({
  user,
  canvasClassName = "studio-canvas",
  children
}: {
  user: NavUser | null;
  canvasClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="writing-shell">
      <ToolNavRail
        toolName="English Studio"
        pinnedActions={[]}
        user={user}
      />
      <div className="writing-main">
        <div className={canvasClassName}>{children}</div>
      </div>
    </div>
  );
}
