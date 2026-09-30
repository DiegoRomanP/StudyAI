import type { GoalType } from "../../api/types";
import { GOAL_TEMPLATES, type GoalTemplate } from "../../lib/goalTemplates";

interface GoalTemplatePickerProps {
  selectedGoalType: GoalType | null;
  onSelect: (template: GoalTemplate) => void;
}

export function GoalTemplatePicker({ selectedGoalType, onSelect }: GoalTemplatePickerProps) {
  return (
    <div role="group" aria-label="Plantillas de meta" className="grid gap-3 sm:grid-cols-3">
      {GOAL_TEMPLATES.map((template) => (
        <button
          key={template.type}
          type="button"
          aria-pressed={selectedGoalType === template.type}
          onClick={() => onSelect(template)}
          className={`min-h-11 rounded-surface border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 motion-reduce:transition-none ${
            selectedGoalType === template.type
              ? "border-action bg-action-subtle text-text-primary"
              : "border-line bg-surface-paper text-text-primary hover:bg-surface-subtle"
          }`}
        >
          <span aria-hidden="true" className="text-2xl">
            {template.emoji}
          </span>
          <span className="mt-1 block font-medium">{template.label}</span>
        </button>
      ))}
    </div>
  );
}
