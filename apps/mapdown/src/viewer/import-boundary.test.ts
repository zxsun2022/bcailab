import { readFile } from "node:fs/promises";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The published page runs on the host that serves other people's content. Nothing reachable
 * from its entry point may be able to write a document, touch storage, or dispatch an editing
 * command — criterion (f) of stage 2.
 *
 * Checking the source module graph rather than the built bundle is the stronger test, not the
 * weaker one: Rollup can only emit a module that something imported, so a graph that never
 * reaches these directories cannot produce a bundle that contains them. It also fails at the
 * moment the import is written, rather than after a build nobody ran.
 */

const SRC = resolve(__dirname, "..");

const FORBIDDEN = [
  "editor/",
  "storage/",
  "library/",
  "cloud/",
  "model/commands",
  "model/history",
  "markdown/",
  "export/",
  "spikes/"
];

const IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

async function resolveModule(specifier: string, fromFile: string): Promise<string | null> {
  if (!specifier.startsWith(".")) return null; // bare specifiers are node_modules
  const base = normalize(join(dirname(fromFile), specifier));
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch {
      // try the next extension
    }
  }
  return null;
}

async function moduleGraph(entry: string): Promise<string[]> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = await readFile(file, "utf8");
    for (const pattern of [IMPORT, DYNAMIC_IMPORT]) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        const resolved = await resolveModule(match[1]!, file);
        if (resolved && !seen.has(resolved)) queue.push(resolved);
      }
    }
  }
  return [...seen].map((file) => relative(SRC, file).replace(/\\/g, "/"));
}

describe("published viewer import boundary", () => {
  it("never reaches the editor, storage, account or command modules", async () => {
    const graph = await moduleGraph(join(SRC, "viewer/main.tsx"));
    const leaked = graph.filter((file) => FORBIDDEN.some((prefix) => file.startsWith(prefix)));
    expect(leaked).toEqual([]);
  });

  it("does reach the layout and theme modules, so the check is not vacuous", async () => {
    const graph = await moduleGraph(join(SRC, "viewer/main.tsx"));
    expect(graph).toContain("layout/layout.ts");
    expect(graph).toContain("theme/presets.ts");
    expect(graph).toContain("canvas/viewport.ts");
  });

  it("still finds the forbidden modules when they are genuinely imported", async () => {
    // Guards the resolver itself: if `moduleGraph` silently failed to follow imports, the first
    // test would pass for the wrong reason. The editor entry must trip every kind of match.
    const graph = await moduleGraph(join(SRC, "editor/Editor.tsx"));
    expect(graph.some((file) => file.startsWith("storage/"))).toBe(true);
    expect(graph.some((file) => file.startsWith("cloud/"))).toBe(true);
    expect(graph).toContain("model/commands.ts");
  });
});
