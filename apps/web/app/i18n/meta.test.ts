import { describe, expect, it } from "vitest";
import { localeFromMatches, metaTranslator } from "./meta";

describe("localeFromMatches", () => {
  it("reads the locale the root loader returned", () => {
    expect(localeFromMatches([{ id: "root", data: { user: null, locale: "zh" } }])).toBe("zh");
  });

  it("falls back to en when root data is absent or invalid", () => {
    expect(localeFromMatches([])).toBe("en");
    expect(localeFromMatches([{ id: "root", data: undefined }])).toBe("en");
    expect(localeFromMatches([{ id: "root", data: { locale: "fr" } }])).toBe("en");
  });

  it("translates meta copy in the root's locale", () => {
    const t = metaTranslator([{ id: "root", data: { locale: "zh" } }]);
    expect(t("meta.dictation.title")).toBe("听写 · bcailab");
  });
});
