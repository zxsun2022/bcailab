// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { parseWritingDraft, useWritingDraft, writingDraftKey } from "./use-writing-draft";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const stored = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => { stored.set(key, value); },
  removeItem: (key: string) => { stored.delete(key); },
  clear: () => stored.clear()
});
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
const initial = { coach: "general", startKey: "first-submit-key-12345", text: "Server text" };
async function mount(user = "a", seed = initial) {
  const root = createRoot(document.createElement("div"));
  let value!: ReturnType<typeof useWritingDraft>;
  function Harness({ text }: { text: string }) { value = useWritingDraft(user, "freeform", { ...seed, text }); return null; }
  await React.act(async () => root.render(React.createElement(Harness, { text: seed.text })));
  return { get value() { return value; }, rerender: async (text: string) => React.act(async () => root.render(React.createElement(Harness, { text }))), close: async () => React.act(async () => root.unmount()) };
}
it("restores text, topic, coach and submission identity after reload; isolates accounts", async () => {
  let a = await mount();
  await React.act(async () => a.value.update({ text: "Account A private draft", topic: "A topic", coach: "ielts_tutor" }));
  await a.close();
  const b = await mount("b"); expect(b.value.draft.text).toBe("Server text"); await b.close();
  a = await mount("a", { ...initial, startKey: "new-server-key-12345" });
  expect(a.value.draft).toMatchObject({ text: "Account A private draft", topic: "A topic", coach: "ielts_tutor", startKey: initial.startKey });
  await a.close();
});
it("does not overwrite dirty edits on loader revalidation and preserves failed submissions", async () => {
  const a = await mount();
  await React.act(async () => { a.value.update({ text: "Dirty edit" }); a.value.beginSubmit(); });
  await a.rerender("Server changed"); expect(a.value.draft.text).toBe("Dirty edit");
  await a.close();
  const restored = await mount(); expect(restored.value.draft.text).toBe("Dirty edit"); await restored.close();
});
it("clears only the submitted version and rotates the identity of subsequent edits", async () => {
  const a = await mount();
  await React.act(async () => { a.value.update({ text: "Submitted" }); a.value.beginSubmit(); a.value.update({ text: "Newer edit" }); a.value.completeSubmit(); });
  const kept = parseWritingDraft(localStorage.getItem(writingDraftKey("a", "freeform")), null);
  expect(kept?.text).toBe("Newer edit"); expect(kept?.startKey).not.toBe(initial.startKey);
  await a.close();
  const again = await mount();
  await React.act(async () => { again.value.beginSubmit(); again.value.completeSubmit(); });
  expect(localStorage.getItem(writingDraftKey("a", "freeform"))).toBeNull(); await again.close();
});
it("ignores legacy unscoped drafts and invalid or different-base records", async () => {
  localStorage.setItem("writing-topic-new", "Another user's topic");
  const a = await mount(); expect(a.value.draft.topic).toBe("");
  expect(parseWritingDraft(JSON.stringify(a.value.draft), "other-base")).toBeNull();
  expect(parseWritingDraft('{"version":1}', null)).toBeNull(); await a.close();
});
it("reports storage failure while retaining editable text in memory", async () => {
  vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
  const a = await mount(); expect(a.value.storageError).toBe(true);
  await React.act(async () => a.value.update({ text: "Still here" }));
  expect(a.value.draft.text).toBe("Still here"); expect(a.value.storageError).toBe(true); await a.close();
});
