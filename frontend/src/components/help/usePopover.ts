import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/**
 * Shared popover plumbing: closes on Esc (focus returns to the button) and on an outside
 * press, and shifts the popover left so it stays inside the viewport (16px gutter).
 * The caller owns `open` and renders the elements holding the returned refs.
 */
export function usePopover<W extends HTMLElement, B extends HTMLElement, P extends HTMLElement>(
  open: boolean,
  onClose: () => void,
) {
  const id = useId();
  const [shift, setShift] = useState(0);
  const wrapperRef = useRef<W>(null);
  const buttonRef = useRef<B>(null);
  const popoverRef = useRef<P>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) closeRef.current();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      closeRef.current();
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

  // The popover is shifted left by `shift`, so the trigger sits `shift`px further right inside it.
  const origin = `${shift}px top`;
  return { id, shift, origin, wrapperRef, buttonRef, popoverRef };
}
