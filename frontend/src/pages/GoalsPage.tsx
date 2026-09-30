import { useId, useState } from "react";

import type { GoalDTO, GoalType } from "../api/types";
import { getApiErrorMessage } from "../api/errors";
import { GoalTemplatePicker } from "../components/goals/GoalTemplatePicker";
import { Badge, Button, Card, Input, Spinner } from "../components/ui";
import { useCreateGoal, useDeleteGoal, useGoals, useUpdateGoal } from "../hooks/queries";
import type { GoalTemplate } from "../lib/goalTemplates";
import { useShowMore } from "../hooks/useShowMore";

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
  const [selectedTemplateType, setSelectedTemplateType] = useState<GoalType | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saved, setSaved] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function applyTemplate(template: GoalTemplate) {
    setGoalType(template.type);
    setSelectedTemplateType(template.type);
    setTitle(template.title);
    setSaved(false);
    setCreateError(null);
  }

  async function save() {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) return;

    setCreateError(null);
    try {
      await createGoal.mutateAsync({
        goal_type: goalType,
        title: normalizedTitle,
        description,
      });
      setSaved(true);
      setSelectedTemplateType(null);
      setTitle("");
      setDescription("");
    } catch (error) {
      setCreateError(getApiErrorMessage(error, "No se pudo guardar la meta."));
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Metas</h1>
        <p className="text-slate-500">
          Elige una plantilla y describe tu objetivo. La meta ajusta cómo se genera el plan.
        </p>
      </header>

      <GoalTemplatePicker selectedGoalType={selectedTemplateType} onSelect={applyTemplate} />

      <Card className="space-y-4">
        <Input
          id="new-goal-title"
          label="Título"
          hint="El título no puede quedar vacío."
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setSelectedTemplateType(null);
            setSaved(false);
            setCreateError(null);
          }}
          placeholder="Ej. Aprobar el parcial de Cálculo"
        />
        <div>
          <label
            htmlFor="new-goal-description"
            className="mb-1 block text-sm font-medium text-text-primary"
          >
            Descripción
          </label>
          <textarea
            id="new-goal-description"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              setSaved(false);
            }}
            placeholder="Detalles: temas a cubrir, fecha, énfasis..."
            rows={3}
            className="min-h-11 w-full rounded-control border border-control bg-surface-paper px-3 py-2 text-sm text-text-primary focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
          />
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={!title.trim() || createGoal.isPending}>
            {createGoal.isPending ? "Guardando..." : "Guardar meta"}
          </Button>
          {saved && <span role="status" className="text-sm text-state-success">Meta guardada.</span>}
        </div>
        {createError && <p role="alert" className="text-sm text-state-error">{createError}</p>}
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
  const fieldPrefix = useId();
  const typeId = `${fieldPrefix}-type`;
  const titleId = `${fieldPrefix}-title`;
  const descriptionId = `${fieldPrefix}-description`;

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
          <label htmlFor={typeId} className="mb-1 block text-sm font-medium text-text-primary">
            Tipo
          </label>
          <select
            id={typeId}
            value={goalType}
            onChange={(e) => setGoalType(e.target.value as GoalType)}
            className="min-h-11 w-full rounded-control border border-control bg-surface-paper px-3 py-2 text-sm text-text-primary focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
          >
            {(Object.keys(TYPE_LABELS) as GoalType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={titleId} className="mb-1 block text-sm font-medium text-text-primary">
            Título
          </label>
          <input
            id={titleId}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="min-h-11 w-full rounded-control border border-control bg-surface-paper px-3 py-2 text-sm text-text-primary focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
          />
        </div>
        <div>
          <label
            htmlFor={descriptionId}
            className="mb-1 block text-sm font-medium text-text-primary"
          >
            Descripción
          </label>
          <textarea
            id={descriptionId}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="min-h-11 w-full rounded-control border border-control bg-surface-paper px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
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
