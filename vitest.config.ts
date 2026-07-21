import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Unit tests for pure logic — no DOM, no Cloudflare bindings, no network.
 *
 * Scope is deliberately narrow: modules that are deterministic and whose bugs are
 * silent (scoring, parsing, normalization). Route loaders and `*.server.ts` modules
 * that need D1/R2 bindings are verified against the running dev server instead.
 */
export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "apps/web/app")
    }
  },
  test: {
    include: ["apps/web/app/**/*.test.ts"],
    environment: "node"
  }
});
