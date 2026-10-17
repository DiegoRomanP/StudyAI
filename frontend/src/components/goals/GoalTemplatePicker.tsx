import type { GoalType } from "../../api/types";
import { GOAL_TEMPLATES, type GoalTemplate } from "../../lib/goalTemplates";
import { OptionCard } from "../ui";

interface GoalTemplatePickerProps {
  selectedGoalType: GoalType | null;
  onSelect: (template: GoalTemplate) => void;
}

export function GoalTemplatePicker({ selectedGoalType, onSelect }: GoalTemplatePickerProps) {
  return (
    <div role="group" aria-label="Plantillas de meta" className="grid gap-3 sm:grid-cols-3">
      {GOAL_TEMPLATES.map((template) => (
        <OptionCard
          key={template.type}
          title={template.label}
          icon={template.icon}
          selected={selectedGoalType === template.type}
          onSelect={() => onSelect(template)}
        />
      ))}
    </div>
  );
}
