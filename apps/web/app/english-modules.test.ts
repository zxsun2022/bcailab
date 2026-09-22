import { describe, expect, it } from "vitest";
import {
  ENGLISH_MODULES,
  moduleCopy,
  resolveEnglishModuleDestination,
  type EnglishModuleAccess
} from "./english-modules";
import { createTranslator } from "./i18n/translate";

const moduleWithAccess = (access: EnglishModuleAccess) => {
  const module = ENGLISH_MODULES.find((entry) => entry.access === access);
  if (!module) throw new Error(`Missing fixture for ${access}`);
  return module;
};

describe("English Studio module access resolution", () => {
  it("sends anonymous visitors straight to public modules", () => {
    const module = moduleWithAccess("public");
    expect(resolveEnglishModuleDestination(module, false)).toEqual({
      href: module.route,
      requiresLogin: false
    });
  });

  it("sends anonymous visitors to trial routes", () => {
    const reading = ENGLISH_MODULES.find((entry) => entry.id === "reading");
    const writing = ENGLISH_MODULES.find((entry) => entry.id === "writing");
    if (!reading || !writing) throw new Error("Missing trial modules");

    expect(resolveEnglishModuleDestination(reading, false)).toEqual({
      href: "/reading/trial",
      requiresLogin: false
    });
    expect(resolveEnglishModuleDestination(writing, false)).toEqual({
      href: "/writing/trial",
      requiresLogin: false
    });
  });

  it("keeps anonymous visitors on the page and requests login for auth modules", () => {
    const module = moduleWithAccess("auth");
    expect(resolveEnglishModuleDestination(module, false)).toEqual({
      href: module.route,
      requiresLogin: true
    });
  });

  it("always sends signed-in users to the canonical tool route", () => {
    for (const module of ENGLISH_MODULES) {
      expect(resolveEnglishModuleDestination(module, true)).toEqual({
        href: module.route,
        requiresLogin: false
      });
    }
  });
});

describe("English Studio module copy", () => {
  it("resolves every module's copy in both interface languages", () => {
    for (const locale of ["en", "zh"] as const) {
      const t = createTranslator(locale);
      for (const module of ENGLISH_MODULES) {
        const copy = moduleCopy(t, module);
        expect(copy.label).not.toMatch(/^module\./);
        expect(copy.description.length).toBeGreaterThan(0);
        expect(copy.tags.every((tag) => !tag.startsWith("moduleTag."))).toBe(true);
      }
    }
  });

  it("keeps the English copy the registry used to carry", () => {
    const dictation = ENGLISH_MODULES.find((entry) => entry.id === "dictation")!;
    expect(moduleCopy(createTranslator("en"), dictation)).toMatchObject({
      label: "Dictation",
      description: "Listen sentence by sentence and type what you hear.",
      tags: ["Listening", "Scoring", "Free to try"]
    });
  });
});
