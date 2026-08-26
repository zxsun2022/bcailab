import { getNode, type MindMapDocument } from "../model/types";
import type { DocumentIndexEntry } from "./store";

/**
 * What a map is called, wherever a person is shown one.
 *
 * **The root label is the identity.** D-18 settled this on 2026-08-04 for download filenames,
 * after the deployed editor saved files as `untitled`: the internal `title` is populated by
 * import or by creation and has no editing surface, so it stays `Untitled` while the visible map
 * says something real. The library and the published page shipped later and kept reading
 * `title`, which is why every row read `Untitled` again — the same defect, a different surface.
 *
 * **The two values stay separate.** `spec/storage-export.md` §10.3 is explicit: *"The root node
 * text is not automatically forced to equal the filename/title."* So `title` is not renamed or
 * merged away; it keeps its real job as provenance — the imported filename, or a front-matter
 * title — and simply stops being what a person is shown.
 *
 * The fallback chain matters as much as the first choice. A root can legitimately be empty
 * (a new map before anything is typed), and a list of blank rows would be worse than a list of
 * `Untitled` ones, so the chain ends at a neutral, translatable placeholder that is the same
 * string in every surface.
 */
export const UNNAMED_MAP = "Untitled map";

/** Collapses whitespace so a label spanning wrapped lines reads as one name in a list. */
function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function displayNameFromParts(
  rootLabel: string | undefined,
  title: string | undefined
): string {
  return normalizeLabel(rootLabel ?? "") || normalizeLabel(title ?? "") || UNNAMED_MAP;
}

/** The name for a document held in memory — the editor's own, or one just loaded. */
export function documentDisplayName(document: MindMapDocument): string {
  return displayNameFromParts(getNode(document, document.rootId).text, document.title);
}

/**
 * The name for a stored document, without loading its snapshot.
 *
 * `rootLabel` is cached on the index entry beside `nodeCount` for exactly this reason: the
 * library renders every row on the index alone, and reading a snapshot per row would make
 * opening the library O(documents) in storage reads. An entry written before this field existed
 * has no `rootLabel` and falls through to `title`, which is the behaviour it had anyway.
 */
export function entryDisplayName(entry: DocumentIndexEntry): string {
  return displayNameFromParts(entry.rootLabel, entry.title);
}

/** The root label as stored on an index entry: normalized, and empty when the root is blank. */
export function rootLabelOf(document: MindMapDocument): string {
  return normalizeLabel(getNode(document, document.rootId).text);
}
