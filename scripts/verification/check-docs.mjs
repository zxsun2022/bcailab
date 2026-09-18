import { readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
// Bounded entry/operational/repaired docs; not an all-docs semantic audit.
const required = [
  'README.md', 'docs/README.md', 'docs/roadmap-accepted-history.md', 'docs/documentation-audit.md',
  'docs/architecture.md', 'docs/design-system.md', 'docs/tools/writing.md', 'docs/external-consultation.md',
  'AGENTS.md', 'docs/roadmap.md', 'docs/changelog.md', 'docs/verification.md', 'docs/workflow.md',
  'scripts/testing/README.md', 'package.json', 'pnpm-lock.yaml', 'vitest.config.ts',
  'eslint.config.mjs', 'apps/web/tsconfig.json', 'apps/mapdown/tsconfig.json',
  'apps/mapdown/tsconfig.functions.json', 'scripts/testing/writing-reliability.mjs',
  'scripts/testing/home-reliability.mjs', 'scripts/testing/writing-checks.mjs'
];
let errors = 0;
const fail = message => { console.error(message); errors++; };
for (const file of required) {
  try { if (!statSync(resolve(root, file)).isFile()) fail(`Required file is not a file: ${file}`); }
  catch { fail(`Missing required verification input: ${file}`); }
}
const documents = ['README.md', 'AGENTS.md', 'docs/README.md', 'docs/roadmap.md',
  'docs/roadmap-accepted-history.md', 'docs/documentation-audit.md', 'docs/architecture.md',
  'docs/design-system.md', 'docs/tools/writing.md', 'docs/external-consultation.md',
  'docs/verification.md', 'docs/workflow.md', 'scripts/testing/README.md'];
const roles = {
  'docs/README.md': 'current-guidance',
  'docs/documentation-audit.md': 'historical-evidence',
  'docs/roadmap-accepted-history.md': 'historical-evidence'
};
for (const file of documents) {
  let markdown;
  try { markdown = readFileSync(resolve(root, file), 'utf8'); } catch { continue; }
  if (roles[file] && !markdown.includes(`**Document role:** ${roles[file]}`)) {
    fail(`Invalid or missing document role in ${file}: expected ${roles[file]}`);
  }
  // Standard inline Markdown links; skip examples in fenced code and external URLs/anchors.
  markdown = markdown.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '');
  for (const match of markdown.matchAll(/\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1].replace(/^<|>$/g, '');
    if (/^[a-z][a-z\d+.-]*:|^#/i.test(target)) continue;
    try {
      const path = decodeURIComponent(target.split(/[?#]/)[0]).replace(/:\d+$/, '');
      statSync(path.startsWith('/') ? resolve(root, '.' + path) : resolve(root, dirname(file), path));
    } catch { fail(`Broken local link in ${file}: ${target}`); }
  }
}
if (errors) process.exit(1);
console.log(`PASS docs: ${required.length} required inputs and inline local links in ${documents.length} scoped documents, and explicit role markers (anchors and prose not checked).`);
