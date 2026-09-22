import assert from 'node:assert/strict';
/**
 * Reading evaluation runs (migration 0023) through real HTTP actions and migrated D1. The fake
 * model returns non-Reading JSON, so every run completes through the heuristic fallback — which is
 * what lets these checks count model calls and still see a stored result.
 */
export async function checkReading(server, root, runtime, background, modelCalls) {
  const checks = [];
  const check = (label, ok) => { assert.ok(ok, label); checks.push(label); };
  const db = runtime.env.DB;
  const base = 'http://127.0.0.1:5191';
  await db.prepare("INSERT INTO users(id,email,name) VALUES ('test-reading','reading@example.invalid','Reading')").run();
  const auth = await server.ssrLoadModule(root + '/packages/auth/src/index.ts');
  const dbModule = await server.ssrLoadModule(root + '/packages/db/src/index.ts');
  const session = await auth.createSession(db, 'test-reading');
  const cookie = (await auth.createSessionCookie(new Request(base), runtime.env, session.id)).split(';')[0];
  const settle = () => Promise.all([...background]);
  const route = encodeURIComponent('routes/reading.$id');

  // `b2` is a library passage (user_id NULL), the case the status route used to 404.
  const seedAttempt = async (id, { status = 'failed', startedAt = null, runId = null, age = '-10 minutes' } = {}) => {
    const key = `reading/test-reading/${id}.webm`;
    await runtime.env.R2.put(key, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    await db.prepare(`INSERT INTO esl_reading_attempts
        (id, passage_id, user_id, mode, audio_format, audio_mime_type, r2_key, audio_bytes, duration_ms,
         evaluation_status, evaluation_run_id, evaluation_started_at, created_at)
        VALUES (?, 'b2', 'test-reading', 'reading', 'webm', 'audio/webm', ?, 8, 12000, ?, ?, ?, datetime('now', ?))`)
      .bind(id, key, status, runId, startedAt, age).run();
  };
  const retry = (id, query = '') => fetch(`${base}/reading/b2${query ? `?${query}&` : '?'}_data=${route}`, {
    method: 'POST', headers: { Cookie: cookie },
    body: new URLSearchParams({ _intent: 'retryEvaluation', _transport: 'fetcher', attemptId: id, outputLanguage: 'en' })
  });
  const status = async id => {
    const response = await fetch(`${base}/reading/b2/status?attempt=${id}`, { headers: { Cookie: cookie, Accept: 'application/json' } });
    return { code: response.status, body: response.ok ? await response.json() : null };
  };
  const row = id => db.prepare('SELECT evaluation_status, evaluation_run_id, evaluation_started_at FROM esl_reading_attempts WHERE id = ?').bind(id).first();
  const evaluations = async id => Number((await db.prepare('SELECT COUNT(*) AS n FROM esl_reading_evaluations WHERE attempt_id = ?').bind(id).first()).n);
  const profileAttempts = async () => Number((await db.prepare("SELECT total_attempts FROM esl_learner_profiles WHERE user_id = 'test-reading'").first())?.total_attempts ?? 0);

  // Retry, then the page's own poll target shows the run waiting and then its result.
  await seedAttempt('retry-shows');
  const retried = await retry('retry-shows');
  check('Retry of a failed attempt is accepted', retried.status === 200 && (await retried.json()).ok === true);
  const waiting = await status('retry-shows');
  check('Library passage status resolves (was 404)', waiting.code === 200);
  check('A retried attempt created long ago is waiting, not stale', waiting.body?.selected?.evaluationStatus === 'pending' && waiting.body.selected.isStalePending === false && waiting.body.selected.canRetryEvaluation === false);
  await settle();
  const shown = await status('retry-shows');
  check('The retried result appears through the status poll', shown.body?.selected?.evaluationStatus === 'completed' && shown.body.selected.hasEvaluation === true);

  // Two retries at once: one claim, one model call, one stored result.
  await seedAttempt('retry-race');
  const callsBefore = modelCalls();
  const [first, second] = await Promise.all([retry('retry-race'), retry('retry-race')]);
  await settle();
  check('Both concurrent retries answer', first.status === 200 && second.status === 200);
  check('Two concurrent retries start exactly one model call', modelCalls() - callsBefore === 1);
  check('Two concurrent retries store exactly one evaluation', (await evaluations('retry-race')) === 1);

  // A run inside the stale window is waited for, not doubled.
  await seedAttempt('retry-running', { status: 'pending', runId: 'live-run', age: '-10 minutes' });
  await db.prepare("UPDATE esl_reading_attempts SET evaluation_started_at = datetime('now', '-5 seconds') WHERE id = 'retry-running'").run();
  const runningBefore = modelCalls();
  await retry('retry-running');
  await settle();
  check('Retry during a live run starts nothing', modelCalls() === runningBefore && (await row('retry-running')).evaluation_run_id === 'live-run');

  // A stored result is never re-run.
  await seedAttempt('retry-done', { status: 'completed' });
  await dbModule.saveEslReadingEvaluationResult(db, { attemptId: 'retry-done', userId: 'test-reading', modelName: 'seed', rubricVersion: 'seed', outputJson: '{"scores":{"overall":70}}' });
  const doneBefore = modelCalls();
  await retry('retry-done');
  await settle();
  check('Retry of a completed attempt starts nothing', modelCalls() === doneBefore && (await evaluations('retry-done')) === 1);

  // An old run cannot overwrite a newer run's state, and a second save stores nothing.
  await seedAttempt('stale-writer', { status: 'pending', runId: 'new-run', age: '-1 minutes' });
  const oldFailure = await dbModule.failEslReadingEvaluationRun(db, { attemptId: 'stale-writer', userId: 'test-reading', runId: 'old-run' });
  check('A superseded run cannot mark the attempt failed', oldFailure === false && (await row('stale-writer')).evaluation_status === 'pending');
  const stored = '{"scores":{"overall":70}}';
  const firstSave = await dbModule.saveEslReadingEvaluationResult(db, { attemptId: 'stale-writer', userId: 'test-reading', modelName: 'm', rubricVersion: 'r', outputJson: stored });
  const secondSave = await dbModule.saveEslReadingEvaluationResult(db, { attemptId: 'stale-writer', userId: 'test-reading', modelName: 'm', rubricVersion: 'r', outputJson: stored });
  check('Result and completed status are stored together, once', firstSave.saved && !secondSave.saved && secondSave.attemptExists && (await row('stale-writer')).evaluation_status === 'completed' && (await evaluations('stale-writer')) === 1);
  const lateFailure = await dbModule.failEslReadingEvaluationRun(db, { attemptId: 'stale-writer', userId: 'test-reading', runId: 'new-run' });
  check('A failure cannot overwrite a stored result', lateFailure === false && (await row('stale-writer')).evaluation_status === 'completed');

  // Side effects failing must not turn a stored result into a failure, nor count it.
  await seedAttempt('stats-fail');
  const attemptsBefore = await profileAttempts();
  await retry('stats-fail', 'fixtureFailure=reading-side-effects');
  await settle();
  const afterStats = await status('stats-fail');
  check('A failed statistics write leaves the evaluation completed', afterStats.body?.selected?.evaluationStatus === 'completed' && (await evaluations('stats-fail')) === 1);
  check('The failed statistics write was really injected', (await profileAttempts()) === attemptsBefore);

  // Submission claims the first run in the same insert that creates the attempt.
  const form = new FormData();
  form.set('_intent', 'submitAttempt');
  form.set('_transport', 'fetcher');
  form.set('mode', 'reading');
  form.set('outputLanguage', 'en');
  form.set('durationMs', '9000');
  form.set('audioFile', new Blob([new Uint8Array([9, 8, 7, 6])], { type: 'audio/webm' }), 'take.webm');
  const submitted = await fetch(`${base}/reading/b2?_data=${route}`, { method: 'POST', headers: { Cookie: cookie }, body: form });
  const redirectTo = submitted.ok ? (await submitted.json()).redirectTo : '';
  const submittedId = new URL(redirectTo || '/x?attempt=', base).searchParams.get('attempt');
  const submittedRow = submittedId ? await row(submittedId) : null;
  check('A submission owns its first run from the start', Boolean(submittedRow?.evaluation_run_id) && Boolean(submittedRow?.evaluation_started_at));
  // Retried straight away: the submission's run is inside the stale window, so the retry must not
  // claim the attempt. (Counting model calls would not show this: the synthetic history above makes
  // the prompt builder fall back before any model request.)
  await retry(submittedId);
  await settle();
  check('Retry right after submission starts no second run', (await row(submittedId)).evaluation_run_id === submittedRow.evaluation_run_id);
  check('The submitted attempt completes with one evaluation', (await row(submittedId)).evaluation_status === 'completed' && (await evaluations(submittedId)) === 1);
  return checks;
}
