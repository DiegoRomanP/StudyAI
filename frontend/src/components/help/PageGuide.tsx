import { PAGE_GUIDES, type GuideId } from "../../lib/pageGuides";
import { BookOpen, ClipboardCheck, Coffee } from "lucide-react";

import { StepChain } from "../ui";
import { HelpTip } from "./HelpTip";

/** "?" with the page's how-it-works steps as text. No state, no API dependency (safe on `/demo`). */
export function PageGuide({ id }: { id: GuideId }) {
  const guide = PAGE_GUIDES[id];
  return (
    <HelpTip label={guide.title}>
      <p className="font-semibold">{guide.title}</p>
      <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-text-muted">
        {guide.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {id === "plan-detalle" && (
        <div className="mt-2">
          <StepChain
            label="Cómo es cada sesión"
            steps={[
              { label: "Estudio", detail: "Lees el material", icon: BookOpen },
              { label: "Receso", detail: "5 min", icon: Coffee },
              { label: "Test", detail: "Preguntas y tarjetas", icon: ClipboardCheck },
            ]}
          />
        </div>
      )}
    </HelpTip>
  );
}
