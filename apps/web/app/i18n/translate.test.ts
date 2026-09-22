import { describe, expect, it } from "vitest";
import { en } from "./messages/en";
import { zh } from "./messages/zh";
import { createTranslator, interpolate, placeholdersOf, splitTemplate } from "./translate";
import { TAG_DESCRIPTIONS } from "~/utils/learner-model";

describe("catalogue parity", () => {
  // The type system already rejects a missing or extra key; this pins it at runtime too, in
  // case a cast or an `any` ever opens a hole.
  it("has exactly the same keys in both catalogues", () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });

  // A translation that drops `{count}` renders a sentence with the number silently missing.
  it("uses the same placeholders in every translated message", () => {
    const mismatched = (Object.keys(en) as Array<keyof typeof en>).filter(
      (key) => placeholdersOf(en[key]).join() !== placeholdersOf(zh[key]).join()
    );
    expect(mismatched).toEqual([]);
  });

  it("has no empty or untranslated-looking Chinese message", () => {
    const empty = Object.entries(zh).filter(([, value]) => value.trim() === "");
    expect(empty).toEqual([]);
  });
});

describe("interpolate", () => {
  it("fills placeholders and keeps unknown ones visible", () => {
    expect(interpolate("{a} of {b}", { a: 1, b: 3 })).toBe("1 of 3");
    expect(interpolate("{a} of {b}", { a: 1 })).toBe("1 of {b}");
    expect(interpolate("plain")).toBe("plain");
  });
});

describe("createTranslator", () => {
  it("reads the selected catalogue", () => {
    expect(createTranslator("en")("dictation.check")).toBe("Check");
    expect(createTranslator("zh")("dictation.check")).toBe("检查");
    expect(createTranslator("zh")("dictation.sentenceOf", { current: 2, total: 9 })).toBe(
      "第 2 句，共 9 句"
    );
  });
});

describe("splitTemplate", () => {
  it("separates text from slots in order", () => {
    expect(splitTemplate("by {name} from here")).toEqual([
      { kind: "text", value: "by " },
      { kind: "slot", name: "name" },
      { kind: "text", value: " from here" }
    ]);
    expect(splitTemplate("{name}")).toEqual([{ kind: "slot", name: "name" }]);
  });
});

describe("learner feature labels", () => {
  // `TAG_DESCRIPTIONS` stays English because grading prompts are built from it; the catalogue
  // carries the display copy. Every tag needs both, and the English must not drift.
  it("has catalogue copy for every tag, identical to the prompt's English", () => {
    for (const [tag, description] of Object.entries(TAG_DESCRIPTIONS)) {
      const key = `learnerTag.${tag}` as keyof typeof en;
      expect(en[key], tag).toBe(description);
      expect(zh[key], tag).toBeTruthy();
    }
  });
});
