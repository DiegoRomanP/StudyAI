import { useId } from "react";

/**
 * StudyAI's flowing mark, drawn from the supplied `images/icono.svg` (same path,
 * gradient stops and node), plus the wordmark. Decorative: wrap it in a link or
 * heading that carries the accessible name.
 */
export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  const gradientId = `studyai-flow-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="1" y2="0">
          <stop offset="0%" stopColor="#24BED1" />
          <stop offset="100%" stopColor="#A5A1FF" />
        </linearGradient>
      </defs>
      <path
        d="M12 39 C21 16 31 15 37 28 S48 48 54 22"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="37" cy="28" r="4" fill="#B9A8FF" />
    </svg>
  );
}

export function Logo({
  className = "",
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`.trim()}>
      <LogoMark className={markClassName} />
      <span className="font-display text-xl font-bold tracking-tight text-text-primary">StudyAI</span>
    </span>
  );
}
