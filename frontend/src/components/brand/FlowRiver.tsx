import { useId } from "react";

/**
 * Original hero artwork: a luminous river under a night sky, drawn with the same
 * curve family as the StudyAI mark. Decorative only. The highlight's drift is a
 * CSS animation (`.flow-drift`) that stops under prefers-reduced-motion.
 */
export function FlowRiver({ className = "" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  const river = `river-${id}`;
  const sky = `sky-${id}`;
  const glow = `glow-${id}`;

  return (
    <svg
      viewBox="0 0 640 440"
      className={className}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={sky} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#101A30" />
          <stop offset="60%" stopColor="#172440" />
          <stop offset="100%" stopColor="#0B1224" />
        </linearGradient>
        <linearGradient id={river} x1="0" x2="1" y1="1" y2="0">
          <stop offset="0%" stopColor="#61D9F2" />
          <stop offset="55%" stopColor="#5178FF" />
          <stop offset="100%" stopColor="#A991FF" />
        </linearGradient>
        <radialGradient id={glow} cx="0.72" cy="0.3" r="0.5">
          <stop offset="0%" stopColor="#A991FF" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#A991FF" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="640" height="440" fill={`url(#${sky})`} />
      <rect width="640" height="440" fill={`url(#${glow})`} />

      {[
        [72, 52, 1.4],
        [148, 96, 1],
        [236, 40, 1.2],
        [402, 70, 1],
        [488, 34, 1.6],
        [566, 88, 1.1],
        [612, 46, 0.9],
        [318, 118, 0.8],
      ].map(([cx, cy, r]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#F6F8FF" opacity="0.7" />
      ))}

      <path
        d="M0 250 L90 196 L150 226 L240 160 L330 214 L420 170 L520 222 L640 178 L640 440 L0 440 Z"
        fill="#172440"
        opacity="0.9"
      />
      <path
        d="M0 300 L110 252 L210 290 L300 248 L410 286 L500 256 L640 296 L640 440 L0 440 Z"
        fill="#101A30"
      />

      <g fill="none" strokeLinecap="round">
        <path
          d="M-40 470 C110 400 70 330 230 304 S450 286 390 236 S500 196 680 186"
          stroke={`url(#${river})`}
          strokeWidth="78"
          opacity="0.16"
        />
        <path
          d="M-40 470 C110 400 70 330 230 304 S450 286 390 236 S500 196 680 186"
          stroke={`url(#${river})`}
          strokeWidth="30"
          opacity="0.4"
        />
        <path
          d="M-40 470 C110 400 70 330 230 304 S450 286 390 236 S500 196 680 186"
          stroke="#F6F8FF"
          strokeWidth="3"
          opacity="0.75"
          strokeDasharray="90 260"
          className="flow-drift"
        />
        <path
          d="M-20 440 C140 380 110 344 250 322 S470 300 420 252 S520 214 680 206"
          stroke={`url(#${river})`}
          strokeWidth="2"
          opacity="0.55"
        />
      </g>
      <circle cx="390" cy="236" r="7" fill="#B9A8FF" />
      <circle cx="390" cy="236" r="18" fill="#B9A8FF" opacity="0.18" />
    </svg>
  );
}
