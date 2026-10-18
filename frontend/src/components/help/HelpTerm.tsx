import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { GLOSSARY, type TermId } from "../../lib/glossary";

/**
 * An inline jargon term with a click/tap definition. Built only from `<span>`s so it
 * can live inside a paragraph. Closes on Esc (focus returns to the term), on an
 * outside click or on a second click.
 */
export function HelpTerm({ term, children }: { term: TermId; children?: ReactNode }) {
  const entry = GLOSSARY[term];
  const popoverId = useId();
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Keep the popover inside the viewport on narrow screens (16px gutter).
  useLayoutEffect(() => {
    if (!open) {
      setShift(0);
      return;
    }
    const rect = popoverRef.current?.getBoundingClientRect();
    if (!rect) return;
    const overflow = rect.right - (window.innerWidth - 16);
    setShift(overflow > 0 ? Math.min(overflow, Math.max(0, rect.left - 16)) : 0);
  }, [open]);

  return (
    <span ref={wrapperRef} className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="cursor-help rounded-sm text-inherit underline decoration-dotted underline-offset-4 hover:text-text-primary"
      >
        {children ?? entry.label}
      </button>
      {open && (
        <span
          ref={popoverRef}
          id={popoverId}
          role="tooltip"
          style={shift ? { transform: `translateX(-${shift}px)` } : undefined}
          className="absolute left-0 top-full z-20 mt-1 block w-max max-w-[min(20rem,calc(100vw-2rem))] whitespace-normal rounded-control border border-line bg-surface-elevated p-3 text-left text-sm font-normal not-italic leading-snug text-text-primary shadow-flow"
        >
          {entry.definition}
        </span>
      )}
    </span>
  );
}
