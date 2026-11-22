/**
 * Presets de entrada (Web Animations API). Los valores replican los tokens de
 * `styles/tokens.css` (--motion-*, --ease-*): si cambias uno, cambia el otro.
 */
export type EnterPreset =
  | "route"
  | "phase"
  | "stepForward"
  | "stepBack"
  | "reveal"
  | "pop"
  | "overlay"
  | "backdrop"
  | "sheet"
  | "panel"
  | "content";

export interface PresetSpec {
  keyframes: Keyframe[];
  duration: number;
  easing: string;
}

const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)"; // --motion-easing
const EASE_DRAWER = "cubic-bezier(0.32, 0.72, 0, 1)"; // --ease-drawer

const fade = (transform?: string): Keyframe[] => [
  { opacity: 0, ...(transform ? { transform } : {}) },
  { opacity: 1, ...(transform ? { transform: "none" } : {}) },
];

export const PRESETS: Record<EnterPreset, PresetSpec> = {
  route: { keyframes: fade("translateY(4px)"), duration: 180, easing: EASE_OUT },
  phase: { keyframes: fade("translateY(12px)"), duration: 260, easing: EASE_OUT },
  stepForward: { keyframes: fade("translateX(16px)"), duration: 200, easing: EASE_OUT },
  stepBack: { keyframes: fade("translateX(-16px)"), duration: 200, easing: EASE_OUT },
  reveal: { keyframes: fade("translateY(6px)"), duration: 200, easing: EASE_OUT },
  pop: { keyframes: fade("scale(0.96)"), duration: 160, easing: EASE_OUT },
  overlay: { keyframes: fade("scale(0.96)"), duration: 220, easing: EASE_OUT },
  backdrop: { keyframes: fade(), duration: 200, easing: EASE_OUT },
  sheet: {
    keyframes: [{ transform: "translateY(100%)" }, { transform: "none" }],
    duration: 320,
    easing: EASE_DRAWER,
  },
  panel: { keyframes: fade("translateX(16px)"), duration: 220, easing: EASE_OUT },
  content: { keyframes: fade(), duration: 200, easing: EASE_OUT },
};

/** Reduced motion: «menos y más suave, no cero»: solo opacidad y ≤ 150 ms. */
export function reducedSpec(spec: PresetSpec): PresetSpec {
  return { keyframes: fade(), duration: Math.min(spec.duration, 150), easing: spec.easing };
}
