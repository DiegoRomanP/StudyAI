import { BriefcaseBusiness, GraduationCap, PencilLine, Sprout, Award, type LucideIcon } from "lucide-react";

import type { GoalType } from "../api/types";

/**
 * Goal templates from the "Elige tu meta" design. A template only pre-fills the form:
 * nothing is saved until the user confirms. `type` is the default study strategy
 * (the backend's GoalType) and stays editable.
 */
export interface GoalTemplate {
  id: string;
  label: string;
  description: string;
  type: GoalType;
  title: string;
  icon: LucideIcon;
}

export const GOAL_TEMPLATES = [
  {
    id: "university",
    label: "Universidad",
    description: "Cursos y exámenes",
    type: "EXAM",
    title: "Aprobar el examen del curso",
    icon: GraduationCap,
  },
  {
    id: "certification",
    label: "Certificaciones",
    description: "AWS, Google, etc.",
    type: "EXAM",
    title: "Aprobar la certificación",
    icon: Award,
  },
  {
    id: "interviews",
    label: "Entrevistas técnicas",
    description: "Conceptos y respuestas clave",
    type: "MEMORIZATION",
    title: "Preparar entrevistas técnicas",
    icon: BriefcaseBusiness,
  },
  {
    id: "from-scratch",
    label: "Aprender desde cero",
    description: "Entender un tema nuevo",
    type: "LEARNING",
    title: "Aprender el tema desde cero",
    icon: Sprout,
  },
  {
    id: "other",
    label: "Otro",
    description: "Escribe tu propia meta",
    type: "LEARNING",
    title: "",
    icon: PencilLine,
  },
] as const satisfies readonly GoalTemplate[];

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  EXAM: "Examen",
  LEARNING: "Aprender",
  MEMORIZATION: "Memorizar",
};
