import { useState } from "react";

import type { GoalDTO, GoalType } from "../api/types";
import { Badge, Button, Card, Spinner } from "../components/ui";
import { useCreateGoal, useDeleteGoal, useGoals, useUpdateGoal } from "../hooks/queries";
import { useShowMore } from "../hooks/useShowMore";

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
  const { visible, hiddenCount, expanded, showMore, showLess } = useShowMore(goals);

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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Descripción</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detalles: temas a cubrir, fecha, énfasis..."
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500"
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
          <>
            <div className="grid gap-3">
              {visible.map((g) => (
                <GoalRow key={g.id} goal={g} />
              ))}
            </div>
            {hiddenCount > 0 && (
              <Button variant="secondary" onClick={showMore}>
                Mostrar {hiddenCount} más
              </Button>
            )}
            {expanded && goals.length > 6 && (
              <Button variant="ghost" onClick={showLess}>
                Mostrar menos
              </Button>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-400">Aún no tienes metas.</p>
        )}
      </section>
    </div>
  );
}

function GoalRow({ goal }: { goal: GoalDTO }) {
  const updateGoal = useUpdateGoal();
  const deleteGoal = useDeleteGoal();

  const [editing, setEditing] = useState(false);
  const [goalType, setGoalType] = useState<GoalType>(goal.goal_type);
  const [title, setTitle] = useState(goal.title);
  const [description, setDescription] = useState(goal.description);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setGoalType(goal.goal_type);
    setTitle(goal.title);
    setDescription(goal.description);
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    if (!title.trim()) {
      setError("El título no puede estar vacío.");
      return;
    }
    setError(null);
    try {
      await updateGoal.mutateAsync({
        id: goal.id,
        payload: { goal_type: goalType, title: title.trim(), description },
      });
      setEditing(false);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Error al guardar los cambios.");
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `¿Eliminar la meta "${goal.title}"? Esto también elimina los planes generados a partir de ella. Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    setError(null);
    try {
      await deleteGoal.mutateAsync(goal.id);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Error al eliminar la meta.");
    }
  }

  if (editing) {
    return (
      <Card className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Tipo</label>
          <select
            value={goalType}
            onChange={(e) => setGoalType(e.target.value as GoalType)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500"
          >
            {(Object.keys(TYPE_LABELS) as GoalType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Título</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Descripción</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={updateGoal.isPending}>
            {updateGoal.isPending ? "Guardando..." : "Guardar cambios"}
          </Button>
          <Button variant="secondary" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium text-slate-800">{goal.title}</p>
        {goal.description && <p className="mt-1 text-sm text-slate-500">{goal.description}</p>}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
        <Badge color="brand">{TYPE_LABELS[goal.goal_type]}</Badge>
        <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={startEdit}>
          Editar
        </Button>
        <Button
          variant="danger"
          className="px-2.5 py-1 text-xs"
          onClick={handleDelete}
          disabled={deleteGoal.isPending}
        >
          {deleteGoal.isPending ? "Eliminando..." : "Eliminar"}
        </Button>
      </div>
    </Card>
  );
}
