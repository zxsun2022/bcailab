import { describe, expect, it } from "vitest";
import { cloudConfirmationCopy, cloudConfirmationLabel } from "./confirmations";

describe("cloud confirmations", () => {
  it("states that publishing also saves the current online copy", () => {
    expect(cloudConfirmationCopy({
      kind: "publish",
      localDocumentId: "doc-1",
      title: "Plan",
      nodeCount: 12,
      updatesExisting: true
    })).toMatch(/Save the current changes to the online copy/);
    expect(cloudConfirmationCopy({
      kind: "publish",
      localDocumentId: "doc-1",
      title: "Plan",
      nodeCount: 1,
      updatesExisting: false
    })).toContain("(1 node)");
  });

  it("states the public-link consequence before destructive cloud actions", () => {
    expect(cloudConfirmationCopy({
      kind: "unpublish",
      localDocumentId: "doc-1",
      title: "Plan"
    })).toMatch(/return 404 immediately/);
    expect(cloudConfirmationCopy({
      kind: "delete-online",
      cloudDocumentId: "cloud-1",
      title: "Plan",
      revokesPublication: true
    })).toMatch(/public link will stop working immediately/);
    expect(cloudConfirmationCopy({
      kind: "delete-online",
      cloudDocumentId: "cloud-1",
      title: "Plan",
      revokesPublication: false
    })).not.toMatch(/public link/);
  });

  it("warns when deleting the map that is open, and promises the undo", () => {
    const current = cloudConfirmationCopy({
      kind: "delete-local",
      localDocumentId: "doc-1",
      title: "Plan",
      isCurrent: true
    });
    expect(current).toMatch(/another map will be opened/);
    expect(current).toMatch(/Undo delete stays available/);
    expect(cloudConfirmationCopy({
      kind: "delete-local",
      localDocumentId: "doc-1",
      title: "Plan",
      isCurrent: false
    })).not.toMatch(/another map will be opened/);
  });

  it("labels the action button with what it will do, not with a generic confirm", () => {
    expect(cloudConfirmationLabel({
      kind: "publish",
      localDocumentId: "doc-1",
      title: "Plan",
      nodeCount: 3,
      updatesExisting: true
    })).toBe("Update published version");
    expect(cloudConfirmationLabel({
      kind: "publish",
      localDocumentId: "doc-1",
      title: "Plan",
      nodeCount: 3,
      updatesExisting: false
    })).toBe("Publish map");
  });
});
