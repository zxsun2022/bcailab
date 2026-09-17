// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { useWritingRetryResult, type WritingRetryResult } from "./use-writing-retry-result";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const retry: WritingRetryResult = { articleId: "a1", revisionId: "r1", generation: 2, startedAt: "2026-09-16 01:00:00" };
const containers: HTMLElement[] = [];
afterEach(() => { containers.splice(0).forEach(el => el.remove()); });

it("consumes a persistent successful response once without a render loop", async () => {
  const el = document.createElement("div"); containers.push(el);
  const root = createRoot(el);
  let updates = 0;
  function Harness() {
    const [revision, setRevision] = React.useState({ id: "r1", feedback_generation: 1 });
    useWritingRetryResult(retry, "a1", revision, result => {
      updates++;
      // Stop a broken implementation rather than hanging the test process.
      if (updates < 8) setRevision({ id: "r1", feedback_generation: result.generation });
    });
    return React.createElement("span", null, revision.feedback_generation);
  }
  await React.act(async () => { root.render(React.createElement(Harness)); });
  await React.act(async () => { root.unmount(); });
  expect(updates).toBe(1);
});

it("ignores foreign revisions and does not regress a completed generation", async () => {
  const el = document.createElement("div"); containers.push(el);
  const root = createRoot(el); let updates = 0;
  function Harness({ articleId, id, generation }: { articleId: string; id: string; generation: number }) {
    useWritingRetryResult(retry, articleId, { id, feedback_generation: generation }, () => { updates++; });
    return null;
  }
  for (const props of [
    { articleId: "a2", id: "r1", generation: 1 },
    { articleId: "a1", id: "r2", generation: 1 },
    { articleId: "a1", id: "r1", generation: 2 }
  ]) await React.act(async () => { root.render(React.createElement(Harness, { ...props, key: JSON.stringify(props) })); });
  await React.act(async () => { root.unmount(); });
  expect(updates).toBe(0);
});
