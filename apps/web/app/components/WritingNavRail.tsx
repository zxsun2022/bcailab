import { ToolNavRail, type NavUser } from "~/components/ToolNavRail";

/**
 * Articles and writing progress are managed on Writing surfaces, not in the global rail.
 */
export function WritingNavRail({ user }: { user: NavUser }) {
  return (
    <ToolNavRail
      settingsTo="/writing/settings"
      user={user}
    />
  );
}
