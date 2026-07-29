import { ToolNavRail, IconNew, IconProgress, type NavUser } from "~/components/ToolNavRail";

/**
 * Articles are managed on Writing surfaces, not in the global rail. This keeps the
 * navigation stable while the product's cross-tool session model is still undefined.
 */
export function WritingNavRail({ user }: { user: NavUser }) {
  return (
    <ToolNavRail
      toolName="Writing"
      pinnedActions={[
        { icon: <IconNew />, label: "New piece", to: "/writing" },
        { icon: <IconProgress />, label: "Writing progress", to: "/writing/progress" },
      ]}
      settingsTo="/writing/settings"
      user={user}
    />
  );
}
