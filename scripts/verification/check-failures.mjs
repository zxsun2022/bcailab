import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const logs = mkdtempSync(resolve(tmpdir(), 'bcailab-verify-failures-'));
const name = `verify_probe_${process.pid}`;
const badTest = 'import { it, expect } from "vitest";\nit("injected verification failure", () => expect(true).toBe(false));\n';
const badType = 'export const injectedVerificationTypeError: number = "deliberate mismatch";\n';
const badLint = 'verificationUndefinedFunction();\n';
const probes = [
  ['web-unit', 'web', 'unit tests', `apps/web/app/utils/${name}.test.ts`, badTest],
  ['mapdown-unit', 'mapdown', 'unit tests', `apps/mapdown/src/${name}.test.ts`, badTest],
  ['web-type', 'web', 'web typecheck', `apps/web/app/utils/${name}.ts`, badType],
  ['mapdown-type', 'mapdown', 'mapdown typecheck', `apps/mapdown/src/${name}.ts`, badType],
  ['functions-in-root', 'all', 'mapdown functions', `apps/mapdown/functions/${name}.ts`, badType],
  ['web-lint', 'web', 'lint', `apps/web/app/utils/${name}.mjs`, badLint],
  ['mapdown-lint', 'mapdown', 'lint', `apps/mapdown/src/${name}.mjs`, badLint],
  ['doc-link', 'web', 'docs', 'docs/verification.md', `\n[Deliberate verification probe](./${name}-missing.md)\n`]
];
console.log(`Failure-injection logs: ${logs}`);
try {
  for (const [label, scope, step, file, contents] of probes) {
    const path = resolve(root, file);
    const append = label === 'doc-link';
    if (!append && existsSync(path)) throw new Error(`Refusing to overwrite ${file}`);
    const original = append ? readFileSync(path, 'utf8') : null;
    const injected = (original ?? '') + contents;
    writeFileSync(path, injected, { flag: append ? 'w' : 'wx' });
    try {
      const result = spawnSync('pnpm', [scope === 'all' ? 'verify' : `verify:${scope}`], {
        cwd: root, encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024
      });
      const output = (result.stdout ?? '') + (result.stderr ?? '');
      writeFileSync(resolve(logs, label + '.log'), output);
      if (result.error || result.status === 0 || !output.includes(`FAIL ${scope}: ${step}`) || !output.includes(name)) {
        throw new Error(`${label}: did not fail at the expected step (${step}); see ${logs}/${label}.log`);
      }
      console.log(`PASS ${label}: ${scope} rejects ${step}`);
    } finally {
      if (readFileSync(path, 'utf8') !== injected) {
        console.error(`Concurrent change detected in ${file}; not overwriting it. Inspect and remove the probe manually.`);
        process.exitCode = 1;
      } else if (append) writeFileSync(path, original);
      else unlinkSync(path);
    }
    if (process.exitCode) throw new Error('Stopped after a concurrent edit during cleanup.');
  }
  console.log(`PASS failure injection: ${probes.length} expected failures; all probe edits restored.`);
} catch (error) {
  console.error(error.message); process.exitCode = 1;
}
