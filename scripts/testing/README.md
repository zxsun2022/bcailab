# Writing and Home reliability fixtures

Run from the repository root with installed dependencies:

```sh
pnpm test:browser:fixture
```

This starts Remix on `127.0.0.1:5191`, a delayed fake model on port 5192, and a fresh
in-memory D1 with every real migration. It uses a temporary Wrangler configuration,
synthetic session secrets/accounts and no real model key or owner database. Stop with Ctrl-C.
All `/__test/` handlers belong to this test server, never to production routes.

## Browser checks

- Open `/__test/login?user=a`, then `/writing/retry-article`. Retry failed feedback;
  observe pending followed by the synthetic completed feedback without a render loop.
  `/__test/poll-count` stops increasing after completion.
- Type into `/writing/new`, refresh, and check text/topic. Switch through
  `/__test/login?user=b`: A's draft is absent. Switch back: A's draft returns.
- Open `/__test/lose-next-response`, submit the freeform draft, observe the injected error,
  refresh and retry. `/__test/counts` must show only one new article with one revision.
  This fixture replaces the first successful response with an error **after** the real action.
- Repeat refresh/return for `/writing/prompt/general-a2-study-invitation` and a new revision
  of the completed article. Successful submission removes the submitted local version.
  With unsent edits in `/writing/retry-article?compose=1`, open `/__test/advance-round`
  once: the server gains Round 2, while the earlier unsent draft returns with a recovery notice.
- As user B, `/english/home` must show B2 and Continue for `Fixture old-c2`, despite
  80 A1 passages and 50 more recent completed attempts. The query parameter
  `fixtureFailure=profile|history|library` injects an individual DB read failure.

## Automated D1/HTTP checks

To start, check and stop the fixture automatically:

```sh
pnpm test:integration
```

This runs the Home assertions below plus first-submit replay, account isolation and feedback
generation checks through actual HTTP actions. It uses the same fake model and fresh D1, exits
nonzero on failure and removes its temporary configuration. `verify:web` and `verify` include it.
See [verification scope](../../docs/verification.md) for prerequisites and remaining manual checks.

With the fixture running:

```sh
curl --fail http://127.0.0.1:5191/__test/home-checks
```

The endpoint asserts row/read budgets, eligibility, normal Home output, the three failure
paths, anonymous redirect and preserved authentication errors, using actual migrated D1.
Failures return HTTP 500. React/draft/selection regressions run under `pnpm test`.

## Evidence and limits

2026-09-17: browser retry, all three draft entries, account switching, lost-response retry
and Home normal/profile-degraded states were exercised. Initial document hydration warnings
were observed in the in-app browser; no update-depth loop occurred. Model output is synthetic;
these checks establish lifecycle and data behavior, not coaching quality or production deployment.
