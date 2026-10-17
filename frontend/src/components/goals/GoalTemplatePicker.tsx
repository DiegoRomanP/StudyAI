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
    <div role="group" aria-label="Plantillas de meta" className={className}>
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
  );
}
