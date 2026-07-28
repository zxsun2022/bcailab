import { describe, expect, it } from "vitest";
import {
  ENGLISH_MODULES,
  resolveEnglishModuleDestination,
  type EnglishModuleAccess
} from "./english-modules";

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
