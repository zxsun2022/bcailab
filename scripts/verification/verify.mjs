import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const scope = process.argv[2] ?? 'all';
if (!['web', 'mapdown', 'all'].includes(scope)) {
  console.error('Usage: node scripts/verification/verify.mjs [web|mapdown|all]'); process.exit(2);
}
const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const expectedPnpm = manifest.packageManager.replace(/^pnpm@/, '');
const pnpm = spawnSync('pnpm', ['--version'], { cwd: root, encoding: 'utf8' });
if (Number(process.versions.node.split('.')[0]) < 22 || pnpm.status !== 0 || pnpm.stdout.trim() !== expectedPnpm) {
  console.error(`FAIL tools: need Node >=22 and pnpm ${expectedPnpm}; found Node ${process.versions.node}, pnpm ${pnpm.stdout?.trim() || 'unavailable'}`);
  process.exit(1);
}
console.log(`VERIFY ${scope} — Node ${process.versions.node}, pnpm ${expectedPnpm}`);
const steps = [['docs', ['run', 'check:docs']]];
if (scope !== 'mapdown') steps.push(['context pack', ['test:context-pack']]);
if (scope === 'all') steps.push(['unit tests', ['test']]);
else steps.push(['unit tests', ['exec', 'vitest', 'run', ...(scope === 'web'
  ? ['apps/web', 'packages', 'scripts/writing-prompt-seed', 'scripts/grader-bias']
  : ['apps/mapdown/src', 'apps/mapdown/functions'])]]);
if (scope !== 'mapdown') steps.push(['web typecheck', ['typecheck']]);
if (scope !== 'web') steps.push(
  ['mapdown typecheck', ['--filter', 'mapdown', 'typecheck']],
  ['mapdown functions', ['--filter', 'mapdown', 'typecheck:functions']]
);
steps.push(['lint', ['exec', 'eslint', ...(scope === 'all' ? ['.'] : scope === 'web'
  ? ['apps/web', 'packages', 'workers', 'scripts', 'eslint.config.mjs', 'vitest.config.ts']
  : ['apps/mapdown', 'scripts/verification', 'eslint.config.mjs', 'vitest.config.ts'])]]);
if (scope !== 'mapdown') steps.push(['web build', ['--filter', 'web', 'build']], ['D1/HTTP', ['test:integration']]);
if (scope !== 'web') steps.push(['mapdown build', ['--filter', 'mapdown', 'build']]);
for (const [label, args] of steps) {
  console.log(`\nCHECK ${scope}: ${label}`);
  const result = spawnSync('pnpm', args, { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    console.error(`FAIL ${scope}: ${label}${result.error ? ` (${result.error.message})` : ''}`);
    process.exit(result.status || 1);
  }
}
console.log(`\nPASS ${scope}: ${steps.length} checks. Browser checks remain manual; this is not a deployment gate.`);
