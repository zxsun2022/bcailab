import { ToolNavRail, type NavUser } from "~/components/ToolNavRail";

/**
 * Attempt history belongs to the catalogue/progress surfaces until English Studio has a
 * consistent cross-tool definition of a resumable session.
 */
export function DictationNavRail({ user }: { user: NavUser | null }) {
  return (
    <ToolNavRail
      toolName="Dictation"
      pinnedActions={[]}
      user={user}
    />
  );
}
