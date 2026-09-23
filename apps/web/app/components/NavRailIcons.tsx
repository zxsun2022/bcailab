import type { EnglishModuleId } from "~/english-modules";

/**
 * Line icons for the studio rail: one per destination, shown beside the label and alone when
 * the rail is collapsed.
 *
 * One family only — 24-unit grid, 1.5 stroke, round caps, no fills — drawn in `currentColor`
 * so an icon takes the muted, hover and current colours of its row. Written inline in the style
 * of Lucide rather than pulled in as a dependency; the rail needs eight.
 */
export type NavRailIconName = "home" | "progress" | EnglishModuleId;

const PATHS: Record<NavRailIconName, string[]> = {
  home: ["M3 10.5 12 3l9 7.5", "M5 9v12h14V9", "M10 21v-6h4v6"],
  progress: ["M3 3v18h18", "m7 15 4-4 3 3 5-6"],
  // Headphones: listening, then typing what was heard.
  dictation: [
    "M3 18v-6a9 9 0 0 1 18 0v6",
    "M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z",
    "M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"
  ],
  // Microphone: Reading is read-aloud practice.
  reading: [
    "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z",
    "M19 10v2a7 7 0 0 1-14 0v-2",
    "M12 19v3"
  ],
  writing: ["M12 20h9", "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"],
  translate: ["m5 8 6 6", "m4 14 6-6 2-3", "M2 5h12", "M7 2h1", "m22 22-5-10-5 10", "M14 18h6"],
  speech: ["M11 5 6 9H2v6h4l5 4z", "M15.5 8.5a5 5 0 0 1 0 7", "M19 5a10 10 0 0 1 0 14"],
  dictionary: [
    "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z",
    "M6.5 17A2.5 2.5 0 0 0 4 19.5 2.5 2.5 0 0 0 6.5 22H20v-5"
  ]
};

export function NavRailIcon({ name }: { name: NavRailIconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="nav-rail-icon"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
