import { describe, expect, it } from "vitest";
import type { CloudDocumentSummary, CloudPublication } from "../cloud/types";
import type { DocumentIndexEntry } from "../storage/store";
import { buildRows, localRow, rowStateLabel, visibleRows } from "./rows";

const entry: DocumentIndexEntry = {
  id: "doc-1",
  title: "Plan",
  createdAt: 100,
  updatedAt: 200,
  nodeCount: 1,
  lastSnapshotId: "snapshot-2",
  cloudDocumentId: "cloud-1",
  cloudVersion: 2,
  cloudSavedSnapshotId: "snapshot-2",
  cloudUpdatedAt: 200
};

const cloud: CloudDocumentSummary = {
  id: "cloud-1",
  clientDocumentId: "doc-1",
  title: "Plan",
  nodeCount: 1,
  version: 2,
  createdAt: 100,
  updatedAt: 200,
  publication: null
};

const publication: CloudPublication = {
  publicId: "abc",
  publicUrl: "https://share.bcailab.com/p/abc",
  version: 1,
  updatedAt: 200
};

const localOnly: DocumentIndexEntry = {
  id: "doc-2",
  title: "Notes",
  createdAt: 50,
  updatedAt: 400,
  nodeCount: 4,
  lastSnapshotId: "snapshot-9"
};

describe("sync state", () => {
  it("reports local-only for a document that was never uploaded", () => {
    expect(localRow(localOnly, [], "ready", "doc-1").sync).toBe("local-only");
  });

  it("reports synced only when the account holds this browser's snapshot", () => {
    expect(localRow(entry, [cloud], "ready", "doc-1").sync).toBe("synced");
    expect(localRow({ ...entry, lastSnapshotId: "snapshot-3" }, [cloud], "ready", "doc-1").sync)
      .toBe("unsaved");
    expect(localRow(entry, [{ ...cloud, version: 3 }], "ready", "doc-1").sync).toBe("unsaved");
  });

  it("does not claim the online copy is current while the account is unreachable", () => {
    expect(localRow(entry, [], "signed-out", "doc-1").sync).toBe("unknown");
    expect(localRow(entry, [], "unavailable", "doc-1").sync).toBe("unknown");
    // A local edit is still knowable offline: the saved pointer no longer matches.
    expect(localRow({ ...entry, lastSnapshotId: "snapshot-3" }, [], "signed-out", "doc-1").sync)
      .toBe("unsaved");
  });

  it("treats a linked document the account has lost as unsaved rather than synced", () => {
    expect(localRow(entry, [], "ready", "doc-1").sync).toBe("unsaved");
  });
});

describe("publish state", () => {
  it("is outdated when the online copy moved on after the freeze", () => {
    const row = localRow(
      entry,
      [{ ...cloud, updatedAt: 900, publication }],
      "ready",
      "doc-1"
    );
    expect(row.publish).toBe("outdated");
    expect(rowStateLabel(row).text).toBe("Published · outdated");
  });

  it("is outdated when this browser holds unsaved content", () => {
    const row = localRow(
      { ...entry, lastSnapshotId: "snapshot-3" },
      [{ ...cloud, publication }],
      "ready",
      "doc-1"
    );
    expect(row.publish).toBe("outdated");
  });

  it("is current when the freeze matches the online copy", () => {
    const row = localRow(entry, [{ ...cloud, publication }], "ready", "doc-1");
    expect(row.publish).toBe("current");
    expect(rowStateLabel(row).text).toBe("Published");
  });

  it("falls back to the cached publication while the account is unreachable", () => {
    const row = localRow({ ...entry, cloudPublication: publication }, [], "signed-out", "doc-1");
    expect(row.publication).toEqual(publication);
    expect(row.publish).toBe("current");
  });
});

describe("row labels", () => {
  it("never reports Saved online for a map holding unsaved content", () => {
    const row = localRow({ ...entry, lastSnapshotId: "snapshot-3" }, [cloud], "ready", "doc-1");
    expect(rowStateLabel(row).text).toBe("Unsaved changes");
  });

  it("distinguishes local-only, saved-online and online-only", () => {
    expect(rowStateLabel(localRow(localOnly, [], "ready", "doc-1")).text).toBe("Local only");
    expect(rowStateLabel(localRow(entry, [cloud], "ready", "doc-1")).text).toBe("Saved online");
    const rows = buildRows([], [cloud], "ready", "doc-1");
    expect(rowStateLabel(rows[0]!).text).toBe("Online only");
  });
});

describe("merged list", () => {
  it("adds account documents that are not in this browser, and only those", () => {
    const rows = buildRows([entry, localOnly], [cloud], "ready", "doc-1");
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.key)).toEqual(["local:doc-1", "local:doc-2"]);
  });

  it("lists an account document with no local copy as its own row", () => {
    const rows = buildRows([localOnly], [cloud], "ready", "doc-2");
    expect(rows.map((row) => row.key)).toEqual(["local:doc-2", "cloud:cloud-1"]);
    expect(rows[1]!.kind).toBe("online-only");
  });

  it("shows no account rows while signed out", () => {
    expect(buildRows([localOnly], [cloud], "signed-out", "doc-2")).toHaveLength(1);
  });

  it("marks the map open in the editor", () => {
    const rows = buildRows([entry, localOnly], [], "signed-out", "doc-2");
    expect(rows.find((row) => row.isCurrent)?.id).toBe("doc-2");
  });
});

describe("search and sort", () => {
  const rows = buildRows([entry, localOnly], [cloud], "ready", "doc-1");

  it("sorts newest-first by default and alphabetically on request", () => {
    expect(visibleRows(rows, "", "recent").map((row) => row.title)).toEqual(["Notes", "Plan"]);
    expect(visibleRows(rows, "", "title").map((row) => row.title)).toEqual(["Notes", "Plan"]);
  });

  it("orders ties deterministically rather than by list order", () => {
    const tied = buildRows(
      [
        { ...localOnly, id: "doc-b", title: "Same", updatedAt: 500 },
        { ...localOnly, id: "doc-a", title: "Same", updatedAt: 500 }
      ],
      [],
      "signed-out",
      "doc-a"
    );
    expect(visibleRows(tied, "", "recent").map((row) => row.id)).toEqual(["doc-a", "doc-b"]);
  });

  it("filters by title, case- and whitespace-insensitively", () => {
    expect(visibleRows(rows, "  pLaN ", "recent").map((row) => row.title)).toEqual(["Plan"]);
    expect(visibleRows(rows, "nothing", "recent")).toEqual([]);
  });
});
