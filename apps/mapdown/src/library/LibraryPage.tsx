import { useEffect, useMemo, useRef, useState } from "react";
import { DOCUMENT_TITLE_MAX_LENGTH } from "../storage/library";
import type { DocumentIndexEntry } from "../storage/store";
import type { CloudDocumentSummary, CloudPublication, CloudUser } from "../cloud/types";
import type { CloudLibraryState, DocumentLibraryState } from "./cloud-state";
import {
  cloudConfirmationCopy,
  cloudConfirmationLabel,
  type CloudConfirmation
} from "./confirmations";
import { buildRows, rowStateLabel, visibleRows, type LibraryRow, type LibrarySort } from "./rows";

/**
 * The document library, as a page.
 *
 * It replaces a modal that had to carry local documents, online documents, sign-in, save,
 * publish, update, unpublish, delete, conflicted copies and a public URL inside one focus trap
 * (D-31). Two structural changes come out of that:
 *
 * **One list.** Local and online-only maps sort together by when they were last touched, and a
 * row's state is computed once in `rows.ts` rather than reassembled inline per badge and per
 * button — which is how a map holding unsaved content could read *Saved online*.
 *
 * **A detail panel.** Publishing is not a row action. It has consequences worth reading, a
 * result worth keeping on screen, and a public URL people come back for; the panel is where all
 * three live. Stage 3's acceptance criterion (k) — "the publish result must stay visible rather
 * than sit behind its own overlay" — stops being a special case here.
 */

interface LibraryPageProps {
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

function nodeLabel(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? "node" : "nodes"}`;
}

export function LibraryPage({
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
}: LibraryPageProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<LibrarySort>("recent");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [confirmation, setConfirmation] = useState<CloudConfirmation | null>(null);
  const [publicationResult, setPublicationResult] = useState<{
    title: string;
    publication: CloudPublication;
    updated: boolean;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const confirmCancelRef = useRef<HTMLButtonElement>(null);

  const rows = useMemo(
    () => buildRows(entries, cloudDocuments, cloudState, activeDocumentId),
    [activeDocumentId, cloudDocuments, cloudState, entries]
  );
  const shown = useMemo(() => visibleRows(rows, query, sort), [query, rows, sort]);

  // The selection follows the data rather than the click: a row deleted, renamed away from the
  // filter, or replaced by a refresh must not leave the panel describing a map that is gone.
  const selected: LibraryRow | null =
    shown.find((row) => row.key === selectedKey) ??
    shown.find((row) => row.isCurrent) ??
    shown[0] ??
    null;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!renaming) return;
    renameRef.current?.focus();
    // Pre-filled with the current title, so a person who came here to replace it types over it
    // instead of appending to it.
    renameRef.current?.select();
  }, [renaming]);

  useEffect(() => {
    if (confirmation) confirmCancelRef.current?.focus();
  }, [confirmation]);

  useEffect(() => {
    setRenaming(false);
    setConfirmation(null);
    setActionError(null);
  }, [selected?.key]);

  const run = async (key: string, action: () => Promise<void>) => {
    setPendingAction(key);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "That action could not be completed.");
    } finally {
      setPendingAction(null);
    }
  };

  const busy = pendingAction !== null;

  const executeConfirmation = () => {
    if (!confirmation) return;
    void run(`confirm-${confirmation.kind}`, async () => {
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
      } else if (confirmation.kind === "delete-local") {
        await onDelete(confirmation.localDocumentId);
      } else {
        await onDeleteOnline(confirmation.cloudDocumentId);
        setPublicationResult(null);
      }
      setConfirmation(null);
    });
  };

  const onPageKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // The editor is mounted underneath and still listens on the window; the library owns keys
    // while it is on screen.
    event.stopPropagation();
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (confirmation) setConfirmation(null);
    else if (renaming) setRenaming(false);
    else onClose();
  };

  return (
    <div className="library-page" onKeyDownCapture={onPageKeyDown}>
      <header className="library-topbar">
        <button type="button" className="library-back" onClick={onClose}>
          <span aria-hidden="true">←</span> Editor
        </button>
        <h1 id="library-title" ref={headingRef} tabIndex={-1}>
          Your maps
        </h1>
        <div className="library-account">
          {cloudState === "loading" && <span className="library-muted">Checking online save…</span>}
          {cloudState === "signed-out" && (
            <>
              <span className="library-muted">Local-first. Sign in only to save online.</span>
              <button type="button" disabled={busy} onClick={() => void run("sign-in", onSignIn)}>
                Sign in
              </button>
            </>
          )}
          {cloudState === "ready" && cloudUser && (
            <>
              <span className="library-account-identity">
                <strong>{cloudUser.name || cloudUser.email}</strong>
                {cloudUser.name ? <small>{cloudUser.email}</small> : null}
              </span>
              <button type="button" disabled={busy} onClick={() => void run("sign-out", onSignOut)}>
                Sign out
              </button>
            </>
          )}
          {cloudState === "unavailable" && (
            <>
              <span className="library-muted">Online save is unavailable. Local maps are unaffected.</span>
              <button type="button" disabled={busy} onClick={() => void run("retry-cloud", onRetryCloud)}>
                Retry
              </button>
            </>
          )}
        </div>
      </header>

      <div className="library-toolbar">
        <label className="library-search">
          <span className="sr-only">Search maps by title</span>
          <input
            type="search"
            value={query}
            placeholder="Search maps"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="library-sort">
          <span className="sr-only">Sort maps</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as LibrarySort)}>
            <option value="recent">Last edited</option>
            <option value="title">Title</option>
          </select>
        </label>
        <button
          type="button"
          className="document-primary-action"
          disabled={state === "unavailable" || busy}
          onClick={() => void run("new", onNew)}
        >
          New map
        </button>
      </div>

      {undoTitle && (
        <div className="library-banner" role="status">
          <span>Deleted “{undoTitle}” from this browser.</span>
          <button type="button" disabled={busy} onClick={() => void run("undo-delete", onUndoDelete)}>
            Undo delete
          </button>
        </div>
      )}

      {actionError && (
        <div className="library-banner is-error" role="alert">
          {actionError}
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {state === "ready"
          ? `${shown.length} ${shown.length === 1 ? "map" : "maps"} listed${query.trim() ? ` for “${query.trim()}”` : ""}`
          : ""}
      </p>

      <div className="library-body">
        <section className="library-list-pane" aria-label="Maps">
          {state === "loading" && <p className="library-empty">Loading local documents…</p>}

          {state === "unavailable" && (
            <div className="library-empty">
              <strong>Local documents are unavailable</strong>
              <p>
                {unavailableMessage ??
                  "This browser would not open Mapdown storage. The current map still works in memory."}
              </p>
            </div>
          )}

          {state === "ready" && rows.length === 0 && (
            <div className="library-empty">
              <strong>No maps yet</strong>
              <p>Create a map to start a document library in this browser.</p>
            </div>
          )}

          {state === "ready" && rows.length > 0 && shown.length === 0 && (
            <div className="library-empty">
              <strong>No map matches “{query.trim()}”</strong>
              <p>{rows.length.toLocaleString()} {rows.length === 1 ? "map is" : "maps are"} hidden by this search.</p>
              <button type="button" onClick={() => setQuery("")}>Clear search</button>
            </div>
          )}

          {shown.length > 0 && (
            <ul className="library-list" role="listbox" aria-label="Maps" tabIndex={-1}>
              {shown.map((row) => {
                const label = rowStateLabel(row);
                const isSelected = selected?.key === row.key;
                return (
                  <li key={row.key}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      aria-label={[
                        row.title,
                        row.isCurrent ? "open in the editor" : null,
                        label.text,
                        row.isConflictedCopy ? "conflicted copy" : null,
                        nodeLabel(row.nodeCount)
                      ].filter(Boolean).join(", ")}
                      className={`library-row${isSelected ? " is-selected" : ""}${row.isCurrent ? " is-current" : ""}`}
                      onClick={() => setSelectedKey(row.key)}
                      onDoubleClick={() => {
                        if (row.isCurrent) return;
                        void run(`open-${row.key}`, () =>
                          row.kind === "local" ? onOpen(row.id) : onOpenOnline(row.id)
                        );
                      }}
                    >
                      <span className="library-row-title">
                        <strong>{row.title}</strong>
                        {row.isCurrent && <span className="library-chip" data-tone="current">Open</span>}
                        <span className="library-chip" data-tone={label.tone}>{label.text}</span>
                        {row.isConflictedCopy && (
                          <span className="library-chip" data-tone="warning">Conflicted copy</span>
                        )}
                      </span>
                      <span className="library-row-meta">
                        {nodeLabel(row.nodeCount)}
                        <span aria-hidden="true"> · </span>
                        <time dateTime={new Date(row.updatedAt).toISOString()}>
                          {dateFormatter.format(row.updatedAt)}
                        </time>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="library-detail" aria-label="Selected map">
          {!selected && <p className="library-muted">Select a map to see its details.</p>}
          {selected && (
            <>
              <div className="library-detail-head">
                {renaming && selected.kind === "local" ? (
                  <form
                    className="library-rename"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run("rename", async () => {
                        await onRename(selected.id, renameValue);
                        setRenaming(false);
                      });
                    }}
                  >
                    <label>
                      <span className="sr-only">New title for {selected.title}</span>
                      <input
                        ref={renameRef}
                        value={renameValue}
                        maxLength={DOCUMENT_TITLE_MAX_LENGTH}
                        onChange={(event) => setRenameValue(event.target.value)}
                      />
                    </label>
                    <button type="submit" disabled={busy}>Save title</button>
                    <button type="button" onClick={() => setRenaming(false)}>Cancel</button>
                  </form>
                ) : (
                  <h2>{selected.title}</h2>
                )}
                <p className="library-muted">
                  {nodeLabel(selected.nodeCount)}
                  <span aria-hidden="true"> · </span>
                  {selected.kind === "local" ? "Edited" : "Saved online"}{" "}
                  <time dateTime={new Date(selected.updatedAt).toISOString()}>
                    {dateFormatter.format(selected.updatedAt)}
                  </time>
                </p>
                {selected.sourceFilename && (
                  <p className="library-muted">Opened from {selected.sourceFilename}</p>
                )}
                {selected.kind === "online-only" && (
                  <p className="library-note">
                    This map is in your account but not in this browser. Open it here before
                    publishing, so Mapdown can render its public assets.
                  </p>
                )}
                {selected.sync === "unsaved" && (
                  <p className="library-note">
                    This browser holds changes the online copy does not have.
                  </p>
                )}
                {selected.publish === "outdated" && (
                  <p className="library-note">
                    The public version is frozen at an older state. Readers see it until you
                    update the published version.
                  </p>
                )}
              </div>

              <div className="library-actions" role="group" aria-label={`Actions for ${selected.title}`}>
                <button
                  type="button"
                  className="document-primary-action"
                  disabled={selected.isCurrent || busy}
                  onClick={() =>
                    void run("open", () =>
                      selected.kind === "local" ? onOpen(selected.id) : onOpenOnline(selected.id)
                    )
                  }
                >
                  {selected.isCurrent ? "Open in editor" : selected.kind === "local" ? "Open" : "Open in this browser"}
                </button>
                {selected.kind === "local" && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setRenameValue(selected.title);
                        setRenaming(true);
                        setConfirmation(null);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void run("duplicate", () => onDuplicate(selected.id))}
                    >
                      Duplicate
                    </button>
                  </>
                )}
                {cloudState === "ready" && selected.kind === "local" && (
                  <button
                    type="button"
                    disabled={selected.sync === "synced" || busy}
                    onClick={() => void run("save-online", () => onSaveOnline(selected.id))}
                  >
                    {selected.sync === "local-only"
                      ? "Save online"
                      : selected.sync === "synced"
                        ? "Online copy current"
                        : "Save changes online"}
                  </button>
                )}
                {selected.kind === "local" && (
                  <button
                    type="button"
                    className="document-danger-action"
                    disabled={busy}
                    onClick={() =>
                      setConfirmation({
                        kind: "delete-local",
                        localDocumentId: selected.id,
                        title: selected.title,
                        isCurrent: selected.isCurrent
                      })
                    }
                  >
                    Delete
                  </button>
                )}
              </div>

              <section className="library-publish" aria-labelledby="library-publish-title">
                <h3 id="library-publish-title">Public link</h3>
                {cloudState !== "ready" && (
                  <p className="library-muted">
                    Publishing needs a Mapdown account. Local maps stay in this browser.
                  </p>
                )}
                {cloudState === "ready" && !selected.cloudDocumentId && (
                  <p className="library-muted">
                    Save this map online first. Publishing freezes a copy of the online version.
                  </p>
                )}
                {cloudState === "ready" && selected.publication && (
                  <div className="library-public-url">
                    <a href={selected.publication.publicUrl} target="_blank" rel="noreferrer">
                      {selected.publication.publicUrl}
                    </a>
                    <span className="library-muted">
                      Public version {selected.publication.version.toLocaleString()} ·{" "}
                      <time dateTime={new Date(selected.publication.updatedAt).toISOString()}>
                        {dateFormatter.format(selected.publication.updatedAt)}
                      </time>
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run("copy-link", () => onCopyPublishedLink(selected.publication!.publicUrl))
                      }
                    >
                      Copy link
                    </button>
                  </div>
                )}
                {cloudState === "ready" && selected.cloudDocumentId && (
                  <div className="library-actions">
                    {selected.kind === "local" && (
                      <button
                        type="button"
                        className="document-primary-action"
                        disabled={busy}
                        onClick={() =>
                          setConfirmation({
                            kind: "publish",
                            localDocumentId: selected.id,
                            title: selected.title,
                            nodeCount: selected.nodeCount,
                            updatesExisting: Boolean(selected.publication)
                          })
                        }
                      >
                        {selected.publication ? "Update published version" : "Publish"}
                      </button>
                    )}
                    {selected.publication && selected.kind === "local" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          setConfirmation({
                            kind: "unpublish",
                            localDocumentId: selected.id,
                            title: selected.title
                          })
                        }
                      >
                        Unpublish
                      </button>
                    )}
                    <button
                      type="button"
                      className="document-danger-action"
                      disabled={busy}
                      onClick={() =>
                        setConfirmation({
                          kind: "delete-online",
                          cloudDocumentId: selected.cloudDocumentId!,
                          title: selected.title,
                          revokesPublication: Boolean(selected.publication)
                        })
                      }
                    >
                      Delete online copy
                    </button>
                  </div>
                )}
              </section>

              {publicationResult && (
                <div className="library-banner is-result" role="status">
                  <span>
                    {publicationResult.updated ? "Updated" : "Published"} “{publicationResult.title}”.{" "}
                    <a href={publicationResult.publication.publicUrl} target="_blank" rel="noreferrer">
                      {publicationResult.publication.publicUrl}
                    </a>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run("copy-result-link", () =>
                        onCopyPublishedLink(publicationResult.publication.publicUrl)
                      )
                    }
                  >
                    Copy link
                  </button>
                </div>
              )}

              {confirmation && (
                <div
                  className="library-confirmation"
                  role="group"
                  aria-label={cloudConfirmationCopy(confirmation)}
                >
                  <p>{cloudConfirmationCopy(confirmation)}</p>
                  <div className="library-actions">
                    <button ref={confirmCancelRef} type="button" onClick={() => setConfirmation(null)}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={
                        confirmation.kind === "publish"
                          ? "document-primary-action"
                          : "document-danger-action"
                      }
                      disabled={busy}
                      onClick={executeConfirmation}
                    >
                      {cloudConfirmationLabel(confirmation)}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
