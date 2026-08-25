/**
 * The landing surface for **Make a copy** (D-33).
 *
 * A reader clicks a link on `share.bcailab.com` and arrives here, on the editor origin, at
 * `/import?src={publicId}`. The copy is made in *their* browser: a new local document with new
 * ids, stored in IndexedDB and opened in the editor. Nothing is uploaded, no account is
 * required, and putting it in an account stays the existing explicit *Save online* action —
 * which is what keeps `spec/product-specification.md` §20's local-first rule intact for a flow
 * that starts on someone else's map.
 */

interface ImportPageProps {
  state: "copying" | "failed";
  message: string | null;
  onCancel: () => void;
  onRetry: () => void;
}

export function ImportPage({ state, message, onCancel, onRetry }: ImportPageProps) {
  return (
    <div className="library-page">
      <header className="library-topbar">
        <button type="button" className="library-back" onClick={onCancel}>
          <span aria-hidden="true">←</span> Editor
        </button>
        <h1>Copy a published map</h1>
      </header>
      <div className="library-body library-body-single">
        <section className="library-detail" aria-live="polite">
          {state === "copying" && (
            <>
              <h2>Making a copy…</h2>
              <p className="library-muted">
                The copy is being created in this browser. Nothing is uploaded, and no account is
                needed.
              </p>
            </>
          )}
          {state === "failed" && (
            <>
              <h2>That map could not be copied</h2>
              <p className="library-muted">
                {message ?? "The link may have been unpublished, or it was never a Mapdown link."}
              </p>
              <div className="library-actions">
                <button type="button" className="document-primary-action" onClick={onRetry}>
                  Try again
                </button>
                <button type="button" onClick={onCancel}>
                  Go to the editor
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
