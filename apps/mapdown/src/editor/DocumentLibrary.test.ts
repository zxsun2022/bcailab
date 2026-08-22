import { describe, expect, it } from "vitest";
import type { CloudDocumentSummary } from "../cloud/types";
import type { DocumentIndexEntry } from "../storage/store";
import { isOnlineCopyCurrent } from "./DocumentLibrary";

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

describe("document library online status", () => {
  it("uses persisted metadata while signed out instead of treating the empty cloud list as stale", () => {
    expect(isOnlineCopyCurrent(entry, null, "signed-out")).toBe(true);
    expect(isOnlineCopyCurrent(entry, null, "unavailable")).toBe(true);
  });

  it("still detects local and remote changes when the cloud list is available", () => {
    expect(isOnlineCopyCurrent(entry, cloud, "ready")).toBe(true);
    expect(isOnlineCopyCurrent({ ...entry, lastSnapshotId: "snapshot-3" }, cloud, "ready")).toBe(false);
    expect(isOnlineCopyCurrent(entry, { ...cloud, version: 3 }, "ready")).toBe(false);
  });
});
