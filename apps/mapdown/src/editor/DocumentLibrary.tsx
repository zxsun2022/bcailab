import { useEffect, useRef, useState } from "react";
import { DOCUMENT_TITLE_MAX_LENGTH } from "../storage/library";
import type { DocumentIndexEntry } from "../storage/store";
import type { CloudDocumentSummary, CloudPublication, CloudUser } from "../cloud/types";

export type DocumentLibraryState = "loading" | "ready" | "unavailable";
export type CloudLibraryState = "loading" | "signed-out" | "ready" | "unavailable";

type CloudConfirmation =
  | {
      kind: "publish";
      localDocumentId: string;
      title: string;
      nodeCount: number;
      updatesExisting: boolean;
    }
  | {
      kind: "unpublish";
      localDocumentId: string;
      title: string;
    }
  | {
      kind: "delete-online";
      cloudDocumentId: string;
      title: string;
      revokesPublication: boolean;
    };

export function cloudConfirmationCopy(confirmation: CloudConfirmation): string {
  if (confirmation.kind === "publish") {
    const nodeLabel = `${confirmation.nodeCount.toLocaleString()} ${
      confirmation.nodeCount === 1 ? "node" : "nodes"
    }`;
    return confirmation.updatesExisting
      ? `Save the current changes to the online copy, then replace the frozen public version of “${confirmation.title}” (${nodeLabel})? The public URL stays the same.`
      : `Save “${confirmation.title}” online, then publish a frozen public version (${nodeLabel})? Later edits stay private until you update the published version.`;
  }
  if (confirmation.kind === "unpublish") {
    return `Unpublish “${confirmation.title}”? Its current public URL will return 404 immediately. Publishing it again later creates a new URL.`;
  }
  return `Delete “${confirmation.title}” from online save?${confirmation.revokesPublication ? " Its public link will stop working immediately." : ""} Local copies in this browser will remain.`;
}

function cloudConfirmationKey(confirmation: CloudConfirmation): string {
  return confirmation.kind === "delete-online"
    ? `${confirmation.kind}-${confirmation.cloudDocumentId}`
    : `${confirmation.kind}-${confirmation.localDocumentId}`;
}

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
  onPublish: (localDocumentId: string) => Promise<CloudPublication>;
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
  const [cloudConfirmation, setCloudConfirmation] = useState<CloudConfirmation | null>(null);
  const [publicationResult, setPublicationResult] = useState<{
    title: string;
    publication: CloudPublication;
    updated: boolean;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const cancelCloudConfirmationRef = useRef<HTMLButtonElement>(null);
  const cloudConfirmationInvokerKeyRef = useRef<string | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (renamingId) renameRef.current?.focus();
  }, [renamingId]);

  useEffect(() => {
    if (confirmDeleteId) cancelDeleteRef.current?.focus();
  }, [confirmDeleteId]);

  useEffect(() => {
    if (cloudConfirmation) cancelCloudConfirmationRef.current?.focus();
  }, [cloudConfirmation]);

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

  const closeCloudConfirmation = () => {
    setCloudConfirmation(null);
    requestAnimationFrame(() => {
      const invokerKey = cloudConfirmationInvokerKeyRef.current;
      const invoker = [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>(
        "button[data-cloud-action]"
      ) ?? [])].find((button) => button.dataset.cloudAction === invokerKey);
      if (invoker && invoker.getClientRects().length > 0) invoker.focus();
      else headingRef.current?.focus();
      cloudConfirmationInvokerKeyRef.current = null;
    });
  };

  const beginCloudConfirmation = (confirmation: CloudConfirmation) => {
    cloudConfirmationInvokerKeyRef.current = cloudConfirmationKey(confirmation);
    setCloudConfirmation(confirmation);
    setConfirmDeleteId(null);
    setRenamingId(null);
    setActionError(null);
  };

  const executeCloudConfirmation = () => {
    const confirmation = cloudConfirmation;
    if (!confirmation) return;
    const id = confirmation.kind === "delete-online"
      ? confirmation.cloudDocumentId
      : confirmation.localDocumentId;
    void run(`confirm-${confirmation.kind}-${id}`, async () => {
      if (confirmation.kind === "publish") {
        const publication = await onPublish(confirmation.localDocumentId);
        setPublicationResult({
          title: confirmation.title,
          publication,
          updated: confirmation.updatesExisting
        });
      } else if (confirmation.kind === "unpublish") {
        await onUnpublish(confirmation.localDocumentId);
        setPublicationResult(null);
      } else {
        await onDeleteOnline(confirmation.cloudDocumentId);
        setPublicationResult(null);
      }
      closeCloudConfirmation();
    });
  };

  const trapKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      if (cloudConfirmation) {
        closeCloudConfirmation();
      } else if (confirmDeleteId) {
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

        {publicationResult && (
          <div className="document-library-result" role="status">
            <span>
              {publicationResult.updated ? "Updated" : "Published"} “{publicationResult.title}”. Public link:{" "}
              <a href={publicationResult.publication.publicUrl} target="_blank" rel="noreferrer">
                {publicationResult.publication.publicUrl}
              </a>
            </span>
            <button
              type="button"
              disabled={pendingAction !== null}
              onClick={() => void run(
                "copy-published-result",
                () => onCopyPublishedLink(publicationResult.publication.publicUrl)
              )}
            >
              Copy link
            </button>
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
                const cloudActionConfirmation = cloudConfirmation && (
                  (cloudConfirmation.kind !== "delete-online" &&
                    cloudConfirmation.localDocumentId === entry.id) ||
                  (cloudConfirmation.kind === "delete-online" &&
                    cloudConfirmation.cloudDocumentId === entry.cloudDocumentId)
                ) ? cloudConfirmation : null;
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
                    ) : cloudActionConfirmation ? (
                      <div
                        className="document-delete-confirmation"
                        role="group"
                        aria-label={cloudConfirmationCopy(cloudActionConfirmation)}
                      >
                        <span>{cloudConfirmationCopy(cloudActionConfirmation)}</span>
                        <button
                          ref={cancelCloudConfirmationRef}
                          type="button"
                          onClick={closeCloudConfirmation}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className={cloudActionConfirmation.kind === "publish"
                            ? "document-primary-action"
                            : "document-danger-action"}
                          disabled={pendingAction !== null}
                          onClick={executeCloudConfirmation}
                        >
                          {cloudActionConfirmation.kind === "publish"
                            ? cloudActionConfirmation.updatesExisting
                              ? "Update published version"
                              : "Publish map"
                            : cloudActionConfirmation.kind === "unpublish"
                              ? "Unpublish map"
                              : "Delete online copy"}
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
                            setCloudConfirmation(null);
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
                            data-cloud-action={`publish-${entry.id}`}
                            disabled={pendingAction !== null}
                            onClick={() => beginCloudConfirmation({
                              kind: "publish",
                              localDocumentId: entry.id,
                              title: entry.title,
                              nodeCount: entry.nodeCount,
                              updatesExisting: Boolean(publication)
                            })}
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
                            data-cloud-action={`unpublish-${entry.id}`}
                            disabled={pendingAction !== null}
                            onClick={() => beginCloudConfirmation({
                              kind: "unpublish",
                              localDocumentId: entry.id,
                              title: entry.title
                            })}
                          >
                            Unpublish
                          </button>
                        )}
                        {cloudState === "ready" && entry.cloudDocumentId && (
                          <button
                            type="button"
                            data-cloud-action={`delete-online-${entry.cloudDocumentId}`}
                            disabled={pendingAction !== null}
                            onClick={() => beginCloudConfirmation({
                              kind: "delete-online",
                              cloudDocumentId: entry.cloudDocumentId!,
                              title: entry.title,
                              revokesPublication: Boolean(publication)
                            })}
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
                            setCloudConfirmation(null);
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
                <p>
                  Open one in this browser before publishing so Mapdown can render its public preview.
                </p>
              </div>
              <ul className="document-list">
                {cloudDocuments
                  .filter((cloud) => !entries.some((entry) => entry.cloudDocumentId === cloud.id))
                  .map((cloud) => {
                    const cloudActionConfirmation =
                      cloudConfirmation?.kind === "delete-online" &&
                      cloudConfirmation.cloudDocumentId === cloud.id
                        ? cloudConfirmation
                        : null;
                    return (
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
                        {cloudActionConfirmation ? (
                          <div
                            className="document-delete-confirmation"
                            role="group"
                            aria-label={cloudConfirmationCopy(cloudActionConfirmation)}
                          >
                            <span>{cloudConfirmationCopy(cloudActionConfirmation)}</span>
                            <button
                              ref={cancelCloudConfirmationRef}
                              type="button"
                              onClick={closeCloudConfirmation}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="document-danger-action"
                              disabled={pendingAction !== null}
                              onClick={executeCloudConfirmation}
                            >
                              Delete online copy
                            </button>
                          </div>
                        ) : (
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
                              data-cloud-action={`delete-online-${cloud.id}`}
                              disabled={pendingAction !== null}
                              onClick={() => beginCloudConfirmation({
                                kind: "delete-online",
                                cloudDocumentId: cloud.id,
                                title: cloud.title,
                                revokesPublication: Boolean(cloud.publication)
                              })}
                            >
                              Delete online
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
