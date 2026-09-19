/**
 * Build the registered Reading bias manifest from a hand-filled draft. No model calls, no key.
 * Kit and annotation rules: docs/spikes/reading-bias-corpus/README.md.
 *
 *   pnpm exec tsx scripts/grader-bias/prepare.ts --draft docs/spikes/reading-bias-corpus/draft.json
 *   pnpm exec tsx scripts/grader-bias/prepare.ts --passages docs/spikes/reading-bias-corpus/draft.json
 *
 * Writes `manifest.json` beside the draft, so audio paths stay relative to the same directory,
 * then validates it with the same parser `grader-bias.ts` uses. `--passages` only prints each
 * passage's tag exposure, for checking text before anyone records.
 */
import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { buildManifest, passageExposure, type CorpusDraft } from "./draft";

const main = async () => {
  const argv = process.argv.slice(2);
  const read = (flag: string) => { const at = argv.indexOf(flag); return at < 0 ? undefined : argv[at + 1]; };
  const passagesOnly = read("--passages");
  const input = passagesOnly ?? read("--draft");
  if (!input) {
    console.log("Usage: pnpm exec tsx scripts/grader-bias/prepare.ts --draft <draft.json> | --passages <draft.json>");
    return;
  }
  const draftPath = path.resolve(input);
  const draft = JSON.parse(await readFile(draftPath, "utf8")) as CorpusDraft;

  for (const [key, text] of Object.entries(draft.passages ?? {})) {
    const exposure = passageExposure(text);
    console.log(`Passage ${key}: th_sound ${exposure.th_sound}, linking ${exposure.linking}`);
  }
  if (passagesOnly) return;

  const dir = path.dirname(draftPath);
  const manifest = buildManifest(draft, (audio) => {
    const bytes = readFileSync(path.resolve(dir, audio));
    if (bytes.length === 0) throw new Error(`Audio file is empty: ${audio}`);
    return createHash("sha256").update(bytes).digest("hex");
  });
  const out = path.join(dir, "manifest.json");
  await writeFile(out, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Wrote ${path.relative(process.cwd(), out)}: ${manifest.recordings.length} recordings, validated.`);
  console.log("Next: listen-check, commit manifest.json (not the audio), then run grader-bias.ts --manifest.");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Preparing the manifest failed.");
  process.exitCode = 1;
});
