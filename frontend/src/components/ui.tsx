import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { Link } from "react-router-dom";
import type { LinkProps } from "react-router-dom";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_BASE =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-control px-4 py-3 text-sm font-semibold leading-5 transition-colors disabled:cursor-not-allowed disabled:border disabled:border-control disabled:bg-surface-disabled disabled:text-text-muted motion-reduce:transition-none";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "border border-transparent bg-action text-text-on-action hover:bg-action-hover",
  secondary: "border border-control bg-surface-paper text-text-primary hover:bg-surface-subtle",
  ghost: "border border-transparent bg-transparent text-text-muted hover:bg-surface-subtle hover:text-text-primary",
  danger: "border border-transparent bg-state-error text-text-on-action hover:brightness-95",
};

function buttonClassName(variant: ButtonVariant, className: string) {
  return `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`.trim();
}

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button className={buttonClassName(variant, className)} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  className = "",
  children,
  ...props
}: LinkProps & { variant?: ButtonVariant }) {
  return (
    <Link className={buttonClassName(variant, className)} {...props}>
      {children}
    </Link>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-surface border border-line bg-surface-paper p-5 ${className}`}>
      {children}
    </div>
  );
}

type BadgeColor = "slate" | "green" | "amber" | "red" | "brand";

const BADGE_COLORS: Record<BadgeColor, string> = {
  slate: "bg-surface-muted text-text-muted",
  green: "bg-state-success-subtle text-state-success",
  amber: "bg-state-warning-subtle text-state-warning",
  red: "bg-state-error-subtle text-state-error",
  brand: "bg-action-subtle text-action",
};

export function Badge({
  children,
  color = "slate",
}: {
  children: ReactNode;
  color?: BadgeColor;
}) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${BADGE_COLORS[color]}`}>
      {children}
    </span>
  );
}

export function Spinner({ label, className = "" }: { label?: string; className?: string }) {
  return (
    <div
      className={`flex items-center gap-3 text-text-muted ${className}`}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-live={label ? "polite" : undefined}
      aria-busy={label ? true : undefined}
    >
      <span
        aria-hidden="true"
        className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-line border-t-action"
      />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function ActivityIndicator({ label, className = "" }: { label: string; className?: string }) {
  return <Spinner label={label} className={className} />;
}

export type SkeletonWidth = number | `${number}%`;

function safeSkeletonWidth(width: SkeletonWidth): SkeletonWidth {
  if (typeof width === "number") {
    return Number.isFinite(width) && width > 0 ? width : "100%";
  }

  const percentage = Number.parseFloat(width);
  return /^\d+(?:\.\d+)?%$/.test(width) && percentage > 0 && percentage <= 100 ? width : "100%";
}

export function Skeleton({
  height,
  width = "100%",
  className = "",
}: {
  height: number;
  width?: SkeletonWidth;
  className?: string;
}) {
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 16;
  const safeWidth = safeSkeletonWidth(width);
  const reservedSize: CSSProperties = { height: safeHeight, width: safeWidth };

  return (
    <div
      aria-hidden="true"
      className={`block max-w-full rounded-control bg-surface-muted motion-safe:animate-pulse ${className}`}
      style={reservedSize}
    />
  );
}

export function ProgressBar({ value, label = "Progreso" }: { value: number; label?: string }) {
  const boundedValue = Math.min(100, Math.max(0, value));

  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-surface-muted"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={boundedValue}
    >
      <div
        className="h-full rounded-full bg-action transition-[width] motion-reduce:transition-none"
        style={{ width: `${boundedValue}%` }}
      />
    </div>
  );
}

interface FieldShellProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}

function FieldShell({ id, label, hint, error, children }: FieldShellProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-text-primary">
        {label}
      </label>
      {children}
      {hint && <p id={`${id}-hint`} className="text-sm text-text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-sm text-state-error">{error}</p>}
    </div>
  );
}

function fieldDescriptionIds(id: string, hint: ReactNode, error: ReactNode, existing?: string) {
  return [existing, hint ? `${id}-hint` : undefined, error ? `${id}-error` : undefined]
    .filter(Boolean)
    .join(" ") || undefined;
}

const FIELD_CONTROL =
  "block min-h-11 w-full rounded-control border border-control bg-surface-paper px-3 py-2 text-sm text-text-primary placeholder:text-text-muted transition-colors focus-visible:border-action-hover disabled:cursor-not-allowed disabled:border-control disabled:bg-surface-disabled disabled:text-text-muted motion-reduce:transition-none";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
};

export function Input({
  id,
  label,
  hint,
  error,
  className = "",
  "aria-describedby": existingDescription,
  "aria-invalid": existingInvalid,
  ...props
}: InputProps) {
  const describedBy = fieldDescriptionIds(id, hint, error, existingDescription);

  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input
        {...props}
        id={id}
        className={`${FIELD_CONTROL} ${error ? "border-state-error" : "border-control"} ${className}`.trim()}
        aria-describedby={describedBy}
        aria-invalid={error ? true : existingInvalid}
      />
    </FieldShell>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
};

export function Select({
  id,
  label,
  hint,
  error,
  className = "",
  children,
  "aria-describedby": existingDescription,
  "aria-invalid": existingInvalid,
  ...props
}: SelectProps) {
  const describedBy = fieldDescriptionIds(id, hint, error, existingDescription);

  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <select
        {...props}
        id={id}
        className={`${FIELD_CONTROL} ${error ? "border-state-error" : "border-control"} ${className}`.trim()}
        aria-describedby={describedBy}
        aria-invalid={error ? true : existingInvalid}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export type AlertTone = "info" | "success" | "warning" | "error";

const ALERT_TONES: Record<AlertTone, string> = {
  info: "border-line bg-surface-subtle text-text-primary",
  success: "border-state-success bg-state-success-subtle text-state-success",
  warning: "border-state-warning bg-state-warning-subtle text-state-warning",
  error: "border-state-error bg-state-error-subtle text-state-error",
};

export function Alert({
  tone = "info",
  title,
  className = "",
  role,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: AlertTone; title?: ReactNode }) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-surface border p-4 text-sm ${ALERT_TONES[tone]} ${className}`.trim()}
      role={role ?? (tone === "error" ? "alert" : "status")}
      {...props}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children}
    </div>
  );
}
