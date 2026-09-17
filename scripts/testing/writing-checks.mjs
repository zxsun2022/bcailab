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
