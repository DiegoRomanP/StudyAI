import { useId, useState } from "react";
import { Target } from "lucide-react";

import type { GoalDTO, GoalType } from "../api/types";
import { getApiErrorMessage } from "../api/errors";
import { GoalTemplatePicker } from "../components/goals/GoalTemplatePicker";
import { AsyncState } from "../components/AsyncState";
import { EmptyState } from "../components/EmptyState";
import { PageGuide } from "../components/help/PageGuide";
import { Alert, Badge, Button, ButtonLink, Card, Input, Select, Skeleton, Textarea } from "../components/ui";
import { useCreateGoal, useDeleteGoal, useGoals, useUpdateGoal } from "../hooks/queries";
import {
  GOAL_TEMPLATES,
  GOAL_TYPE_DESCRIPTIONS,
  GOAL_TYPE_LABELS as TYPE_LABELS,
  type GoalTemplate,
} from "../lib/goalTemplates";

const TITLE_HINT = "Por ejemplo: «Examen final de Bases de datos».";
const TITLE_REQUIRED = "Escribe un título para tu meta.";
const DESCRIPTION_HINT = "Opcional. La IA la tiene en cuenta para enfocar el plan.";
import { useShowMore } from "../hooks/useShowMore";

export function GoalsPage() {
  const goalsQuery = useGoals();
  const goals = goalsQuery.data;
  const createGoal = useCreateGoal();
  const { visible, hiddenCount, expanded, showMore, showLess } = useShowMore(goals);

  const [goalType, setGoalType] = useState<GoalType>("LEARNING");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [savedGoal, setSavedGoal] = useState<GoalDTO | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  function applyTemplate(template: GoalTemplate) {
    setGoalType(template.type);
    setSelectedTemplateId(template.id);
    setTitle(template.title);
    setSavedGoal(null);
    setTitleError(null);
    setCreateError(null);
  }

  async function save() {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setTitleError(TITLE_REQUIRED);
      return;
    }

    setCreateError(null);
    try {
      const created = await createGoal.mutateAsync({
        goal_type: goalType,
        title: normalizedTitle,
        description,
      });
      setSavedGoal(created);
      setSelectedTemplateId(null);
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
        <p className="text-text-muted">
          Elige una plantilla y describe tu objetivo. La meta ajusta cómo se genera el plan.
        </p>
      </header>

      <PageGuide id="metas" />

      <GoalTemplatePicker selectedTemplateId={selectedTemplateId} onSelect={applyTemplate} />

      <Card className="space-y-4">
        <Input
          id="new-goal-title"
          label="Título"
          hint={TITLE_HINT}
          error={titleError}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            // "Otro" has no preset title, so typing keeps it selected.
            const preset = GOAL_TEMPLATES.find((item) => item.id === selectedTemplateId)?.title;
            if (preset && preset !== event.target.value) setSelectedTemplateId(null);
            setSavedGoal(null);
            setTitleError(null);
            setCreateError(null);
          }}
          placeholder="Ej. Aprobar el parcial de Cálculo"
          maxLength={255}
        />
        <Select
          id="new-goal-type"
          label="Tipo de estudio"
          hint={GOAL_TYPE_DESCRIPTIONS[goalType]}
          value={goalType}
          onChange={(event) => {
            setGoalType(event.target.value as GoalType);
            setSavedGoal(null);
          }}
        >
          {(Object.keys(TYPE_LABELS) as GoalType[]).map((type) => (
            <option key={type} value={type}>
              {TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
        <Textarea
          id="new-goal-description"
          label="Descripción"
          hint={DESCRIPTION_HINT}
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
            setSavedGoal(null);
          }}
          placeholder="Detalles: temas a cubrir, fecha, énfasis..."
          rows={3}
        />
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={createGoal.isPending}>
            {createGoal.isPending ? "Guardando..." : "Guardar meta"}
          </Button>
        </div>
        {savedGoal && (
          <Alert tone="success" title="Meta guardada.">
            <p>Siguiente paso: genera un plan con tus documentos.</p>
            <div>
              <ButtonLink to={`/plan?meta=${savedGoal.id}`} variant="secondary">
                Generar un plan con esta meta
              </ButtonLink>
            </div>
          </Alert>
        )}
        {createError && <p role="alert" className="text-sm text-state-error">{createError}</p>}
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Tus metas</h2>
        <AsyncState
          data={goals}
          isLoading={goalsQuery.isPending}
          isError={goalsQuery.isError}
          isFetching={goalsQuery.isFetching}
          isEmpty={(items) => items.length === 0}
          loading={<Skeleton height={72} />}
          loadingLabel="Cargando metas"
          empty={
            <EmptyState
              icon={Target}
              title="Aún no tienes metas"
              description="Una meta le dice a la IA para qué estudias: un examen, aprender algo nuevo o memorizar."
            />
          }
          onRetry={() => void goalsQuery.refetch()}
          initialErrorMessage="No se pudieron cargar tus metas."
          updateErrorMessage="No se pudieron actualizar tus metas. Se muestran las últimas cargadas."
        >
          {(items) => (
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
              {expanded && items.length > 6 && (
                <Button variant="ghost" onClick={showLess}>
                  Mostrar menos
                </Button>
              )}
            </>
          )}
        </AsyncState>
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
      setError(TITLE_REQUIRED);
      return;
    }
    setError(null);
    try {
      await updateGoal.mutateAsync({
        id: goal.id,
        payload: { goal_type: goalType, title: title.trim(), description },
      });
      setEditing(false);
    } catch (caught: unknown) {
      setError(getApiErrorMessage(caught, "Error al guardar los cambios."));
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
    } catch (caught: unknown) {
      setError(getApiErrorMessage(caught, "Error al eliminar la meta."));
    }
  }

  if (editing) {
    return (
      <Card className="space-y-3">
        <Select
          id={typeId}
          label="Tipo de estudio"
          hint={GOAL_TYPE_DESCRIPTIONS[goalType]}
          value={goalType}
          onChange={(e) => setGoalType(e.target.value as GoalType)}
        >
          {(Object.keys(TYPE_LABELS) as GoalType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
        <Input
          id={titleId}
          label="Título"
          hint={TITLE_HINT}
          value={title}
          maxLength={255}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          id={descriptionId}
          label="Descripción"
          hint={DESCRIPTION_HINT}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
        {error && <p role="alert" className="text-sm text-state-error">{error}</p>}
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
        <p className="font-medium text-text-primary">{goal.title}</p>
        {goal.description && <p className="mt-1 text-sm text-text-muted">{goal.description}</p>}
        {error && <p role="alert" className="mt-1 text-xs text-state-error">{error}</p>}
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
