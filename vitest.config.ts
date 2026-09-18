import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Unit tests for deterministic logic and targeted React lifecycle regressions.
 * Node is the default; individual React tests opt into jsdom. No Cloudflare bindings or network.
 *
 * Scope is deliberately narrow: modules that are deterministic and whose bugs are
 * silent (scoring, parsing, normalization). Route loaders and `*.server.ts` modules
 * that need D1/R2 bindings are verified against the running dev server instead.
 */
export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "apps/web/app"),
      "@bcailab/db": path.resolve(__dirname, "packages/db/src/index.ts")
    }
  },
  test: {
    include: [
      "apps/web/app/**/*.test.ts",
      "apps/mapdown/src/**/*.test.ts",
      "apps/mapdown/functions/**/*.test.ts",
      "packages/*/src/**/*.test.ts",
      "scripts/writing-prompt-seed/**/*.test.ts",
      "scripts/grader-bias/**/*.test.ts"
    ],
    environment: "node"
  }
});
