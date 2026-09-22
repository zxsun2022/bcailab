import { describe, expect, it } from "vitest";
import {
  intlLocale,
  negotiateAcceptLanguage,
  otherLocale,
  parseLocale,
  readCookie,
  resolveLocale,
  safeReturnPath,
  serializeLocaleCookie
} from "./locale";

describe("negotiateAcceptLanguage", () => {
  it.each(["zh", "zh-CN", "zh-Hans", "zh-SG", "zh-TW", "zh-HK", "zh-Hant-TW", "ZH-cn"])(
    "resolves %s to zh",
    (tag) => {
      expect(negotiateAcceptLanguage(tag)).toBe("zh");
    }
  );

  it("resolves English variants to en", () => {
    expect(negotiateAcceptLanguage("en-GB")).toBe("en");
    expect(negotiateAcceptLanguage("en-US,en;q=0.9")).toBe("en");
  });

  it("lets weights decide a mixed header", () => {
    expect(negotiateAcceptLanguage("en-US;q=0.5,zh-CN;q=0.9")).toBe("zh");
    expect(negotiateAcceptLanguage("zh-CN;q=0.4,en;q=0.8")).toBe("en");
  });

  it("keeps header order when weights tie", () => {
    expect(negotiateAcceptLanguage("zh-CN,en-US")).toBe("zh");
    expect(negotiateAcceptLanguage("en-US,zh-CN")).toBe("en");
  });

  it("skips unsupported languages rather than giving up", () => {
    expect(negotiateAcceptLanguage("fr-FR,de;q=0.9,zh;q=0.3")).toBe("zh");
  });

  it("treats q=0 as not acceptable", () => {
    expect(negotiateAcceptLanguage("zh;q=0,en;q=0.1")).toBe("en");
  });

  it("returns null for absent, unsupported or malformed headers without throwing", () => {
    expect(negotiateAcceptLanguage(null)).toBeNull();
    expect(negotiateAcceptLanguage("")).toBeNull();
    expect(negotiateAcceptLanguage("fr-FR,ja")).toBeNull();
    expect(negotiateAcceptLanguage(";;;,,=q")).toBeNull();
    expect(negotiateAcceptLanguage("zh;q=banana")).toBeNull();
    expect(negotiateAcceptLanguage("*")).toBeNull();
  });
});

describe("resolveLocale", () => {
  it("lets an explicit cookie outrank the header", () => {
    expect(resolveLocale({ cookie: "en", acceptLanguage: "zh-CN" })).toBe("en");
    expect(resolveLocale({ cookie: "zh", acceptLanguage: "en-US" })).toBe("zh");
  });

  it("ignores an invalid cookie and falls through to negotiation", () => {
    expect(resolveLocale({ cookie: "fr", acceptLanguage: "zh-CN" })).toBe("zh");
    expect(resolveLocale({ cookie: "", acceptLanguage: null })).toBe("en");
  });

  it("defaults to en when nothing matches", () => {
    expect(resolveLocale({ cookie: null, acceptLanguage: "ja-JP" })).toBe("en");
    expect(resolveLocale({ cookie: undefined, acceptLanguage: undefined })).toBe("en");
  });
});

describe("parseLocale / otherLocale", () => {
  it("never returns an unsupported value", () => {
    expect(parseLocale("zh")).toBe("zh");
    expect(parseLocale("zh-CN")).toBe("en");
    expect(parseLocale(undefined)).toBe("en");
  });

  it("offers the other language", () => {
    expect(otherLocale("en")).toBe("zh");
    expect(otherLocale("zh")).toBe("en");
  });
});

describe("readCookie", () => {
  it("finds one cookie among several", () => {
    expect(readCookie("a=1; bcailab_locale=zh; b=2", "bcailab_locale")).toBe("zh");
  });

  it("does not match a cookie whose name merely ends the same way", () => {
    expect(readCookie("x_bcailab_locale=zh", "bcailab_locale")).toBeNull();
  });

  it("returns null when absent", () => {
    expect(readCookie(null, "bcailab_locale")).toBeNull();
    expect(readCookie("a=1", "bcailab_locale")).toBeNull();
  });
});

describe("serializeLocaleCookie", () => {
  it("is host-only, HttpOnly, year-long and Secure on a real host", () => {
    const cookie = serializeLocaleCookie("zh", "bcailab.com");
    expect(cookie).toContain("bcailab_locale=zh");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain(`Max-Age=${60 * 60 * 24 * 365}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(cookie).not.toMatch(/domain=/i);
  });

  it("omits Secure on localhost so local development keeps the choice", () => {
    expect(serializeLocaleCookie("en", "localhost")).not.toContain("Secure");
    expect(serializeLocaleCookie("en", "127.0.0.1")).not.toContain("Secure");
  });
});

describe("safeReturnPath", () => {
  it("keeps same-site paths with their query", () => {
    expect(safeReturnPath("/dictation/abc?x=1")).toBe("/dictation/abc?x=1");
    expect(safeReturnPath("/")).toBe("/");
  });

  it.each([
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    "evil.example",
    "/ok\r\nSet-Cookie: x=1",
    "",
    null,
    42
  ])("refuses %s", (raw) => {
    expect(safeReturnPath(raw)).toBe("/");
  });
});

describe("intlLocale", () => {
  it("formats Chinese as zh-CN and leaves English to the browser", () => {
    expect(intlLocale("zh")).toBe("zh-CN");
    expect(intlLocale("en")).toBeUndefined();
  });
});
