import * as React from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  pending?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Accessible destructive-action dialog with focus containment and restoration. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  pending = false,
  error,
  onCancel,
  onConfirm
}: ConfirmDialogProps) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const cancelRef = React.useRef(onCancel);
  const pendingRef = React.useRef(pending);
  const [portalNode] = React.useState<HTMLDivElement | null>(() => {
    if (typeof document === "undefined") return null;
    const node = document.createElement("div");
    node.dataset.confirmDialogPortal = "true";
    return node;
  });

  cancelRef.current = onCancel;
  pendingRef.current = pending;

  React.useEffect(() => {
    if (!open || !portalNode) return;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.appendChild(portalNode);

    const inerted = Array.from(document.body.children)
      .filter((element): element is HTMLElement =>
        element instanceof HTMLElement && element !== portalNode
      )
      .map((element) => ({ element, wasInert: element.inert }));
    for (const { element } of inerted) element.inert = true;
    document.body.style.overflow = "hidden";

    const focusable = () =>
      Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])
        .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");

    dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!pendingRef.current) {
          event.preventDefault();
          cancelRef.current();
        }
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      for (const { element, wasInert } of inerted) element.inert = wasInert;
      document.body.style.overflow = previousOverflow;
      portalNode.remove();
      previousFocus?.focus();
    };
  }, [open, portalNode]);

  if (!open || !portalNode) return null;

  return createPortal(
    <div
      className="confirm-dialog-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <h2 id={titleId} className="confirm-dialog-title">{title}</h2>
        <p id={descriptionId} className="confirm-dialog-description">{description}</p>
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="btn btn-ghost"
            data-autofocus
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? "Deleting..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    portalNode
  );
}
type ConfirmSubmitButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "onClick"
> & {
  dialogTitle: string;
  dialogDescription: string;
  confirmLabel?: string;
};

/** Adds a confirmation gate to an ordinary progressively-enhanced form submit. */
export function ConfirmSubmitButton({
  dialogTitle,
  dialogDescription,
  confirmLabel,
  children,
  ...buttonProps
}: ConfirmSubmitButtonProps) {
  const [open, setOpen] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);

  const confirm = () => {
    const form = buttonRef.current?.form;
    setOpen(false);
    window.queueMicrotask(() => form?.requestSubmit());
  };

  return (
    <>
      <button
        {...buttonProps}
        ref={buttonRef}
        type="submit"
        onClick={(event) => {
          event.preventDefault();
          if (!buttonProps.disabled) setOpen(true);
        }}
      >
        {children}
      </button>
      <ConfirmDialog
        open={open}
        title={dialogTitle}
        description={dialogDescription}
        confirmLabel={confirmLabel}
        onCancel={() => setOpen(false)}
        onConfirm={confirm}
      />
    </>
  );
}

type ConfirmActionButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "onClick"
> & {
  dialogTitle: string;
  dialogDescription: string;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
};

/** Adds the same confirmation contract to an imperative/fetcher mutation. */
export function ConfirmActionButton({
  dialogTitle,
  dialogDescription,
  confirmLabel,
  pending = false,
  onConfirm,
  children,
  ...buttonProps
}: ConfirmActionButtonProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        {...buttonProps}
        type="button"
        disabled={buttonProps.disabled || pending}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      <ConfirmDialog
        open={open}
        title={dialogTitle}
        description={dialogDescription}
        confirmLabel={confirmLabel}
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          onConfirm();
        }}
      />
    </>
  );
}
