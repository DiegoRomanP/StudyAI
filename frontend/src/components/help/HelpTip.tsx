import { CircleHelp } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useEnterAnimation } from "../motion/useEnterAnimation";
import { usePopover } from "./usePopover";

const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 200;

/**
 * A "?" button with a text-only popover. Opens on mouse hover (hoverable, WCAG 1.4.13),
 * keyboard focus-visible or click/tap; a click pins it. Esc closes it and keeps focus on the button.
 */
export function HelpTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
    const pinned = useRef(false);
  const skipFocus = useRef(false); // Esc/close re-focuses the button: don't reopen
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const close = () => {
    clearTimeout(timer.current);
    pinned.current = false;
    skipFocus.current = true;
    setOpen(false);
  };
  const { id, shift, origin, wrapperRef, buttonRef, popoverRef } = usePopover<
    HTMLSpanElement,
    HTMLButtonElement,
    HTMLDivElement
  >(open, close);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEnterAnimation(popoverRef, "pop", open, { skipFirst: true });

  const schedule = (next: boolean, delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), delay);
  };
  const onEnter = (event: React.PointerEvent) => {
    if (event.pointerType === "mouse") schedule(true, OPEN_DELAY_MS);
  };
  const onLeave = (event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && !pinned.current) schedule(false, CLOSE_DELAY_MS);
  };

  return (
    <span ref={wrapperRef} className="relative inline-flex align-middle">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Ayuda: ${label}`}
        aria-expanded={open}
        aria-controls={id}
        aria-describedby={id}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
        onClick={() => {
          clearTimeout(timer.current);
          if (pinned.current) return close();
          pinned.current = true;
          skipFocus.current = false;
          setOpen(true);
        }}
        onFocus={(event) => {
          let visible = true; // jsdom/old browsers without :focus-visible: treat as keyboard
          try {
            visible = event.currentTarget.matches(":focus-visible");
          } catch {
            /* keep default */
          }
          if (visible && !skipFocus.current) {
            clearTimeout(timer.current);
            setOpen(true);
          }
        }}
        onBlur={() => {
          skipFocus.current = false;
          if (!pinned.current) {
            clearTimeout(timer.current);
            setOpen(false);
          }
        }}
        className={`-m-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full hover:text-action-hover ${
          open ? "text-action-hover" : "text-text-muted"
        }`}
      >
        <CircleHelp aria-hidden="true" className="h-5 w-5" />
      </button>
      <div
        ref={popoverRef}
        id={id}
        role="tooltip"
        hidden={!open}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
        style={{ transformOrigin: origin, ...(shift ? { translate: `-${shift}px` } : {}) }}
        className="absolute left-0 top-full z-20 mt-1 w-max max-w-[min(22rem,calc(100vw-2rem))] text-left"
      >
        <div
          className="rounded-control border border-line bg-surface-elevated p-3 text-sm font-normal leading-snug text-text-primary shadow-flow"
        >
          {children}
        </div>
      </div>
    </span>
  );
}
