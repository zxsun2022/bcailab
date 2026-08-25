import { describe, expect, it } from "vitest";
import { parseRoute, routePath } from "./routing";

describe("route parsing", () => {
  it("maps the three app paths", () => {
    expect(parseRoute("/", "")).toEqual({ name: "editor" });
    expect(parseRoute("/library", "")).toEqual({ name: "library" });
    expect(parseRoute("/library/", "")).toEqual({ name: "library" });
    expect(parseRoute("/import", "?src=abc123")).toEqual({ name: "import", publicId: "abc123" });
  });

  it("falls back to the editor for anything else, so a stray path never renders nothing", () => {
    expect(parseRoute("/p/abc", "")).toEqual({ name: "editor" });
    expect(parseRoute("/librarys", "")).toEqual({ name: "editor" });
  });

  it("rejects an import id that is not one of ours rather than passing it to the API", () => {
    expect(parseRoute("/import", "?src=../../api/auth/session")).toEqual({
      name: "import",
      publicId: ""
    });
    expect(parseRoute("/import", "?src=%3Cscript%3E")).toEqual({ name: "import", publicId: "" });
    expect(parseRoute("/import", "")).toEqual({ name: "import", publicId: "" });
  });

  it("round-trips through routePath", () => {
    for (const route of [
      { name: "editor" } as const,
      { name: "library" } as const,
      { name: "import", publicId: "deadbeef" } as const
    ]) {
      const url = new URL(routePath(route), "https://map.bcailab.com");
      expect(parseRoute(url.pathname, url.search)).toEqual(route);
    }
  });
});
