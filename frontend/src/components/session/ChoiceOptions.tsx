import { Check, X } from "lucide-react";

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

/**
 * Multiple-choice options as the mockup's 2×2 grid with A–D badges. With `expected`
 * the grid shows feedback: the right option turns green, a wrong pick red, and the
 * options lock.
 */
export function ChoiceOptions({
  options,
  selected,
  onSelect,
  expected,
  label = "Opciones",
}: {
  options: string[];
  selected: string | null;
  onSelect: (option: string) => void;
  /** When set, feedback mode: reveal correctness and lock the options. */
  expected?: string;
  label?: string;
}) {
  const revealed = expected !== undefined;
  // LLM output may repeat an option; show each distinct option once.
  const distinct = options.filter((option, index) => options.indexOf(option) === index);
  return (
    <div role="group" aria-label={label} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {distinct.map((option, index) => {
        const isSelected = selected === option;
        const isCorrect = revealed && option.trim() === expected.trim();
        const isWrongPick = revealed && isSelected && !isCorrect;
        const tone = isCorrect
          ? "border-state-correct bg-state-correct-subtle text-text-primary"
          : isWrongPick
            ? "border-state-error bg-state-error-subtle text-text-primary"
            : isSelected
              ? "border-action bg-action-subtle text-text-primary ring-1 ring-inset ring-action-hover/40"
              : "border-line bg-surface-subtle text-text-primary hover:border-action-hover";
        return (
          <button
            key={`${index}-${option}`}
            type="button"
            aria-pressed={isSelected}
            // aria-disabled (not disabled) keeps focus on the chosen option after feedback.
            aria-disabled={revealed || undefined}
            onClick={() => {
              if (!revealed) onSelect(option);
            }}
            className={`flex min-h-12 items-center gap-3 rounded-control border px-3 py-2 text-left text-sm transition-colors duration-[var(--motion-micro)] motion-reduce:transition-none aria-disabled:cursor-default ${tone}`}
          >
            <span
              aria-hidden="true"
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                isCorrect
                  ? "bg-state-correct text-text-on-action"
                  : isWrongPick
                    ? "bg-state-error text-text-on-action"
                    : isSelected
                      ? "bg-flow text-text-on-action"
                      : "bg-surface-muted text-text-muted"
              }`}
            >
              {LETTERS[index] ?? index + 1}
            </span>
            <span className="min-w-0 flex-1 break-words">{option}</span>
            {isCorrect && (
              <Check role="img" aria-label="Respuesta correcta" className="h-4 w-4 shrink-0 text-state-correct" />
            )}
            {isWrongPick && <X role="img" aria-label="Tu respuesta, incorrecta" className="h-4 w-4 shrink-0 text-state-error" />}
          </button>
        );
      })}
    </div>
  );
}
