/**
 * Material seed — tagging pass.
 *
 * Recomputes difficulty metrics and feature tags for library passages and writes them
 * to `passages` / `passage_tags`. Safe and cheap to re-run: the tagger is deterministic
 * and `replacePassageTags` replaces a passage's tags wholesale, so re-running after a
 * vocabulary change is the intended workflow rather than a migration.
 *
 * Usage:
 *   pnpm tsx scripts/material-seed/tag.ts                 # tag every library passage
 *   pnpm tsx scripts/material-seed/tag.ts --local --persist-to apps/web/.wrangler/state
 *
 * It imports the app's tagger directly rather than keeping a copy — `passage-tags.ts`
 * and `dictation-diff.ts` are alias-free precisely so this script can.
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { analyzePassage } from "../../apps/web/app/utils/passage-tags";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const D1_NAME = "bcailab-db";

let persistTo: string | null = null;
let local = false;

const wrangler = (args: string[]): string => {
  try {
    return execFileSync("pnpm", ["exec", "wrangler", ...args], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024
    });
  } catch (error) {
    const err = error as { stderr?: string; stdout?: string };
    throw new Error(`wrangler ${args.slice(0, 3).join(" ")} failed:\n${err.stderr || err.stdout || String(error)}`);
  }
};

const target = (): string[] => {
  if (!local) return ["--remote"];
  return persistTo ? ["--local", "--persist-to", persistTo] : ["--local"];
};

/** wrangler prints progress before the JSON payload; slice from the first bracket. */
const d1Json = (sql: string): Array<Record<string, unknown>> => {
  const raw = wrangler(["d1", "execute", D1_NAME, ...target(), "--json", "--command", sql]);
  const start = raw.indexOf("[");
  if (start < 0) throw new Error(`Unexpected wrangler output:\n${raw}`);
  return (JSON.parse(raw.slice(start))[0]?.results ?? []) as Array<Record<string, unknown>>;
};

const sqlQuote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const main = async () => {
  const argv = process.argv.slice(2);
  local = argv.includes("--local");
  const persistIndex = argv.indexOf("--persist-to");
  if (persistIndex >= 0) {
    const value = argv[persistIndex + 1];
    if (!value) throw new Error("--persist-to needs a directory.");
    persistTo = path.resolve(process.cwd(), value);
  }

  const passages = d1Json(
    "SELECT id, title, band, content_text FROM passages WHERE user_id IS NULL AND deleted_at IS NULL"
  );
  if (passages.length === 0) {
    console.log("No library passages to tag.");
    return;
  }
  console.log(`Tagging ${passages.length} library passage(s) on ${local ? "LOCAL" : "REMOTE"}.`);

  const statements: string[] = [];
  for (const row of passages) {
    const id = String(row.id);
    const analysis = analyzePassage(String(row.content_text));
    const { wordCount, sentenceCount, meanSentenceWords, rareWordRatio } = analysis.metrics;

    statements.push(
      `UPDATE passages SET word_count = ${wordCount}, sentence_count = ${sentenceCount},` +
        ` mean_sentence_words = ${meanSentenceWords.toFixed(4)},` +
        ` rare_word_ratio = ${rareWordRatio.toFixed(4)}, updated_at = datetime('now')` +
        ` WHERE id = ${sqlQuote(id)};`
    );
    statements.push(`DELETE FROM passage_tags WHERE passage_id = ${sqlQuote(id)};`);
    for (const entry of analysis.tags) {
      statements.push(
        `INSERT INTO passage_tags (passage_id, tag, count) VALUES (${sqlQuote(id)}, ${sqlQuote(entry.tag)}, ${entry.count});`
      );
    }

    const top = analysis.tags.slice(0, 4).map((t) => `${t.tag}:${t.count}`).join(" ");
    console.log(
      `  ${String(row.band ?? "--")} ${String(row.title)} — ${wordCount}w, ` +
        `mean ${meanSentenceWords.toFixed(1)}, rare ${rareWordRatio.toFixed(2)} | ${top}`
    );
  }

  // One statement per --command would be one round trip each; batch through a file.
  const { writeFile } = await import("node:fs/promises");
  const os = await import("node:os");
  const sqlPath = path.join(os.tmpdir(), "material-tag.sql");
  await writeFile(sqlPath, statements.join("\n") + "\n", "utf8");
  wrangler(["d1", "execute", D1_NAME, ...target(), "--file", sqlPath]);
  console.log(`✓ tagged ${passages.length} passage(s)`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
