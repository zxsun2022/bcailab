import { ToolNavRail, type NavUser } from "~/components/ToolNavRail";

/**
 * Reading's rail is navigation only.
 *
 * It used to list the learner's passages *and* the library, duplicating the catalogue that
 * `/reading` already renders — and duplicating its queries, since the layout and the index
 * each fetched both sets. A 260px chronological column also cannot do what choosing from
 * graded material needs (band, topic, what I have done, how I did), and gets worse with
 * every passage added. The catalogue is that surface, including its own creation action.
 * Design: `docs/english-studio-ia-v2-design.md` §3.7.
 */
export function ReadingNavRail({ user }: { user: NavUser }) {
  return (
    <ToolNavRail
      settingsTo="/reading/settings"
      user={user}
    />
  );
}
