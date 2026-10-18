import { GOAL_TEMPLATES, type GoalTemplate } from "../../lib/goalTemplates";
import { OptionCard } from "../ui";

interface GoalTemplatePickerProps {
  selectedTemplateId: string | null;
  onSelect: (template: GoalTemplate) => void;
  className?: string;
}

export function GoalTemplatePicker({
  selectedTemplateId,
  onSelect,
  className = "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3",
}: GoalTemplatePickerProps) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-medium text-text-primary">
        Elige una plantilla (puedes cambiarla luego)
      </legend>
      <div className={className}>
        {GOAL_TEMPLATES.map((template) => (
          <OptionCard
            key={template.id}
            title={template.label}
            description={template.description}
            icon={template.icon}
            selected={selectedTemplateId === template.id}
            onSelect={() => onSelect(template)}
          />
        ))}
      </div>
    </fieldset>
  );
}
