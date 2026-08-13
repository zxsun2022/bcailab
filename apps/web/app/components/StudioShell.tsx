import * as React from "react";
import { ToolNavRail, type NavUser } from "~/components/ToolNavRail";

/**
 * Persistent app shell for every English Studio destination.
 *
 * The default rail is universal (`docs/english-studio-ia-v2-design.md` §3.2); a tool may
 * inject its settings-aware wrapper without changing the rail/main/canvas hierarchy.
 * Page actions and tool history belong to the main workspace, never the product rail.
 */
export function StudioShell({
  user,
  navigation,
  mainClassName,
  canvasClassName,
  children
}: {
  user?: NavUser | null;
  navigation?: React.ReactNode;
  mainClassName?: string;
  canvasClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="writing-shell studio-app-shell">
      {navigation ?? <ToolNavRail user={user ?? null} />}
      <main className={`studio-main${mainClassName ? ` ${mainClassName}` : ""}`}>
        <div className={`studio-canvas-host${canvasClassName ? ` ${canvasClassName}` : ""}`}>
          {children}
        </div>
      </main>
    </div>
  );
}
