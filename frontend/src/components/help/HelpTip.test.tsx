import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HelpTip } from "./HelpTip";

// jsdom has no PointerEvent, so pointerType would be dropped.
class FakePointerEvent extends MouseEvent {
  pointerType: string;
  constructor(type: string, init: MouseEventInit & { pointerType?: string } = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? "";
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);

function setup() {
  render(
    <div>
      <HelpTip label="Recursos">
        <strong>Recursos</strong>
        <p>Sube tus apuntes.</p>
      </HelpTip>
      <button type="button">Fuera</button>
    </div>,
  );
  return screen.getByRole("button", { name: "Ayuda: Recursos" });
}

describe("HelpTip", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("is closed by default and wires aria to the tooltip", () => {
    const button = setup();
    const tip = screen.getByRole("tooltip", { hidden: true });
    expect(tip).toHaveAttribute("hidden");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-describedby", tip.id);
    expect(button).toHaveAttribute("aria-controls", tip.id);
    expect(tip).toHaveTextContent("Sube tus apuntes.");
  });

  it("opens on mouse hover after a delay and closes after leaving", () => {
    const button = setup();
    fireEvent.pointerEnter(button, { pointerType: "mouse" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    act(() => void vi.advanceTimersByTime(130));
    expect(button).toHaveAttribute("aria-expanded", "true");
    fireEvent.pointerLeave(button, { pointerType: "mouse" });
    act(() => void vi.advanceTimersByTime(100));
    expect(button).toHaveAttribute("aria-expanded", "true");
    act(() => void vi.advanceTimersByTime(150));
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("stays open while the pointer moves from the button to the popover", () => {
    const button = setup();
    fireEvent.pointerEnter(button, { pointerType: "mouse" });
    act(() => void vi.advanceTimersByTime(130));
    fireEvent.pointerLeave(button, { pointerType: "mouse" });
    fireEvent.pointerEnter(screen.getByRole("tooltip", { hidden: true }), { pointerType: "mouse" });
    act(() => void vi.advanceTimersByTime(500));
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("opens on focus and closes on blur", () => {
    const button = setup();
    act(() => button.focus());
    expect(button).toHaveAttribute("aria-expanded", "true");
    act(() => button.blur());
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("Escape closes and keeps focus on the button", () => {
    const button = setup();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
  });

  it("a click pins it open through mouse leave; a second click closes", () => {
    const button = setup();
    fireEvent.pointerEnter(button, { pointerType: "mouse" });
    fireEvent.click(button);
    fireEvent.pointerLeave(button, { pointerType: "mouse" });
    act(() => void vi.advanceTimersByTime(500));
    expect(button).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("touch opens on tap without hover and an outside press closes", () => {
    const button = setup();
    fireEvent.pointerEnter(button, { pointerType: "touch" });
    act(() => void vi.advanceTimersByTime(500));
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    fireEvent.mouseDown(screen.getByRole("button", { name: "Fuera" }));
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("has no focusable elements inside the content", () => {
    setup();
    const tip = screen.getByRole("tooltip", { hidden: true });
    expect(tip.querySelectorAll("a, button, input, select, textarea, [tabindex]")).toHaveLength(0);
  });
});
