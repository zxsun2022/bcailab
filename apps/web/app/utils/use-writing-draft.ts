import * as React from "react";

export type WritingDraft = {
  version: 1;
  text: string;
  topic: string;
  coach: string;
  baseRevision: string | null;
  startKey: string;
  updatedAt: string;
  editId: string;
};
export function writingDraftKey(userId: string, scope: string) {
  return `writing-draft:v1:${encodeURIComponent(userId)}:${encodeURIComponent(scope)}`;
}
export function parseWritingDraft(raw: string | null, baseRevision: string | null | undefined): WritingDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as WritingDraft;
    return d.version === 1 && (d.baseRevision === null || typeof d.baseRevision === "string") &&
      (baseRevision === undefined || d.baseRevision === baseRevision) &&
      [d.text, d.topic, d.coach, d.startKey, d.updatedAt, d.editId].every(v => typeof v === "string") &&
      d.startKey.length >= 16 && d.startKey.length <= 200 ? d : null;
  } catch { return null; }
}

/** Mount with a key matching user/scope. Writes are synchronous with edits, before submission. */
export function useWritingDraft(userId: string, scope: string, initial: {
  text?: string; topic?: string; coach: string; startKey: string; baseRevision?: string | null;
  restoreEarlierBase?: boolean; persistInitial?: boolean;
}) {
  const { restoreEarlierBase = false, persistInitial = true } = initial;
  const key = writingDraftKey(userId, scope);
  const [draft, setDraft] = React.useState<WritingDraft>(() => ({
    version: 1, text: initial.text ?? "", topic: initial.topic ?? "", coach: initial.coach,
    baseRevision: initial.baseRevision ?? null, startKey: initial.startKey, updatedAt: "", editId: ""
  }));
  const current = React.useRef(draft);
  const submitted = React.useRef<WritingDraft | null>(null);
  const [ready, setReady] = React.useState(false);
  const [storageError, setStorageError] = React.useState(false);
  const persist = React.useCallback((value: WritingDraft) => {
    try { localStorage.setItem(key, JSON.stringify(value)); setStorageError(false); }
    catch { setStorageError(true); }
  }, [key]);
  React.useEffect(() => {
    try {
      const stored = parseWritingDraft(localStorage.getItem(key), restoreEarlierBase ? undefined : current.current.baseRevision);
      if (stored) { current.current = stored; setDraft(stored); }
      else if (persistInitial) persist(current.current);
    } catch { setStorageError(true); }
    setReady(true);
  }, [key, persist, restoreEarlierBase, persistInitial]);
  const update = React.useCallback((patch: Partial<Pick<WritingDraft, "text" | "topic" | "coach">>) => {
    const next = { ...current.current, ...patch, updatedAt: new Date().toISOString(), editId: crypto.randomUUID() };
    current.current = next; setDraft(next); persist(next);
  }, [persist]);
  const beginSubmit = React.useCallback(() => {
    submitted.current = { ...current.current };
    persist(current.current);
  }, [persist]);
  const completeSubmit = React.useCallback(() => {
    const sent = submitted.current;
    if (!sent) return;
    submitted.current = null;
    try {
      const stored = parseWritingDraft(localStorage.getItem(key), sent.baseRevision);
      // Never remove a newer edit, including one written by another tab.
      if (stored?.editId === sent.editId && stored.startKey === sent.startKey) localStorage.removeItem(key);
      else if (stored?.startKey === sent.startKey) {
        localStorage.setItem(key, JSON.stringify({ ...stored, startKey: crypto.randomUUID() }));
      }
    } catch { setStorageError(true); }
  }, [key]);
  return { draft, update, ready, storageError, beginSubmit, completeSubmit };
}
