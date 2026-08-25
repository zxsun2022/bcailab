import type { DocumentIndexEntry } from "../storage/store";
import type { CloudDocumentSummary, CloudPublication } from "../cloud/types";
import type { CloudLibraryState } from "./cloud-state";

/**
 * The library's row model.
 *
 * The dialog this replaces derived a row's state inline, in the middle of JSX, from four
 * different sources — the index entry, the cloud summary, the publication and the cloud
 * connection state. That is why a map could read *Saved online* while holding unsaved content:
 * the condition was assembled differently in the badge and in the button. Here it is computed
 * once, as data, and tested.
 */

/** How this browser's copy relates to the account copy. */
export type SyncState =
  /** Never uploaded. The default, and the only state that exists signed out. */
  | "local-only"
  /** Linked to an online copy that does not carry this browser's current content. */
  | "unsaved"
  /** Linked, and the online copy holds exactly what is stored here. */
  | "synced"
  /** Linked, but the account is unreachable, so no claim about the online copy can be made. */
  | "unknown";

/** How the public, frozen version relates to the current online copy. */
export type PublishState = "none" | "current" | "outdated";

export interface LibraryRow {
  /** Stable across a refresh, so selection and focus survive a list reload. */
  key: string;
  /** `local` rows exist in IndexedDB; `online-only` rows exist only in the account. */
  kind: "local" | "online-only";
  /** Local document id, or the cloud id for an online-only row. */
  id: string;
  cloudDocumentId: string | null;
  title: string;
  nodeCount: number;
  /** Last local edit for local rows; last online save for online-only rows. */
  updatedAt: number;
  sourceFilename: string | null;
  isCurrent: boolean;
  isConflictedCopy: boolean;
  publication: CloudPublication | null;
  sync: SyncState;
  publish: PublishState;
}

export type LibrarySort = "recent" | "title";

function syncStateOf(
  entry: DocumentIndexEntry,
  cloud: CloudDocumentSummary | null,
  cloudState: CloudLibraryState
): SyncState {
  if (!entry.cloudDocumentId || !entry.cloudVersion) return "local-only";
  // The pointer is only advanced after a save the server acknowledged, so a mismatch means this
  // browser holds content the account does not have.
  if (entry.cloudSavedSnapshotId !== entry.lastSnapshotId) return "unsaved";
  if (cloudState !== "ready") return "unknown";
  if (!cloud) return "unsaved";
  return entry.cloudVersion === cloud.version ? "synced" : "unsaved";
}

/**
 * A publication is *outdated* when the account copy moved on after it was frozen, or when this
 * browser holds content neither of them has. Saying only "Published" in either case is the
 * misreport D-29's freeze semantics make easy: the author sees their latest edit on screen and
 * assumes the reader does too.
 */
function publishStateOf(
  publication: CloudPublication | null,
  cloud: CloudDocumentSummary | null,
  sync: SyncState
): PublishState {
  if (!publication) return "none";
  if (sync === "unsaved") return "outdated";
  if (cloud && cloud.updatedAt > publication.updatedAt) return "outdated";
  return "current";
}

export function localRow(
  entry: DocumentIndexEntry,
  cloudDocuments: readonly CloudDocumentSummary[],
  cloudState: CloudLibraryState,
  activeDocumentId: string
): LibraryRow {
  const cloud = entry.cloudDocumentId
    ? cloudDocuments.find((item) => item.id === entry.cloudDocumentId) ?? null
    : null;
  // The account is the authority on its own publication; the index entry is a cached echo of it
  // that stays useful while offline.
  const publication = (cloudState === "ready" && cloud)
    ? cloud.publication
    : entry.cloudPublication ?? null;
  const sync = syncStateOf(entry, cloud, cloudState);
  return {
    key: `local:${entry.id}`,
    kind: "local",
    id: entry.id,
    cloudDocumentId: entry.cloudDocumentId ?? null,
    title: entry.title,
    nodeCount: entry.nodeCount,
    updatedAt: entry.updatedAt,
    sourceFilename: entry.sourceFilename ?? null,
    isCurrent: entry.id === activeDocumentId,
    isConflictedCopy: Boolean(entry.conflictedCopyOf),
    publication,
    sync,
    publish: publishStateOf(publication, cloud, sync)
  };
}

export function onlineOnlyRow(cloud: CloudDocumentSummary): LibraryRow {
  return {
    key: `cloud:${cloud.id}`,
    kind: "online-only",
    id: cloud.id,
    cloudDocumentId: cloud.id,
    title: cloud.title,
    nodeCount: cloud.nodeCount,
    updatedAt: cloud.updatedAt,
    sourceFilename: null,
    isCurrent: false,
    isConflictedCopy: false,
    publication: cloud.publication,
    sync: "synced",
    publish: cloud.publication ? "current" : "none"
  };
}

/**
 * One list, not two. The dialog kept online-only documents in a separate section below the
 * local ones, which meant a map you saved online from another machine sorted below every local
 * scratch file regardless of when you touched it.
 */
export function buildRows(
  entries: readonly DocumentIndexEntry[],
  cloudDocuments: readonly CloudDocumentSummary[],
  cloudState: CloudLibraryState,
  activeDocumentId: string
): LibraryRow[] {
  const rows = entries.map((entry) => localRow(entry, cloudDocuments, cloudState, activeDocumentId));
  if (cloudState !== "ready") return rows;
  const linked = new Set(rows.map((row) => row.cloudDocumentId).filter(Boolean));
  for (const cloud of cloudDocuments) {
    if (!linked.has(cloud.id)) rows.push(onlineOnlyRow(cloud));
  }
  return rows;
}

export function matchesQuery(row: LibraryRow, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return row.title.toLocaleLowerCase().includes(needle);
}

export function sortRows(rows: readonly LibraryRow[], sort: LibrarySort): LibraryRow[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (sort === "title") {
      return a.title.localeCompare(b.title) || b.updatedAt - a.updatedAt || a.key.localeCompare(b.key);
    }
    return b.updatedAt - a.updatedAt || a.title.localeCompare(b.title) || a.key.localeCompare(b.key);
  });
  return sorted;
}

export function visibleRows(
  rows: readonly LibraryRow[],
  query: string,
  sort: LibrarySort
): LibraryRow[] {
  return sortRows(rows.filter((row) => matchesQuery(row, query)), sort);
}

export interface RowStateLabel {
  text: string;
  /** Drives the chip's colour token; kept out of the component so the mapping is testable. */
  tone: "local" | "pending" | "online" | "published" | "stale" | "warning";
}

/**
 * At most one chip beyond *Current*. A row that is published and holds unsaved edits reports the
 * more urgent fact — that the public version is behind — rather than stacking three badges.
 */
export function rowStateLabel(row: LibraryRow): RowStateLabel {
  if (row.kind === "online-only") {
    return row.publication
      ? { text: "Published · online only", tone: "published" }
      : { text: "Online only", tone: "online" };
  }
  if (row.publish === "outdated") return { text: "Published · outdated", tone: "stale" };
  if (row.publish === "current") return { text: "Published", tone: "published" };
  if (row.sync === "local-only") return { text: "Local only", tone: "local" };
  if (row.sync === "unsaved") return { text: "Unsaved changes", tone: "pending" };
  if (row.sync === "unknown") return { text: "Online copy unknown", tone: "warning" };
  return { text: "Saved online", tone: "online" };
}
