/** Isolated, synthetic browser fixture. Run from repo: node --import tsx scripts/testing/writing-reliability.mjs */
import { readFile, readdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from '../../apps/web/node_modules/vite/dist/node/index.js';
import remixDev from '../../apps/web/node_modules/@remix-run/dev/dist/index.js';
import wrangler from '../../node_modules/wrangler/wrangler-dist/cli.js';
import { checkWriting, checkPractice } from './writing-checks.mjs';
import { checkDictation } from './dictation-checks.mjs';
import { checkReading } from './reading-checks.mjs';
import { seedHome, faultDb, checkHome } from './home-reliability.mjs';
import baseConfig from '../../apps/web/vite.config.ts';
const root = resolve(import.meta.dirname, '../..');
const scratch = await mkdtemp(tmpdir() + '/bcailab-reliability-');
await writeFile(scratch + '/vite.mjs', 'export default {};');
await writeFile(scratch + '/wrangler.toml', `name = "reliability-test"
compatibility_date = "2025-01-01"
[[d1_databases]]
binding = "DB"
database_name = "test"
database_id = "00000000-0000-0000-0000-000000000000"
[[r2_buckets]]
binding = "R2"
bucket_name = "test"
`);
const feedback = { annotations: [], round_summary: { critical_count: 0, improvement_count: 0, strengths_count: 0, overall_comment: 'Synthetic feedback completed.', band_estimate: 'B1' }, delta: null };
// Reading evaluation requests only (identified by the Reading prompt's opening line), so other
// model calls — the learner-model naming pass, Writing feedback — do not blur the count.
let readingEvalCalls = 0;
// Writing practice (targeted practice after feedback): a deterministic stand-in for the judge
// and the situation writer. An answer containing " for " is right; "FAILMODEL" makes the call fail.
const practiceReply = prompt => {
  if (prompt.startsWith('You write one short practice task')) return { situation: 'Say in one sentence how long your friend has lived in her flat (six months).' };
  const answer = prompt.split("## Learner's answer\n").pop() ?? '';
  const acceptable = / for /i.test(answer);
  return { acceptable, reason: acceptable ? 'Right: "for" goes with a length of time.' : 'Not yet: a length of time needs "for".', reference: 'I have lived here for three years.' };
};
let practiceCalls = 0;
const model = createHttpServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  if (body.includes('professional English reading and recitation coach')) readingEvalCalls++;
  const prompt = JSON.parse(body || '{}').contents?.[0]?.parts?.[0]?.text ?? '';
  if (prompt.startsWith('You check one short practice answer') || prompt.startsWith('You write one short practice task')) {
    practiceCalls++;
    if (prompt.includes('FAILMODEL')) { res.statusCode = 500; res.end('synthetic failure'); return; }
    setTimeout(() => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(practiceReply(prompt)) }] } }] })); }, 300);
    return;
  }
  setTimeout(() => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(feedback) }] } }] })); }, 4000);
});
// A completed round with one practisable problem, one whose quote is not in the text, and a strength.
const practiceFeedback = { annotations: [
  { severity: 'critical', dimension: 'grammar', quoted_text: 'I have been here since three years.', diagnosis: 'Use "for" with a length of time, and "since" with a starting point.', guiding_question: 'Is "three years" a starting point or a length of time?' },
  { severity: 'improvement', dimension: 'vocabulary', quoted_text: 'a sentence that is not in the draft', diagnosis: 'Synthetic: its quote is missing, so it cannot be practised.', guiding_question: 'Which word is more precise?' },
  { severity: 'strength', dimension: 'coherence', quoted_text: 'My city is small but friendly.', diagnosis: 'Clear topic sentence.', guiding_question: '' }
], round_summary: { critical_count: 1, improvement_count: 1, strengths_count: 1, overall_comment: 'Synthetic practice round.', band_estimate: 'B1' }, delta: null };
let runtime, initialization;
const background = new Set();
let loseNextResponse = false;
let statusRequests = 0;
async function initialize(env) {
  runtime = { env: { ...env, SESSION_SECRET: 'synthetic-fixture-only', GEMINI_API_KEY: 'fake', GEMINI_BASE_URL: 'http://127.0.0.1:5192' }, ctx: { waitUntil(p) { const tracked = p.catch(console.error).finally(() => background.delete(tracked)); background.add(tracked); } } };
  const db = runtime.env.DB;
  for (const file of (await readdir(root + '/migrations')).filter(f => f.endsWith('.sql')).sort()) {
    await db.batch(wrangler.unstable_splitSqlQuery(await readFile(root + '/migrations/' + file, 'utf8')).map(s => db.prepare(s)));
  }
  await db.batch([
    db.prepare("INSERT INTO users(id,email,name) VALUES ('test-a','a@example.invalid','Test A'),('test-b','b@example.invalid','Test B'),('test-cold','cold@example.invalid','Cold'),('test-recommend','recommend@example.invalid','Recommend')"),
    db.prepare("INSERT INTO writing_articles(id,user_id,agent_type,title) VALUES ('retry-article','test-a','general','Retry fixture')"),
    db.prepare("INSERT INTO writing_revisions(id,article_id,user_id,round_number,user_text,word_count,feedback_status) VALUES ('retry-round','retry-article','test-a',1,'This is a synthetic draft with enough words to exercise the writing feedback flow.',15,'failed')"),
    db.prepare("INSERT INTO writing_articles(id,user_id,agent_type,title) VALUES ('practice-article','test-a','general','Practice fixture')"),
    db.prepare("INSERT INTO writing_revisions(id,article_id,user_id,round_number,user_text,word_count,feedback_status,feedback_json) VALUES ('practice-round','practice-article','test-a',1,'I have been here since three years. My city is small but friendly.',13,'completed',?)").bind(JSON.stringify(practiceFeedback))
  ]);
  await seedHome(db);
  await db.prepare("INSERT INTO esl_learner_profiles(id,user_id,cefr_declared,total_attempts) VALUES ('recommend-profile','test-recommend','B2',1)").run();
  await db.prepare("UPDATE passages SET title=? WHERE id='a1-0'").bind('A long recent practice title about planning a journey together and deciding what to bring when the weather changes').run();
  for (const passage of ['old-c2','b2']) for (let idx = 0; idx < 3; idx++) {
    await db.prepare('INSERT INTO passage_sentences(id,passage_id,idx,text) VALUES (?,?,?,?)').bind(`${passage}-sentence-${idx}`,passage,idx,'This is a synthetic sentence.').run();
  }
  const prompt = JSON.parse(await readFile(root + '/scripts/writing-prompt-seed/generated/prompts.generated.json', 'utf8'))[0];
  await db.prepare(`INSERT INTO writing_prompts(id,slug,family,task_type,prompt_kind,cefr_band,title,prompt_text,coach_id,topic,target_words,target_minutes,content_hash,review_manifest_json,owner_approved_hash,status,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'{}',?,'published',datetime('now'))`).bind(prompt.id,prompt.slug,prompt.family,prompt.taskType,prompt.promptKind,prompt.cefrBand,prompt.title,prompt.promptText,prompt.coachId,prompt.topic,prompt.targetWords,prompt.targetMinutes,prompt.contentHash,prompt.contentHash).run();

}
const proxy = remixDev.cloudflareDevProxyVitePlugin({ configPath: scratch + '/wrangler.toml', persist: false, remoteBindings: false, async getLoadContext({ request, context }) {
  initialization ??= initialize(context.cloudflare.env); await initialization;
  const source = new URL(request.url).searchParams.get('fixtureFailure');
  return source ? { ...runtime, env: { ...runtime.env, DB: faultDb(runtime.env.DB, source) } } : runtime;
} });
const fixture = { name: 'synthetic-fixture', configureServer(server) {
  server.middlewares.use(async (req, res, next) => {
    if (req.url?.startsWith('/writing/') && req.url.includes('/status')) statusRequests++;
    if (loseNextResponse && req.method === 'POST' && req.url?.startsWith('/writing/new')) {
      loseNextResponse = false;
      const end = res.end.bind(res);
      res.write = () => true;
      res.end = () => { res.statusCode = 503; res.removeHeader('Content-Length'); res.setHeader('Content-Type','application/json'); return end(JSON.stringify({ error: 'Synthetic lost success response. Refresh and retry.' })); };
      return next();
    }
    if (!req.url?.startsWith('/__test/')) return next();
    try {
      await initialization;
      if (!runtime) { res.statusCode = 503; res.end('Open /writing/new first to initialize.'); return; }
      const url = new URL(req.url, 'http://127.0.0.1:5191');
      if (url.pathname === '/__test/login') {
        const users = { a: 'test-a', b: 'test-b', cold: 'test-cold', recommend: 'test-recommend' };
        const user = users[url.searchParams.get('user')] ?? 'test-a';
        const auth = await server.ssrLoadModule(root + '/packages/auth/src/index.ts');
        const session = await auth.createSession(runtime.env.DB, user);
        res.setHeader('Set-Cookie', await auth.createSessionCookie(new Request(url), runtime.env, session.id));
        res.statusCode = 302; res.setHeader('Location', '/writing/new'); res.end(); return;
      }
      if (url.pathname === '/__test/lose-next-response') { loseNextResponse = true; res.statusCode = 302; res.setHeader('Location', '/writing/new'); res.end(); return; }
      if (url.pathname === '/__test/practice-new-round') {
        const next = await runtime.env.DB.prepare("SELECT COALESCE(MAX(round_number), 0) + 1 AS n FROM writing_revisions WHERE article_id = 'practice-article'").first();
        await runtime.env.DB.prepare("INSERT INTO writing_revisions(id,article_id,user_id,round_number,user_text,word_count,feedback_status,feedback_json) SELECT ?, article_id, user_id, ?, user_text, word_count, 'completed', feedback_json FROM writing_revisions WHERE id = 'practice-round'").bind(`practice-round-${next.n}`, next.n).run();
        res.statusCode = 302; res.setHeader('Location', '/writing/practice-article'); res.end(); return;
      }
      if (url.pathname === '/__test/practice-calls') { res.setHeader('Content-Type','text/plain'); res.end(String(practiceCalls)); return; }
      if (url.pathname === '/__test/poll-count') { res.setHeader('Content-Type','text/plain'); res.end(String(statusRequests)); return; }
      if (url.pathname === '/__test/advance-round') {
        await runtime.env.DB.prepare("INSERT INTO writing_revisions(id,article_id,user_id,round_number,user_text,word_count,feedback_status,feedback_json) VALUES ('advanced-round','retry-article','test-a',2,'A new round saved in a different browser tab.',9,'completed',?)").bind(JSON.stringify(feedback)).run();
        res.statusCode = 302; res.setHeader('Location','/writing/retry-article?compose=1'); res.end(); return;
      }
      if (url.pathname === '/__test/home-checks') { const checks = await checkHome(server, root, runtime); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(checks)); return; }
      if (url.pathname === '/__test/counts') {
        const rows = await runtime.env.DB.prepare('SELECT article_id,COUNT(*) AS rounds FROM writing_revisions GROUP BY article_id').all();
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(rows.results)); return;
      }
      res.statusCode = 404; res.end();
    } catch (error) { res.statusCode = 500; res.end(String(error)); }
  });
} };
let server;
let exitCode = 0;
try {
  await new Promise((resolve, reject) => {
    model.once('error', reject);
    model.listen(5192, '127.0.0.1', () => { model.removeListener('error', reject); resolve(); });
  });
  server = await createServer({ ...baseConfig, root: root + '/apps/web', configFile: scratch + '/vite.mjs', plugins: [fixture, proxy, ...baseConfig.plugins.slice(1)], server: { host: '127.0.0.1', port: 5191, strictPort: true } });
  await server.listen();
  await fetch('http://127.0.0.1:5191/writing/new', { redirect: 'manual' });
  if (process.argv.includes('--check')) {
    const checks = [...await checkHome(server, root, runtime), ...await checkWriting(server, root, runtime, background), ...await checkPractice(server, root, runtime, () => practiceCalls), ...await checkDictation(server, root, runtime), ...await checkReading(server, root, runtime, background, () => readingEvalCalls)];
    console.log(`PASS D1/HTTP: ${checks.length} assertions on fresh migrated D1 and a fake model.`);
    checks.forEach(label => console.log('  PASS ' + label));
  } else {
    console.log('Browser fixture ready: http://127.0.0.1:5191/__test/login?user=a (manual checks; not a pass result)');
    await new Promise(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); });
  }
} catch (error) {
  console.error(error); exitCode = 1;
} finally {
  await server?.close();
  model.closeAllConnections();
  await new Promise(resolve => model.close(resolve));
  await rm(scratch, { recursive: true, force: true });
}
process.exit(exitCode);
