import { useState, type ReactNode } from "react";

import { GLOSSARY, type TermId } from "../../lib/glossary";
import { useEnterAnimation } from "../motion/useEnterAnimation";
import { usePopover } from "./usePopover";

/**
 * An inline jargon term with a click/tap definition. Built only from `<span>`s so it
 * can live inside a paragraph. Closes on Esc (focus returns to the term), on an
 * outside click or on a second click.
 */
export function HelpTerm({ term, children }: { term: TermId; children?: ReactNode }) {
  const entry = GLOSSARY[term];
  const [open, setOpen] = useState(false);
  const {
    id: popoverId,
    shift,
    origin,
    wrapperRef,
    buttonRef,
    popoverRef,
  } = usePopover<HTMLSpanElement, HTMLButtonElement, HTMLSpanElement>(open, () => setOpen(false));

  useEnterAnimation(popoverRef, "pop", open);

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
          style={{ transformOrigin: origin, ...(shift ? { translate: `-${shift}px` } : {}) }}
          className="absolute left-0 top-full z-20 mt-1 block w-max max-w-[min(20rem,calc(100vw-2rem))] whitespace-normal rounded-control border border-line bg-surface-elevated p-3 text-left text-sm font-normal not-italic leading-snug text-text-primary shadow-flow"
        >
          {entry.definition}
        </span>
      )}
    </span>
  );
}
