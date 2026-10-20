import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal panel over a dimmed page. Escape, the close button or a click on the dimmed
 * area close it; Tab stays inside, and focus returns to whatever opened it.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  /** The actions; the first focusable one receives focus on open. */
  children: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Kept in a ref so a new onClose each render does not re-run the open effect.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const focusables = () => (panel ? [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)] : []);
    // The close button comes first in the DOM; start on the first action instead.
    const firstAction = panel?.querySelector("[data-dialog-actions]")?.querySelector<HTMLElement>(FOCUSABLE);
    (firstAction ?? focusables()[0])?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="w-full max-w-md space-y-4 rounded-surface border border-line-strong/60 bg-surface-elevated p-5 shadow-flow"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="font-display text-lg font-semibold text-text-primary">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-m-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-text-muted hover:bg-surface-subtle hover:text-text-primary"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        {description && (
          <div id={descriptionId} className="text-sm text-text-muted">
            {description}
          </div>
        )}
        <div data-dialog-actions className="flex flex-col gap-2">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
