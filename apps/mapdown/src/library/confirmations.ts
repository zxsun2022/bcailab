/**
 * Copy for the three cloud actions a person can take that they cannot take back cheaply.
 *
 * Kept as pure functions because the sentence is the safety mechanism: `spec/vision.md` §4.8
 * says a confirmation is not a substitute for history, which means the one thing a confirmation
 * *must* do is state the consequence accurately. That is a testable claim, and it is tested.
 */

export type CloudConfirmation =
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
    }
  | {
      kind: "delete-local";
      localDocumentId: string;
      title: string;
      isCurrent: boolean;
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
  if (confirmation.kind === "delete-local") {
    return `Delete “${confirmation.title}” and its local recovery snapshots from this browser?${
      confirmation.isCurrent ? " It is the map open in the editor, so another map will be opened." : ""
    } Undo delete stays available in this tab.`;
  }
  return `Delete “${confirmation.title}” from online save?${confirmation.revokesPublication ? " Its public link will stop working immediately." : ""} Local copies in this browser will remain.`;
}

export function cloudConfirmationLabel(confirmation: CloudConfirmation): string {
  if (confirmation.kind === "publish") {
    return confirmation.updatesExisting ? "Update published version" : "Publish map";
  }
  if (confirmation.kind === "unpublish") return "Unpublish map";
  if (confirmation.kind === "delete-local") return "Delete map";
  return "Delete online copy";
}

export function cloudConfirmationKey(confirmation: CloudConfirmation): string {
  return confirmation.kind === "delete-online"
    ? `${confirmation.kind}-${confirmation.cloudDocumentId}`
    : `${confirmation.kind}-${confirmation.localDocumentId}`;
}
