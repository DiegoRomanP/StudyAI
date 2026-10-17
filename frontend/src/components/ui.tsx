import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useId } from "react";
import { Check, ChevronRight, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import type { LinkProps } from "react-router-dom";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_BASE =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold leading-5 transition-[color,background-color,border-color,transform,filter] duration-[var(--motion-micro)] active:scale-[0.985] disabled:cursor-not-allowed disabled:border disabled:border-control disabled:bg-surface-disabled disabled:bg-none disabled:text-text-muted disabled:shadow-none motion-reduce:transition-none motion-reduce:active:scale-100";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  // Dark text on the flow gradient keeps ≥ 4.5:1 on every stop (see design-tokens test).
  primary: "border border-transparent bg-flow text-text-on-action shadow-glow hover:brightness-110",
  secondary: "border border-control bg-surface-paper/70 text-text-primary hover:border-action-hover hover:bg-surface-subtle",
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

export type CardVariant = "paper" | "elevated" | "glass";

const CARD_VARIANTS: Record<CardVariant, string> = {
  paper: "border-line bg-surface-paper",
  elevated: "border-line-strong/60 bg-surface-elevated shadow-flow",
  // Translucent surface without backdrop blur (S10: no stacked blur layers).
  glass: "border-glass-line bg-glass shadow-flow",
};

export function Card({
  children,
  className = "",
  variant = "paper",
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: CardVariant }) {
  return (
    <div className={`rounded-surface border p-5 ${CARD_VARIANTS[variant]} ${className}`} {...props}>
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
        className="h-full rounded-full bg-flow transition-[width] duration-[var(--motion-card)] ease-flow motion-reduce:transition-none"
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

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
};

export function Textarea({
  id,
  label,
  hint,
  error,
  className = "",
  "aria-describedby": existingDescription,
  "aria-invalid": existingInvalid,
  ...props
}: TextareaProps) {
  const describedBy = fieldDescriptionIds(id, hint, error, existingDescription);

  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <textarea
        {...props}
        id={id}
        className={`${FIELD_CONTROL} ${error ? "border-state-error" : "border-control"} ${className}`.trim()}
        aria-describedby={describedBy}
        aria-invalid={error ? true : existingInvalid}
      />
    </FieldShell>
  );
}

export type IconTone = "flow" | "muted" | "success" | "warning" | "error";

const ICON_TONES: Record<IconTone, string> = {
  flow: "bg-flow-soft text-action-hover ring-1 ring-inset ring-glass-line",
  muted: "bg-surface-muted text-text-muted",
  success: "bg-state-success-subtle text-state-success",
  warning: "bg-state-warning-subtle text-state-warning",
  error: "bg-state-error-subtle text-state-error",
};

/** Decorative icon in a soft tile; the surrounding text carries the meaning. */
export function IconTile({
  icon: Icon,
  tone = "flow",
  className = "h-10 w-10",
}: {
  icon: LucideIcon;
  tone?: IconTone;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-control ${ICON_TONES[tone]} ${className}`}
    >
      <Icon className="h-5 w-5" strokeWidth={1.8} />
    </span>
  );
}

/** Circular progress with a gradient stroke and an accessible text equivalent. */
export function ProgressRing({
  value,
  label,
  caption,
  size = 132,
}: {
  value: number;
  label: string;
  caption?: ReactNode;
  size?: number;
}) {
  const gradientId = `ring-${useId().replace(/:/g, "")}`;
  const bounded = Math.round(Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0)));
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <figure className="flex flex-col items-center gap-2" aria-label={`${label}: ${bounded}%`} role="img">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#A991FF" />
              <stop offset="55%" stopColor="#5178FF" />
              <stop offset="100%" stopColor="#61D9F2" />
            </linearGradient>
          </defs>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgb(var(--color-surface-muted))"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - bounded / 100)}
            className="transition-[stroke-dashoffset] duration-[var(--motion-page)] ease-flow motion-reduce:transition-none"
          />
        </svg>
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center font-display text-3xl font-bold text-text-primary"
        >
          {bounded}%
        </span>
      </div>
      {caption && <figcaption className="text-center text-sm text-text-muted">{caption}</figcaption>}
    </figure>
  );
}

export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = "flow",
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: IconTone;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-surface border border-line bg-surface-subtle/70 p-4">
      {icon && <IconTile icon={icon} tone={tone} className="h-9 w-9" />}
      <div className="min-w-0">
        <p className="text-sm text-text-muted">{label}</p>
        <p className="mt-0.5 font-display text-2xl font-bold text-text-primary">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-text-muted">{hint}</p>}
      </div>
    </div>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
}

/**
 * A group of toggle buttons where exactly one is pressed (7d/30d/Todo, Semana/Lista…).
 * `appearance="chips"` renders the lighter filter-chip style.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  appearance = "segmented",
  className = "",
}: {
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  appearance?: "segmented" | "chips";
  className?: string;
}) {
  const chips = appearance === "chips";
  return (
    <div
      role="group"
      aria-label={label}
      className={`${
        chips ? "flex flex-wrap gap-2" : "inline-flex rounded-full border border-line bg-surface-subtle p-1"
      } ${className}`.trim()}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`min-h-11 rounded-full px-4 text-sm font-medium transition-colors duration-[var(--motion-micro)] motion-reduce:transition-none ${
              selected
                ? chips
                  ? "bg-action-fill text-text-on-action"
                  : "bg-flow text-text-on-action shadow-glow"
                : chips
                  ? "border border-line bg-surface-paper text-text-muted hover:border-action-hover hover:text-text-primary"
                  : "text-text-muted hover:text-text-primary"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** A large selectable option (goal template, provider…) with icon, description and check. */
export function OptionCard({
  title,
  description,
  icon,
  selected,
  onSelect,
  disabled,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      disabled={disabled}
      className={`flex min-h-16 w-full items-center gap-3 rounded-surface border p-3 text-left transition-colors duration-[var(--motion-micro)] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none ${
        selected
          ? "border-action-hover bg-action-subtle"
          : "border-line bg-surface-paper hover:border-line-strong hover:bg-surface-subtle"
      }`}
    >
      {icon && <IconTile icon={icon} tone={selected ? "flow" : "muted"} />}
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-text-primary">{title}</span>
        {description && <span className="mt-0.5 block text-sm text-text-muted">{description}</span>}
      </span>
      <span
        aria-hidden="true"
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
          selected ? "border-transparent bg-flow text-text-on-action" : "border-control text-transparent"
        }`}
      >
        <Check className="h-4 w-4" strokeWidth={2.5} />
      </span>
    </button>
  );
}

export interface ChainStep {
  label: ReactNode;
  detail?: ReactNode;
  icon?: LucideIcon;
}

/** An ordered sequence of steps, e.g. Estudio → Receso → Quiz → Resultado. */
export function StepChain({ label, steps }: { label: string; steps: ChainStep[] }) {
  return (
    <ol aria-label={label} className="flex flex-wrap items-center gap-2">
      {steps.map((step, index) => (
        <li key={index} className="flex items-center gap-2">
          <span className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line bg-surface-subtle/70 px-3 py-2">
            {step.icon && <step.icon aria-hidden="true" className="h-4 w-4 text-action-hover" strokeWidth={1.8} />}
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-medium text-text-primary">{step.label}</span>
              {step.detail && <span className="text-xs text-text-muted">{step.detail}</span>}
            </span>
          </span>
          {index < steps.length - 1 && (
            <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-text-muted" />
          )}
        </li>
      ))}
    </ol>
  );
}
