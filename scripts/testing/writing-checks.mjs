import assert from 'node:assert/strict';
/** Real HTTP actions + D1 constraints, with only the model replaced by the fixture. */
export async function checkWriting(server, root, runtime, background) {
  const checks = [];
  const check = (label, ok) => { assert.ok(ok, label); checks.push(label); };
  const db = runtime.env.DB;
  const auth = await server.ssrLoadModule(root + '/packages/auth/src/index.ts');
  const cookieFor = async user => {
    const session = await auth.createSession(db, user);
    return (await auth.createSessionCookie(new Request('http://127.0.0.1:5191'), runtime.env, session.id)).split(';')[0];
  };
  const cookie = await cookieFor('test-a');
  const post = async (path, route, data) => {
    const response = await fetch(`http://127.0.0.1:5191${path}?_data=${encodeURIComponent(route)}`, {
      method: 'POST', headers: { Cookie: cookie }, body: new URLSearchParams(data)
    });
    assert.equal(response.status, 200, `POST ${path}`);
    return response.json();
  };
  const fields = { _intent: 'createArticle', _transport: 'fetcher', agentType: 'general', startKey: 'integration-first-submit-key', userText: 'This synthetic draft contains enough words to exercise a complete first writing submission.' };
  const first = await post('/writing/new', 'routes/writing.new', fields);
  const replay = await post('/writing/new', 'routes/writing.new', fields);
  check('First-submit replay returns the same article', first.redirectTo === replay.redirectTo && !!first.redirectTo);
  const articleId = first.redirectTo.split('/').pop();
  const rows = await db.prepare('SELECT id,feedback_generation FROM writing_revisions WHERE article_id = ?').bind(articleId).all();
  check('First-submit replay creates exactly one Round 1', rows.results.length === 1);
  const foreign = await fetch(`http://127.0.0.1:5191${first.redirectTo}?_data=routes%2Fwriting.%24id`, { headers: { Cookie: await cookieFor('test-b') } });
  check('Another account cannot load the article', foreign.status === 404);
  await Promise.all([...background]);
  const retry = await post(first.redirectTo, 'routes/writing.$id', { _intent: 'retryFeedback', revisionId: rows.results[0].id });
  check('Retry returns generation and revision identity', retry.retry?.generation === 2 && retry.retry.revisionId === rows.results[0].id && retry.retry.articleId === articleId);
  await Promise.all([...background]);
  const status = await fetch(`http://127.0.0.1:5191${first.redirectTo}/status`, { headers: { Cookie: cookie } });
  const data = await status.json();
  check('Retried generation completes through real status resource', data.feedbackStatus === 'completed' && data.feedbackGeneration === 2);
  return checks;
}

/** Targeted practice after feedback, over real HTTP and D1 with the fixture's fake judge. */
export async function checkPractice(server, root, runtime, practiceCalls) {
  const checks = [];
  const check = (label, ok) => { assert.ok(ok, label); checks.push(label); };
  const db = runtime.env.DB;
  const auth = await server.ssrLoadModule(root + '/packages/auth/src/index.ts');
  const cookieFor = async user => {
    const session = await auth.createSession(db, user);
    return (await auth.createSessionCookie(new Request('http://127.0.0.1:5191'), runtime.env, session.id)).split(';')[0];
  };
  const cookie = await cookieFor('test-a');
  const practice = async (data, as = cookie) => {
    const response = await fetch('http://127.0.0.1:5191/writing/practice-article/practice?_data=routes%2Fwriting.%24id_.practice', {
      method: 'POST', headers: { Cookie: as }, body: new URLSearchParams(data)
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  const start = { _intent: 'start', revisionId: 'practice-round', annotationIndex: '0', feedbackLanguage: 'zh' };
  const observationCount = async () => (await db.prepare("SELECT COUNT(*) AS n FROM learner_tag_observations WHERE user_id = 'test-a'").first()).n;
  const observationsBefore = await observationCount();

  const detail = await fetch('http://127.0.0.1:5191/writing/practice-article?_data=routes%2Fwriting.%24id', { headers: { Cookie: cookie } });
  const loaded = await detail.json();
  check('Practice: the round loads with practice available and nothing started', loaded.practice?.available === true && loaded.practice.items.length === 0);

  const first = await practice(start);
  const again = await practice(start);
  const count = await db.prepare("SELECT COUNT(*) AS n FROM writing_practice_items WHERE revision_id = 'practice-round'").first();
  check('Practice: starting twice returns one item', first.status === 200 && again.body.item.id === first.body.item.id && count.n === 1);
  const itemId = first.body.item.id;
  check('Practice: a new item waits on step 1 with no reference', first.body.item.awaiting === 'fix' && Object.keys(first.body.item.references).length === 0);

  check('Practice: another account cannot touch the article', (await practice(start, await cookieFor('test-b'))).status === 404);
  check('Practice: a quote missing from the text cannot be practised', (await practice({ ...start, annotationIndex: '1' })).status === 409);
  check('Practice: a strength cannot be practised', (await practice({ ...start, annotationIndex: '2' })).status === 409);

  const callsBefore = practiceCalls();
  const failed = await practice({ _intent: 'answer', itemId, answer: 'FAILMODEL' });
  const afterFailure = await db.prepare('SELECT attempts_json, version FROM writing_practice_items WHERE id = ?').bind(itemId).first();
  check('Practice: a failed model call returns an error and changes nothing', failed.status === 502 && afterFailure.attempts_json === '[]' && afterFailure.version === 1 && practiceCalls() === callsBefore + 1);
  check('Practice: an empty answer is refused without a model call', (await practice({ _intent: 'answer', itemId, answer: '   ' })).status === 400 && practiceCalls() === callsBefore + 1);

  const wrong = await practice({ _intent: 'answer', itemId, answer: 'I have been here since three years.' });
  check('Practice: a wrong first answer keeps step 1 open and withholds the reference', wrong.body.item.awaiting === 'fix' && !wrong.body.item.attempts[0].acceptable && !JSON.stringify(wrong.body).includes('I have lived here for three years.'));
  const right = await practice({ _intent: 'answer', itemId, answer: 'I have been here for three years.' });
  check('Practice: a right answer ends step 1 and reveals its reference', right.body.item.awaiting === null && right.body.item.needsTransferPrompt && right.body.item.references.fix === 'I have lived here for three years.');
  check('Practice: a concluded step takes no further answer or call', (await practice({ _intent: 'answer', itemId, answer: 'for' })).status === 409 && practiceCalls() === callsBefore + 3);

  const transfer = await practice({ _intent: 'transfer', itemId });
  check('Practice: step 2 gets one generated situation', transfer.body.item.status === 'transfer' && transfer.body.item.transferPrompt.includes('six months') && practiceCalls() === callsBefore + 4);
  check('Practice: step 2 cannot be generated twice', (await practice({ _intent: 'transfer', itemId })).status === 409);
  const done = await practice({ _intent: 'answer', itemId, answer: 'She has lived in her flat for six months.' });
  const stored = await db.prepare('SELECT status, ended_at, attempts_json FROM writing_practice_items WHERE id = ?').bind(itemId).first();
  check('Practice: a right step-2 answer finishes the item and stores every attempt', done.body.item.status === 'finished' && stored.status === 'finished' && !!stored.ended_at && JSON.parse(stored.attempts_json).length === 3);
  check('Practice: a finished item cannot be skipped', (await practice({ _intent: 'skip', itemId })).status === 409);

  await db.prepare("INSERT INTO writing_revisions(id,article_id,user_id,round_number,user_text,word_count,feedback_status,feedback_json) SELECT 'practice-round-2','practice-article','test-a',2,user_text,word_count,'completed',feedback_json FROM writing_revisions WHERE id = 'practice-round'").run();
  const second = await practice({ ...start, revisionId: 'practice-round-2' });
  const disputed = await practice({ _intent: 'dispute', itemId: second.body.item.id });
  check('Practice: disputing ends an item as disputed', disputed.body.item.status === 'disputed');
  check('Practice: nothing is written as a measurement', await observationCount() === observationsBefore);
  return checks;
}
