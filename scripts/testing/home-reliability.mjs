/** Invoked by the isolated Writing/Home fixture; every query uses real migrated D1. */
import assert from 'node:assert/strict';
export async function seedHome(db) {
  const passages = [
    ...Array.from({ length: 80 }, (_, i) => [`a1-${i}`, 'A1', 'published', null]),
    ['b1', 'B1', 'published', null], ['b2', 'B2', 'published', null],
    ['c1', 'C1', 'published', null], ['old-c2', 'C2', 'published', null],
    ['withdrawn', 'C2', 'retired', null], ['foreign', 'B2', 'published', 'test-a']
  ];
  for (const [id, band, status, owner] of passages) await db.batch([
    db.prepare("INSERT INTO passages(id,title,content_text,band,topic,has_sentence_audio,sentence_count,status,user_id) VALUES (?,?,'Synthetic fixture',?,'test',1,3,?,?)").bind(id, 'Fixture ' + id, band, status, owner),
    db.prepare("INSERT INTO dictation_passages(id,band,topic,title,voice_name,sentence_count) VALUES (?,?,'test',?,'test',3)").bind(id, band, id)
  ]);
  await db.prepare("INSERT INTO esl_learner_profiles(id,user_id,cefr_declared,total_attempts) VALUES ('home-profile','test-b','B2',50)").run();
  for (let i = 0; i < 50; i++) await db.prepare("INSERT INTO dictation_attempts(id,user_id,passage_id,accuracy,sentence_results,status,sentences_done,created_at) VALUES (?,'test-b','a1-0',0.8,'[]','completed',3,?)").bind('completed-' + i, `2026-08-${String(i % 28 + 1).padStart(2,'0')} 00:00:00`).run();
  for (const [id, passage, user, deleted] of [
    ['old-attempt','old-c2','test-b',null], ['withdrawn-attempt','withdrawn','test-b',null],
    ['foreign-attempt','foreign','test-b',null], ['deleted-attempt','b2','test-b','2026-09-01'],
    ['other-user-attempt','b2','test-a',null]
  ]) await db.prepare("INSERT INTO dictation_attempts(id,user_id,passage_id,accuracy,sentence_results,status,sentences_done,created_at,deleted_at) VALUES (?,?,?,0.5,'[]','in_progress',1,?,?)").bind(id,user,passage,id === 'old-attempt' ? '2026-01-01 00:00:00' : '2026-09-01 00:00:00',deleted).run();
}
export function faultDb(db, source, counted) {
  return new Proxy(db, { get(target, prop) {
    if (prop === 'prepare') return sql => {
      counted?.push(sql);
      const match = source === 'profile' ? /FROM esl_learner_profiles/i.test(sql)
        : source === 'history' ? /FROM dictation_attempts/i.test(sql)
        : source === 'library' ? /ROW_NUMBER/i.test(sql)
        : source === 'auth' ? /FROM sessions/i.test(sql) : false;
      if (match) throw new Error('Synthetic ' + source + ' failure');
      return target.prepare(sql);
    };
    const value = target[prop]; return typeof value === 'function' ? value.bind(target) : value;
  } });
}
export async function checkHome(server, root, runtime) {
  const checks = [];
  const check = (label, condition) => { assert.ok(condition, label); checks.push(label); };
  const helpers = await server.ssrLoadModule(root + '/packages/db/src/index.ts');
  const db = runtime.env.DB;
  const candidates = await helpers.listHomeCandidates(db, ['B1','B2','C1']);
  check('B2 survives eighty lower-band passages', candidates.some(p => p.id === 'b2'));
  check('Candidate row budget and ownership', candidates.length <= 60 && !candidates.some(p => p.id === 'foreign'));
  const capped = await helpers.listHomeCandidates(db, ['A1','B1','B2']);
  check('Per-band cap is twenty', capped.filter(p => p.band === 'A1').length === 20);
  const resume = await helpers.getHomeResumableDictation(db, 'test-b');
  check('Resume ignores history window, deleted, foreign and withdrawn rows', resume?.id === 'old-attempt');
  const references = await helpers.listHomeRecordPassages(db, ['old-c2','withdrawn','foreign']);
  check('Record lookup checks publication independently', references.length === 1 && references[0].id === 'old-c2');
  const auth = await server.ssrLoadModule(root + '/packages/auth/src/index.ts');
  const session = await auth.createSession(db, 'test-b');
  const cookie = (await auth.createSessionCookie(new Request('http://127.0.0.1:5191'), runtime.env, session.id)).split(';')[0];
  // HTTP requests exercise Remix, authentication, the loader and real D1 together.
  for (const source of ['', 'profile', 'history', 'library']) {
    const response = await fetch('http://127.0.0.1:5191/english/home?_data=routes%2Fenglish_.home&fixtureFailure=' + source, { headers: { Cookie: cookie } });
    check('HTTP Home returns 200: ' + (source || 'normal'), response.status === 200);
    const data = await response.json();
    if (!source) {
      check('Home recommends B2', data.practice.recommendations[0]?.band === 'B2');
      check('Home resumes older C2 work', data.practice.continueAction?.passageId === 'old-c2');
    } else {
      check('Failure is visible: ' + source, data.degraded);
      if (source === 'profile') check('Missing profile remains unknown', data.level === null && data.profileUnavailable);
      if (source === 'history') check('Incomplete history suppresses fresh-material claims', data.practice.recommendations.length === 0);
      if (source === 'library') check('Library failure retains independent Continue', data.practice.continueAction?.passageId === 'old-c2');
    }
  }
  const home = await server.ssrLoadModule(root + '/apps/web/app/routes/english_.home.tsx');
  const queries = [];
  await home.loader({ request: new Request('http://127.0.0.1:5191/english/home', { headers: { Cookie: cookie } }), params: {}, context: { ...runtime, env: { ...runtime.env, DB: faultDb(db, '', queries) } } });
  const productQueries = queries.filter(sql => /passages|attempts|writing_articles|learner_profiles/.test(sql));
  check('Home uses seven bounded product reads', productQueries.length === 7);
  const guest = await fetch('http://127.0.0.1:5191/english/home', { redirect: 'manual' });
  check('Anonymous authentication still redirects', guest.status === 302);
  const authFailure = await fetch('http://127.0.0.1:5191/english/home?fixtureFailure=auth', { headers: { Cookie: cookie }, redirect: 'manual' });
  check('Authentication DB error is not swallowed as personalisation', authFailure.status >= 500);
  return checks;
}
