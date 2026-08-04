import { useEffect, useRef, useState, type ReactNode } from "react";

interface ToolbarMenuProps {
  label: string;
  children: ReactNode;
  align?: "start" | "end";
}

/**
 * A small native-details popover. It keeps browser keyboard semantics, closes when another
 * toolbar menu opens or the user clicks away, and lets action buttons opt into closing through
 * `data-close-menu`.
 */
export function ToolbarMenu({
  label,
  children,
  align = "start"
}: ToolbarMenuProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const details = detailsRef.current;
      if (details?.open && !details.contains(event.target as Node)) details.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      const details = detailsRef.current;
      if (event.key !== "Escape" || !details?.open) return;
      event.preventDefault();
      event.stopPropagation();
      details.open = false;
      details.querySelector<HTMLElement>("summary")?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, []);

  return (
    <details
      ref={detailsRef}
      className={`toolbar-menu toolbar-menu--${align}`}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
        if (!event.currentTarget.open) return;
        for (const menu of document.querySelectorAll<HTMLDetailsElement>(".toolbar-menu[open]")) {
          if (menu !== event.currentTarget) menu.open = false;
        }
      }}
    >
      <summary
        className="toolbar-control toolbar-summary"
        role="button"
        aria-haspopup={true}
        aria-expanded={open}
      >
        <span>{label}</span>
        <span className="toolbar-chevron" aria-hidden="true">
          ▾
        </span>
      </summary>
      <div
        className="toolbar-popover"
        role="group"
        aria-label={`${label} options`}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("[data-close-menu]")) {
            detailsRef.current!.open = false;
          }
        }}
      >
        {children}
      </div>
    </details>
  );
}
