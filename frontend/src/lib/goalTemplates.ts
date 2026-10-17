import { Award, Brain, Lightbulb, type LucideIcon } from "lucide-react";

import type { GoalType } from "../api/types";

export interface GoalTemplate {
  type: GoalType;
  label: string;
  title: string;
  icon: LucideIcon;
}

export const GOAL_TEMPLATES = [
  { type: "EXAM", label: "Sacar buena nota", title: "Aprobar el examen", icon: Award },
  { type: "LEARNING", label: "Solo quiero aprender", title: "Aprender el tema", icon: Lightbulb },
  { type: "MEMORIZATION", label: "Necesito memorizar", title: "Memorizar el material", icon: Brain },
] as const satisfies readonly GoalTemplate[];
