import * as React from "react";

export type WritingRetryResult = {
  articleId: string;
  revisionId: string;
  generation: number;
  startedAt: string;
};
export type FeedbackRevision = { id: string; feedback_generation: number };

/** Consume a successful retry result once; never replay it when the view updates. */
export function useWritingRetryResult(
  retry: WritingRetryResult | undefined,
  articleId: string,
  revision: FeedbackRevision | null,
  apply: (retry: WritingRetryResult) => void
) {
  const consumed = React.useRef(new Set<string>());
  React.useEffect(() => {
    if (!retry) return;
    const identity = `${retry.articleId}:${retry.revisionId}:${retry.generation}`;
    if (consumed.current.has(identity)) return;
    consumed.current.add(identity);
    if (retry.articleId !== articleId || retry.revisionId !== revision?.id ||
        retry.generation <= revision.feedback_generation) return;
    apply(retry);
  }, [retry, articleId, revision, apply]);
}
