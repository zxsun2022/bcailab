import assert from 'node:assert/strict';
/** Dictation practice time through real HTTP actions and migrated D1 (migration 0022). */
export async function checkDictation(server, root, runtime) {
  const checks = [];
  const check = (label, ok) => { assert.ok(ok, label); checks.push(label); };
  const db = runtime.env.DB;
  // A dedicated user, so the profile total starts from nothing and no other fixture moves.
  await db.prepare("INSERT INTO users(id,email,name) VALUES ('test-dictation','dictation@example.invalid','Dictation')").run();
  const auth = await server.ssrLoadModule(root + '/packages/auth/src/index.ts');
  const session = await auth.createSession(db, 'test-dictation');
  const cookie = (await auth.createSessionCookie(new Request('http://127.0.0.1:5191'), runtime.env, session.id)).split(';')[0];
  const route = encodeURIComponent('routes/dictation.$passageId');
  const post = async data => {
    const response = await fetch(`http://127.0.0.1:5191/dictation/b2?_data=${route}`, {
      method: 'POST', headers: { Cookie: cookie }, body: new URLSearchParams(data)
    });
    assert.equal(response.status, 200, `POST /dictation/b2 ${data._intent}`);
    return response.json();
  };
  const stored = async id => (await db.prepare('SELECT practice_seconds, status FROM dictation_attempts WHERE id = ?').bind(id).first());
  const profileSeconds = async () =>
    Number((await db.prepare("SELECT total_practice_seconds FROM esl_learner_profiles WHERE user_id = 'test-dictation'").first())?.total_practice_seconds ?? 0);
  // `progress` is what a resumed page would send — empty, because it has checked nothing yet.
  // The server must ignore it and merge into its own stored results instead.
  const sentence = (idx, practiceSeconds, attemptId = '', progress = '[]') =>
    post({ _intent: 'check', idx: String(idx), text: 'This is a synthetic sentence.', replays: '0', attemptId, progress, practiceSeconds: String(practiceSeconds) });

  const first = await sentence(0, 20);
  const attemptId = first.attemptId;
  check('A checked sentence stores the reported active time', (await stored(attemptId)).practice_seconds === 20);
  await sentence(0, 20, attemptId);
  check('A retried check does not add the same time again', (await stored(attemptId)).practice_seconds === 20);

  const load = await fetch(`http://127.0.0.1:5191/dictation/b2?_data=${route}`, { headers: { Cookie: cookie } });
  const resume = (await load.json()).resume;
  check('Resume hands the stored total back to the client', resume?.attemptId === attemptId && resume.practiceSeconds === 20);

  await sentence(1, 15, attemptId);
  check('A stale, lower total never reduces stored time', (await stored(attemptId)).practice_seconds === 20);
  await sentence(1, 45, attemptId);
  check('Resumed time continues from the stored total', (await stored(attemptId)).practice_seconds === 45);
  check('An unfinished attempt credits nothing to the profile', (await profileSeconds()) === 0);

  const answers = JSON.stringify(['This is a synthetic sentence.', 'This is a synthetic sentence.', 'This is a synthetic sentence.']);
  await post({ _intent: 'complete', attemptId, answers, replays: '[0,0,0]', practiceSeconds: '60' });
  const done = await stored(attemptId);
  check('Completion stores the final total', done.status === 'completed' && done.practice_seconds === 60);
  check('Completion credits the attempt total to the profile once', (await profileSeconds()) === 60);

  const second = await sentence(0, 5);
  await post({ _intent: 'complete', attemptId: second.attemptId, answers, replays: '[0,0,0]', practiceSeconds: '999999' });
  check('An implausible total is capped by passage length (3 sentences × 300s)', (await stored(second.attemptId)).practice_seconds === 900);
  check('The profile accumulates across attempts', (await profileSeconds()) === 960);

  // Resume regression: a page that resumes an attempt knows nothing about the sentences already
  // checked, and must not overwrite them (docs/tools/dictation.md, "Progress and resume").
  const resumed = await sentence(0, 5);
  const resumedId = resumed.attemptId;
  await sentence(1, 10, resumedId);
  const beforeResume = await db.prepare('SELECT sentence_results, sentences_done FROM dictation_attempts WHERE id = ?').bind(resumedId).first();
  check('Two sentences are stored before the resume', JSON.parse(beforeResume.sentence_results).length === 2 && beforeResume.sentences_done === 2);
  // A resumed page sends only the sentence it just checked.
  await sentence(2, 15, resumedId);
  const afterResume = await db.prepare('SELECT sentence_results, sentences_done FROM dictation_attempts WHERE id = ?').bind(resumedId).first();
  const kept = JSON.parse(afterResume.sentence_results);
  check('A check after a resume keeps the earlier sentences', kept.map(r => r.idx).join(',') === '0,1,2' && afterResume.sentences_done === 3);
  check('Resumed answers survive for the summary', kept.every(r => r.userText === 'This is a synthetic sentence.'));
  const reloaded = await fetch(`http://127.0.0.1:5191/dictation/b2?_data=${route}`, { headers: { Cookie: cookie } });
  const reloadedResume = (await reloaded.json()).resume;
  check('Resume returns every stored answer and position', reloadedResume?.sentencesDone === 3 && Object.keys(reloadedResume.answers).length === 3);
  await post({ _intent: 'complete', attemptId: resumedId, answers, replays: '[0,0,0]', practiceSeconds: '20' });

  // Re-checking one sentence replaces only that entry.
  const recheck = await sentence(0, 5);
  await sentence(1, 10, recheck.attemptId);
  await sentence(0, 12, recheck.attemptId);
  const afterRecheck = JSON.parse((await db.prepare('SELECT sentence_results FROM dictation_attempts WHERE id = ?').bind(recheck.attemptId).first()).sentence_results);
  check('Re-checking a sentence replaces only that entry', afterRecheck.map(r => r.idx).join(',') === '0,1');
  await post({ _intent: 'complete', attemptId: recheck.attemptId, answers, replays: '[0,0,0]', practiceSeconds: '20' });

  const anonymous = await fetch(`http://127.0.0.1:5191/dictation/b2?_data=${route}`, {
    method: 'POST', body: new URLSearchParams({ _intent: 'check', idx: '0', text: 'x', replays: '0', attemptId: '', progress: '[]', practiceSeconds: '30' })
  });
  check('Anonymous practice stores no attempt and no time', anonymous.status === 200 && (await anonymous.json()).attemptId === null);
  return checks;
}
