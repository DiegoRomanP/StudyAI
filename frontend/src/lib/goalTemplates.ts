import type { GoalType } from "../api/types";

export interface GoalTemplate {
  type: GoalType;
  label: string;
  title: string;
  emoji: string;
}

export const GOAL_TEMPLATES = [
  { type: "EXAM", label: "Sacar buena nota", title: "Aprobar el examen", emoji: "🏆" },
  { type: "LEARNING", label: "Solo quiero aprender", title: "Aprender el tema", emoji: "💡" },
  { type: "MEMORIZATION", label: "Necesito memorizar", title: "Memorizar el material", emoji: "🧩" },
] as const satisfies readonly GoalTemplate[];
