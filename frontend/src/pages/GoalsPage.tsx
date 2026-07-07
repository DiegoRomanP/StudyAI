import { useState } from "react";

import type { GoalType } from "../api/types";
import { Badge, Button, Card, Spinner } from "../components/ui";
import { useCreateGoal, useGoals } from "../hooks/queries";

const TEMPLATES: { type: GoalType; label: string; title: string; emoji: string }[] = [
  { type: "EXAM", label: "Sacar buena nota", title: "Aprobar el examen", emoji: "🏆" },
  { type: "LEARNING", label: "Solo quiero aprender", title: "Aprender el tema", emoji: "💡" },
  { type: "MEMORIZATION", label: "Necesito memorizar", title: "Memorizar el material", emoji: "🧩" },
];

const TYPE_LABELS: Record<GoalType, string> = {
  EXAM: "Examen",
  LEARNING: "Aprender",
  MEMORIZATION: "Memorizar",
};

export function GoalsPage() {
  const { data: goals, isLoading } = useGoals();
  const createGoal = useCreateGoal();

  const [goalType, setGoalType] = useState<GoalType>("LEARNING");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saved, setSaved] = useState(false);

  function applyTemplate(t: (typeof TEMPLATES)[number]) {
    setGoalType(t.type);
    setTitle(t.title);
    setSaved(false);
  }

  async function save() {
    if (!title.trim()) return;
    await createGoal.mutateAsync({ goal_type: goalType, title, description });
    setSaved(true);
    setTitle("");
    setDescription("");
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Metas</h1>
        <p className="text-slate-500">
          Elige una plantilla y describe tu objetivo. La meta ajusta cómo se genera el plan.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {TEMPLATES.map((t) => (
          <button
            key={t.type}
            onClick={() => applyTemplate(t)}
            className={`rounded-xl border p-4 text-left transition ${
              goalType === t.type
                ? "border-brand-500 bg-brand-50"
                : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <div className="text-2xl">{t.emoji}</div>
            <div className="mt-1 font-medium text-slate-800">{t.label}</div>
          </button>
        ))}
      </div>

      <Card className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Título</label>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setSaved(false);
            }}
            placeholder="Ej. Aprobar el parcial de Cálculo"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Descripción</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detalles: temas a cubrir, fecha, énfasis..."
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={!title.trim() || createGoal.isPending}>
            {createGoal.isPending ? "Guardando..." : "Guardar meta"}
          </Button>
          {saved && <span className="text-sm text-green-600">✓ Meta guardada</span>}
        </div>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Tus metas</h2>
        {isLoading ? (
          <Spinner />
        ) : goals && goals.length > 0 ? (
          <div className="grid gap-3">
            {goals.map((g) => (
              <Card key={g.id} className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-slate-800">{g.title}</p>
                  {g.description && (
                    <p className="mt-1 text-sm text-slate-500">{g.description}</p>
                  )}
                </div>
                <Badge color="brand">{TYPE_LABELS[g.goal_type]}</Badge>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">Aún no tienes metas.</p>
        )}
      </section>
    </div>
  );
}
