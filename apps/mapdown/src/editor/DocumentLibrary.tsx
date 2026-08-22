import { useEffect, useRef, useState } from "react";
import { DOCUMENT_TITLE_MAX_LENGTH } from "../storage/library";
import type { DocumentIndexEntry } from "../storage/store";
import type { CloudDocumentSummary, CloudUser } from "../cloud/types";

export type DocumentLibraryState = "loading" | "ready" | "unavailable";
export type CloudLibraryState = "loading" | "signed-out" | "ready" | "unavailable";

export function isOnlineCopyCurrent(
  entry: DocumentIndexEntry,
  cloudDocument: CloudDocumentSummary | null,
  cloudState: CloudLibraryState
): boolean {
  if (
    !entry.cloudDocumentId ||
    !entry.cloudVersion ||
    entry.cloudSavedSnapshotId !== entry.lastSnapshotId
  ) return false;
  return cloudState === "ready"
    ? entry.cloudVersion === cloudDocument?.version
    : true;
}

interface DocumentLibraryProps {
  state: DocumentLibraryState;
  entries: DocumentIndexEntry[];
  activeDocumentId: string;
  unavailableMessage: string | null;
  undoTitle: string | null;
  cloudState: CloudLibraryState;
  cloudUser: CloudUser | null;
  cloudDocuments: CloudDocumentSummary[];
  onClose: () => void;
  onNew: () => Promise<void>;
  onOpen: (documentId: string) => Promise<void>;
  onRename: (documentId: string, title: string) => Promise<void>;
  onDuplicate: (documentId: string) => Promise<void>;
  onDelete: (documentId: string) => Promise<void>;
  onUndoDelete: () => Promise<void>;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onRetryCloud: () => Promise<void>;
  onSaveOnline: (localDocumentId: string) => Promise<void>;
  onOpenOnline: (cloudDocumentId: string) => Promise<void>;
  onDeleteOnline: (cloudDocumentId: string) => Promise<void>;
  onPublish: (localDocumentId: string) => Promise<void>;
  onUnpublish: (localDocumentId: string) => Promise<void>;
  onCopyPublishedLink: (url: string) => Promise<void>;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short"
});

export function DocumentLibrary({
  state,
  entries,
  activeDocumentId,
  unavailableMessage,
  undoTitle,
  cloudState,
  cloudUser,
  cloudDocuments,
  onClose,
  onNew,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onUndoDelete,
  onSignIn,
  onSignOut,
  onRetryCloud,
  onSaveOnline,
  onOpenOnline,
  onDeleteOnline,
  onPublish,
  onUnpublish,
  onCopyPublishedLink
}: DocumentLibraryProps) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (renamingId) renameRef.current?.focus();
  }, [renamingId]);

  useEffect(() => {
    if (confirmDeleteId) cancelDeleteRef.current?.focus();
  }, [confirmDeleteId]);

  const run = async (key: string, action: () => Promise<void>) => {
    setPendingAction(key);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The local document action failed.");
    } finally {
      setPendingAction(null);
    }
  };

  const trapKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      if (confirmDeleteId) {
        setConfirmDeleteId(null);
      } else if (renamingId) {
        setRenamingId(null);
      } else {
        onClose();
      }
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [
      ...dialogRef.current!.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      )
    ];
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === headingRef.current)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="help-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="document-library"
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-library-title"
        aria-describedby="document-library-description"
        onKeyDownCapture={trapKeys}
      >
        <header className="document-library-header">
          <div>
            <h2 id="document-library-title" ref={headingRef} tabIndex={-1}>
              Documents
            </h2>
            <p id="document-library-description">
              Saved only in this browser. Export Markdown for a durable copy.
            </p>
          </div>
          <div className="document-library-header-actions">
            <button
              type="button"
              className="document-primary-action"
              disabled={state === "unavailable" || pendingAction !== null}
              onClick={() => void run("new", onNew)}
            >
              New map
            </button>
            <button type="button" onClick={onClose} aria-label="Close document library">
              Close
            </button>
          </div>
        </header>

        <section className="document-cloud-account" aria-label="Mapdown account">
          {cloudState === "loading" && <span>Checking online save…</span>}
          {cloudState === "signed-out" && (
            <>
              <span><strong>Local-first.</strong> Sign in only when you want to save a map online.</span>
              <button
                type="button"
                disabled={pendingAction !== null}
                onClick={() => void run("sign-in", onSignIn)}
              >
                Sign in
              </button>
            </>
          )}
          {cloudState === "ready" && cloudUser && (
            <>
              <span>
                <strong>{cloudUser.name || cloudUser.email}</strong>
                {cloudUser.name ? <small>{cloudUser.email}</small> : null}
              </span>
              <button
                type="button"
                disabled={pendingAction !== null}
                onClick={() => void run("sign-out", onSignOut)}
              >
                Sign out
              </button>
            </>
          )}
          {cloudState === "unavailable" && (
            <>
              <span>Online save is unavailable. Local maps are unaffected.</span>
              <button
                type="button"
                disabled={pendingAction !== null}
                onClick={() => void run("retry-cloud", onRetryCloud)}
              >
                Retry
              </button>
            </>
          )}
        </section>

        <p className="sr-only" role="status" aria-live="polite">
          {state === "ready"
            ? `${entries.length} local ${entries.length === 1 ? "document" : "documents"}`
            : ""}
        </p>

        {undoTitle && (
          <div className="document-library-undo" role="status">
            <span>Deleted “{undoTitle}” from this browser.</span>
            <button
              type="button"
              disabled={pendingAction !== null}
              onClick={() => void run("undo-delete", onUndoDelete)}
            >
              Undo delete
            </button>
          </div>
        )}

        {actionError && (
          <div className="document-library-error" role="alert">
            {actionError}
          </div>
        )}

        <div className="document-library-content">
          {state === "loading" && <p className="document-library-empty">Loading local documents…</p>}

          {state === "unavailable" && (
            <div className="document-library-empty">
              <strong>Local documents are unavailable</strong>
              <p>
                {unavailableMessage ??
                  "This browser would not open Mapdown storage. The current map still works in memory."}
              </p>
            </div>
          )}

          {state === "ready" && entries.length === 0 && (
            <div className="document-library-empty">
              <strong>No saved local documents</strong>
              <p>Create a map to start a document library in this browser.</p>
            </div>
          )}

          {state === "ready" && entries.length > 0 && (
            <ul className="document-list">
              {entries.map((entry) => {
                const isCurrent = entry.id === activeDocumentId;
                const cloudDocument = entry.cloudDocumentId
                  ? cloudDocuments.find((item) => item.id === entry.cloudDocumentId)
                  : null;
                const publication = cloudDocument?.publication ?? entry.cloudPublication ?? null;
                const onlineCurrent = isOnlineCopyCurrent(entry, cloudDocument ?? null, cloudState);
                const isRenaming = renamingId === entry.id;
                const isConfirmingDelete = confirmDeleteId === entry.id;
                const isBusy = pendingAction?.endsWith(entry.id) ?? false;
                return (
                  <li key={entry.id} className={isCurrent ? "is-current" : undefined}>
                    <div className="document-row-summary">
                      <div className="document-row-title">
                        <strong>{entry.title}</strong>
                        {isCurrent && <span className="document-current-badge">Current</span>}
                        <span className="document-cloud-badge" data-state={publication ? "published" : entry.cloudDocumentId ? "online" : "local"}>
                          {publication ? "Published" : entry.cloudDocumentId ? onlineCurrent ? "Saved online" : "Online changes pending" : "Local only"}
                        </span>
                      </div>
                      <p>
                        {entry.nodeCount.toLocaleString()} {entry.nodeCount === 1 ? "node" : "nodes"}
                        <span aria-hidden="true"> · </span>
                        <time dateTime={new Date(entry.updatedAt).toISOString()}>
                          {dateFormatter.format(entry.updatedAt)}
                        </time>
                      </p>
                      {entry.sourceFilename && <small>Opened from {entry.sourceFilename}</small>}
                    </div>

                    {isRenaming ? (
                      <form
                        className="document-rename-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void run(`rename-${entry.id}`, async () => {
                            await onRename(entry.id, renameValue);
                            setRenamingId(null);
                          });
                        }}
                      >
                        <label>
                          <span className="sr-only">New title for {entry.title}</span>
                          <input
                            ref={renameRef}
                            value={renameValue}
                            maxLength={DOCUMENT_TITLE_MAX_LENGTH}
                            onChange={(event) => setRenameValue(event.target.value)}
                          />
                        </label>
                        <button type="submit" disabled={isBusy}>Save title</button>
                        <button type="button" onClick={() => setRenamingId(null)}>Cancel</button>
                      </form>
                    ) : isConfirmingDelete ? (
                      <div className="document-delete-confirmation" role="group" aria-label={`Delete ${entry.title}?`}>
                        <span>Delete this map and its local recovery snapshots?</span>
                        <button
                          ref={cancelDeleteRef}
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="document-danger-action"
                          disabled={isBusy}
                          onClick={() =>
                            void run(`delete-${entry.id}`, async () => {
                              await onDelete(entry.id);
                              setConfirmDeleteId(null);
                            })
                          }
                        >
                          Delete map
                        </button>
                      </div>
                    ) : (
                      <div className="document-row-actions">
                        <button
                          type="button"
                          disabled={isCurrent || pendingAction !== null}
                          onClick={() => void run(`open-${entry.id}`, () => onOpen(entry.id))}
                        >
                          {isCurrent ? "Open now" : "Open"}
                        </button>
                        <button
                          type="button"
                          disabled={pendingAction !== null}
                          onClick={() => {
                            setRenameValue(entry.title);
                            setRenamingId(entry.id);
                            setConfirmDeleteId(null);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          disabled={pendingAction !== null}
                          onClick={() => void run(`duplicate-${entry.id}`, () => onDuplicate(entry.id))}
                        >
                          Duplicate
                        </button>
                        {cloudState === "ready" && (
                          <button
                            type="button"
                            disabled={onlineCurrent || pendingAction !== null}
                            onClick={() => void run(`cloud-save-${entry.id}`, () => onSaveOnline(entry.id))}
                          >
                            {entry.cloudDocumentId ? onlineCurrent ? "Online copy current" : "Save changes" : "Save online"}
                          </button>
                        )}
                        {cloudState === "ready" && entry.cloudDocumentId && (
                          <button
                            type="button"
                            disabled={pendingAction !== null}
                            onClick={() => void run(`publish-${entry.id}`, () => onPublish(entry.id))}
                          >
                            {publication ? "Update published" : "Publish"}
                          </button>
                        )}
                        {publication && (
                          <button
                            type="button"
                            disabled={pendingAction !== null}
                            onClick={() => void run(`copy-link-${entry.id}`, () => onCopyPublishedLink(publication.publicUrl))}
                          >
                            Copy link
                          </button>
                        )}
                        {cloudState === "ready" && publication && (
                          <button
                            type="button"
                            disabled={pendingAction !== null}
                            onClick={() => void run(`unpublish-${entry.id}`, () => onUnpublish(entry.id))}
                          >
                            Unpublish
                          </button>
                        )}
                        {cloudState === "ready" && entry.cloudDocumentId && (
                          <button
                            type="button"
                            disabled={pendingAction !== null}
                            onClick={() => void run(`delete-online-${entry.id}`, () => onDeleteOnline(entry.cloudDocumentId!))}
                          >
                            Delete online
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={pendingAction !== null}
                          onClick={() => {
                            setConfirmDeleteId(entry.id);
                            setRenamingId(null);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {cloudState === "ready" && cloudDocuments.some(
            (cloud) => !entries.some((entry) => entry.cloudDocumentId === cloud.id)
          ) && (
            <section className="online-only-documents" aria-labelledby="online-only-title">
              <div className="online-only-heading">
                <h3 id="online-only-title">Saved online</h3>
                <p>Open one to keep a local copy in this browser.</p>
              </div>
              <ul className="document-list">
                {cloudDocuments
                  .filter((cloud) => !entries.some((entry) => entry.cloudDocumentId === cloud.id))
                  .map((cloud) => (
                    <li key={cloud.id}>
                      <div className="document-row-summary">
                        <div className="document-row-title">
                          <strong>{cloud.title}</strong>
                          <span className="document-cloud-badge" data-state={cloud.publication ? "published" : "online"}>
                            {cloud.publication ? "Published · online only" : "Online only"}
                          </span>
                        </div>
                        <p>
                          {cloud.nodeCount.toLocaleString()} {cloud.nodeCount === 1 ? "node" : "nodes"}
                          <span aria-hidden="true"> · </span>
                          <time dateTime={new Date(cloud.updatedAt).toISOString()}>
                            {dateFormatter.format(cloud.updatedAt)}
                          </time>
                        </p>
                      </div>
                      <div className="document-row-actions">
                        <button
                          type="button"
                          disabled={pendingAction !== null}
                          onClick={() => void run(`open-cloud-${cloud.id}`, () => onOpenOnline(cloud.id))}
                        >
                          Open in this browser
                        </button>
                        {cloud.publication && (
                          <button
                            type="button"
                            disabled={pendingAction !== null}
                            onClick={() => void run(`copy-cloud-link-${cloud.id}`, () => onCopyPublishedLink(cloud.publication!.publicUrl))}
                          >
                            Copy link
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={pendingAction !== null}
                          onClick={() => void run(`delete-cloud-${cloud.id}`, () => onDeleteOnline(cloud.id))}
                        >
                          Delete online
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
