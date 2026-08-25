/**
 * Connection states the library reports, kept in their own module so the pure row model can
 * import them without pulling in a React component.
 */

/** Local IndexedDB availability. `unavailable` must degrade the library, never the editor. */
export type DocumentLibraryState = "loading" | "ready" | "unavailable";

/** Account availability. `unknown` claims about the online copy come from anything but `ready`. */
export type CloudLibraryState = "loading" | "signed-out" | "ready" | "unavailable";
