import { beforeEach, describe, expect, it } from "vitest";
import { layout } from "../layout/layout";
import { createDocument, getNode, resetIdCounterForTests } from "../model/types";
import { createAutosave, recoverDocument, resetSnapshotIdsForTests } from "../storage/autosave";
import { MemoryStore } from "../storage/store";
import { documentWithDraft, takeEditingSession } from "./draft-persistence";

beforeEach(() => {
  resetIdCounterForTests();
  resetSnapshotIdsForTests();
});

describe("draft persistence", () => {
  it("lets only one focus transition consume an editing session", () => {
    const session = { nodeId: "node-1", draft: "" };
    const active = { current: session };

    expect(takeEditingSession(active)).toBe(session);
    expect(takeEditingSession(active)).toBeNull();
  });

  it("leaves the live document untouched while overlaying the visible draft", () => {
    const document = createDocument("New map");
    const snapshotDocument = documentWithDraft(document, {
      nodeId: document.rootId,
      draft: "hello world"
    });

    expect(getNode(document, document.rootId).text).toBe("New map");
    expect(getNode(snapshotDocument, snapshotDocument.rootId).text).toBe("hello world");
    expect(snapshotDocument.revision).toBe(document.revision + 1);
  });

  it("measures the visible draft without mutating the committed document", () => {
    const document = createDocument("Short");
    const before = layout(document).boxes[document.rootId]!;
    const previewDocument = documentWithDraft(document, {
      nodeId: document.rootId,
      draft:
        "This is a much longer label that wraps onto several lines while the user is still typing."
    });
    const during = layout(previewDocument).boxes[document.rootId]!;

    expect(during.height).toBeGreaterThan(before.height);
    expect(getNode(document, document.rootId).text).toBe("Short");
    expect(getNode(previewDocument, document.rootId).text).toContain("much longer label");
  });

  it("reuses the document when there is no semantic draft change", () => {
    const document = createDocument("hello world");

    expect(documentWithDraft(document, null)).toBe(document);
    expect(
      documentWithDraft(document, {
        nodeId: document.rootId,
        draft: "  hello world  "
      })
    ).toBe(document);
  });

  it("recovers text that was autosaved before the edit session committed", async () => {
    const store = new MemoryStore();
    const document = createDocument("New map");
    const autosave = createAutosave({
      store,
      onStatus: () => undefined,
      debounceMs: 5
    });

    autosave.schedule(
      documentWithDraft(document, {
        nodeId: document.rootId,
        draft: "draft survives refresh"
      }),
      document.rootId
    );
    await autosave.flush();

    const outcome = await recoverDocument(store, document.id);
    expect(outcome.kind).toBe("restored");
    if (outcome.kind === "restored") {
      expect(getNode(outcome.snapshot.document, document.rootId).text).toBe(
        "draft survives refresh"
      );
    }
  });
});
