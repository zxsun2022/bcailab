import { beforeEach, describe, expect, it } from "vitest";
import { applyCommand } from "../model/commands";
import { createDocument, resetIdCounterForTests } from "../model/types";
import { shouldShowAuthoringHint } from "./affordances";

beforeEach(() => resetIdCounterForTests());

describe("Canvas affordances (b) — authoring hint visibility", () => {
  it("shows on an untouched empty map", () => {
    expect(shouldShowAuthoringHint(createDocument("New map"), false)).toBe(true);
  });

  it("disappears once the map has any content beyond the root", () => {
    const empty = createDocument("New map");
    const doc = applyCommand(empty, {
      type: "CreateChild",
      parentId: empty.rootId,
      text: "first"
    }).doc;
    expect(shouldShowAuthoringHint(doc, false)).toBe(false);
  });

  it("stays hidden after dismissal, even while the map is still empty", () => {
    expect(shouldShowAuthoringHint(createDocument("New map"), true)).toBe(false);
  });
});
