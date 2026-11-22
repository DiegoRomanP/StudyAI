import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import { useEnterAnimation } from "../components/motion/useEnterAnimation";
import type { EnterPreset } from "../components/motion/presets";

function Probe({ preset = "phase", trigger = 0, skipFirst = false }: { preset?: EnterPreset; trigger?: number; skipFirst?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEnterAnimation(ref, preset, trigger, { skipFirst });
  return <div ref={ref}>x</div>;
}

function mockAnimate() {
  const cancel = vi.fn();
  const animate = vi.fn(() => ({ cancel }));
  Object.defineProperty(Element.prototype, "animate", { value: animate, configurable: true });
  return { animate, cancel };
}

afterEach(() => {
  delete (Element.prototype as { animate?: unknown }).animate;
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe("useEnterAnimation", () => {
  it("no hace nada sin Element.animate (jsdom)", () => {
    expect(() => render(<Probe />)).not.toThrow();
  });

  it("lanza el preset con fill none", () => {
    const { animate } = mockAnimate();
    render(<Probe preset="phase" />);
    expect(animate).toHaveBeenCalledTimes(1);
    const [frames, opts] = animate.mock.calls[0] as unknown as [Keyframe[], KeyframeAnimationOptions];
    expect(frames[0]).toMatchObject({ opacity: 0, transform: "translateY(12px)" });
    expect(opts).toMatchObject({ duration: 260, fill: "none" });
  });

  it("usa la variante reducida (sin transform, ≤ 150 ms)", () => {
    const { animate } = mockAnimate();
    window.matchMedia = vi.fn(() => ({ matches: true })) as unknown as typeof window.matchMedia;
    render(<Probe preset="phase" />);
    const [frames, opts] = animate.mock.calls[0] as unknown as [Keyframe[], KeyframeAnimationOptions];
    expect(frames[0]).not.toHaveProperty("transform");
    expect(opts.duration).toBe(150);
  });

  it("cancela la anterior al cambiar trigger", () => {
    const { animate, cancel } = mockAnimate();
    const { rerender } = render(<Probe trigger={1} />);
    rerender(<Probe trigger={2} />);
    expect(animate).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("skipFirst omite el primer montaje pero anima los cambios", () => {
    const { animate } = mockAnimate();
    const { rerender } = render(<Probe trigger={1} skipFirst />);
    expect(animate).not.toHaveBeenCalled();
    rerender(<Probe trigger={2} skipFirst />);
    expect(animate).toHaveBeenCalledTimes(1);
  });
});
