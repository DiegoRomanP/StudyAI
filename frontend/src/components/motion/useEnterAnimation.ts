import { useLayoutEffect, useRef, type RefObject } from "react";
import { PRESETS, reducedSpec, type EnterPreset } from "./presets";

interface Options {
  /** No anima en el primer montaje (p. ej. la primera carga de la app). */
  skipFirst?: boolean;
  /** `"back"` convierte `stepForward` en `stepBack`. */
  direction?: "forward" | "back";
}

/**
 * Anima la entrada de `ref` al montar y cada vez que cambia `trigger` (Web Animations API,
 * `fill: "none"`: el reposo es el CSS normal). No hace nada si no hay `Element.animate` (jsdom).
 * Solo entradas: lo anterior se desmonta al instante. La regla global de reduced-motion de
 * `index.css` no afecta a WAAPI, por eso aquí se reduce a un fundido de ≤ 150 ms.
 */
export function useEnterAnimation(
  ref: RefObject<HTMLElement | null>,
  preset: EnterPreset,
  trigger?: unknown,
  { skipFirst = false, direction }: Options = {},
) {
  const prev = useRef(trigger);
  const running = useRef<Animation | null>(null);
  const name = direction === "back" && preset === "stepForward" ? "stepBack" : preset;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    if (skipFirst && Object.is(prev.current, trigger)) return;
    prev.current = trigger;
    running.current?.cancel(); // interrumpible: nunca se apilan dos
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    const { keyframes, duration, easing } = reduce ? reducedSpec(PRESETS[name]) : PRESETS[name];
    running.current = el.animate(keyframes, { duration, easing, fill: "none" });
  }, [ref, name, trigger, skipFirst]);
}
