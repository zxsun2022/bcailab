# Writing prompt editorial pipeline

`prompts.source.json` is the canonical source for the first Writing material batch. IELTS
Academic Task 1 facts, visual assets, accessible descriptions, and evaluation context all derive
from the same material object.

## Safe review flow

```sh
pnpm writing-prompts validate
pnpm writing-prompts derive --check
pnpm writing-prompts review-pack --check
pnpm writing-prompts preflight
```

These commands are read-only and do not contact D1. `derive --write` refreshes the committed
generated JSON and content-addressed SVG files. `review-pack --write` refreshes the committed
pending review manifest.

Publication is intentionally blocked until a separate approval file records both an independent
content review and owner review of the exact current batch hash:

```json
{
  "schemaVersion": 1,
  "batchHash": "<current review-pack batchHash>",
  "independentReview": {
    "status": "passed",
    "reviewer": "<name>",
    "reviewedAt": "<ISO timestamp>"
  },
  "ownerReview": {
    "status": "approved",
    "ownerApprovedHash": "<same batchHash>",
    "reviewer": "<owner name>",
    "reviewedAt": "<ISO timestamp>"
  }
}
```

Then run a target-explicit command. Remote publication has an additional typed batch-hash guard:

```sh
pnpm writing-prompts preflight --local
pnpm writing-prompts publish --local --owner-manifest <approval.json>
pnpm writing-prompts verify --local

pnpm writing-prompts preflight --remote
pnpm writing-prompts publish --remote --owner-manifest <approval.json> --confirm-remote <batchHash>
pnpm writing-prompts verify --remote
```

The publish operation is one multi-row SQLite statement, so a constraint or identity conflict
cannot leave a partially published batch. Re-running the same reviewed batch is idempotent.
