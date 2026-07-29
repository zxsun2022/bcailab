import { ToolNavRail, type NavUser } from "~/components/ToolNavRail";

/**
 * Speech has no product-level session model yet. Generated audio remains available
 * through its dedicated history page, but is deliberately not treated as sidebar history.
 */
export function SpeechNavRail({ user }: { user: NavUser }) {
  return (
    <ToolNavRail
      settingsTo="/speech/settings"
      user={user}
    />
  );
}
