import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, renameSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const scratch = mkdtempSync(resolve(tmpdir(), 'bcailab-context-check-'));
let checks = 0;
const check = (label, value) => { assert.ok(value, label); checks++; console.log('PASS ' + label); };
const put = (path, text, mode) => {
  const target = resolve(scratch, path); mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text, mode ? { mode } : undefined);
};
try {
  for (const file of ['README.md', 'AGENTS.md', 'docs/README.md', 'docs/architecture.md',
    'docs/roadmap.md', 'docs/access-model.md', 'docs/changelog.md', 'docs/decisions/0001-test.md',
    'docs/mapdown/decisions.md', 'docs/tools/test.md', 'docs/infra-cloudflare.md',
    'docs/design-system.md', 'docs/css-layout-conventions.md', 'docs/verification.md',
    'docs/documentation-audit.md', 'docs/roadmap-accepted-history.md']) put(file, '# Synthetic document\n');
  for (const file of ['package.json', 'apps/web/package.json', 'apps/mapdown/package.json']) put(file, '{"name":"synthetic"}\n');
  put('migrations/0001-test.sql', 'CREATE TABLE fixture(id TEXT);\n');
  put('wrangler.toml', 'name = "synthetic"\n');
  put('apps/web/app/routes/test.ts', 'export const loader = () => env.DB;\n');
  put('packages/test/src/test.ts', 'export const value = 1;\n');
  put('.dev.vars', 'SYNTHETIC_SECRET=sk-syntheticOnly123456789\n');
  put('.gitignore', '.dev.vars\npack.md\n');
  put('scripts/context-pack.sh', '');
  copyFileSync(resolve(root, 'scripts/context-pack.sh'), resolve(scratch, 'scripts/context-pack.sh'));
  execFileSync('git', ['init', '-q'], { cwd: scratch });
  execFileSync('git', ['add', '.'], { cwd: scratch });
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Synthetic context fixture'], { cwd: scratch });
  const out = resolve(scratch, 'pack.md');
  const run = (args, env = process.env) => spawnSync('bash', ['scripts/context-pack.sh', ...args, '-o', out], { cwd: scratch, env, encoding: 'utf8' });
  for (const profile of ['arch', 'product', 'debug', 'full']) {
    const result = run(['-p', profile]);
    assert.equal(result.status, 0, result.stderr);
    const pack = readFileSync(out, 'utf8');
    check(profile + ': includes derived checkout evidence', pack.includes('Actual route inventory *(derived)*') && pack.includes('apps/mapdown/package.json'));
    check(profile + ': env names without synthetic values', pack.includes('SYNTHETIC_SECRET') && !pack.includes('sk-syntheticOnly123456789'));
    if (['product','full'].includes(profile)) check(profile + ': delivery is historical', pack.includes('Delivery record *(history)*'));
  }
  const history = run(['-p', 'debug', '-s', 'docs/documentation-audit.md']);
  check('Explicit historical source retains history label', history.status === 0 && readFileSync(out,'utf8').includes('`docs/documentation-audit.md` *(history)*'));
  const failure = (label, args, env = process.env) => {
    writeFileSync(out, 'PREVIOUS COMPLETE PACK');
    const result = run(args, env);
    check(label + ': explicit failure', result.status !== 0 && result.stderr.trim().length > 0);
    check(label + ': previous output preserved', readFileSync(out,'utf8') === 'PREVIOUS COMPLETE PACK');
    check(label + ': no partial sibling', !readdirSync(scratch).some(name => name.startsWith('pack.md.tmp.')));
  };
  failure('Missing requested source', ['-p','debug','-s','missing.ts']);
  failure('Ignored-source profile rejected', ['-p','arch','-s','README.md']);
  failure('Credential source rejected', ['-p','debug','-s','.dev.vars']);
  renameSync(resolve(scratch,'docs/architecture.md'), resolve(scratch,'architecture-backup'));
  failure('Missing required document', ['-p','arch']);
  renameSync(resolve(scratch,'architecture-backup'), resolve(scratch,'docs/architecture.md'));
  renameSync(resolve(scratch,'migrations'), resolve(scratch,'migrations-backup'));
  failure('Empty required inventory', ['-p','arch']);
  renameSync(resolve(scratch,'migrations-backup'), resolve(scratch,'migrations'));
  put('bad-bin/ls', '#!/bin/sh\nexit 17\n', 0o755);
  failure('Required extraction failure', ['-p','arch'], { ...process.env, PATH: resolve(scratch,'bad-bin') + ':' + process.env.PATH });
  const git = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  put('optional-bin/git', `#!/bin/sh\nif [ "$1" = log ]; then exit 23; fi\nexec "${git}" "$@"\n`, 0o755);
  const optional = run(['-p','arch'], { ...process.env, PATH: resolve(scratch,'optional-bin') + ':' + process.env.PATH });
  check('Optional history failure warns and marks incomplete section', optional.status === 0 && optional.stderr.includes('WARNING: context section unavailable') && readFileSync(out,'utf8').includes('[unavailable: command failed'));
  const argument = spawnSync('bash', ['scripts/context-pack.sh','-p'], { cwd: scratch, encoding: 'utf8' });
  check('Missing option value is named', argument.status !== 0 && argument.stderr.includes('Missing value for -p'));
  console.log(`PASS context pack: ${checks} checks; synthetic checkout only.`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
