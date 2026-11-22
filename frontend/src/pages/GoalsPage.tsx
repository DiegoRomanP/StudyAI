import { useEffect, useId, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Pencil, Target, Trash2 } from "lucide-react";

import type { GoalDTO, GoalType } from "../api/types";
import { getApiErrorMessage } from "../api/errors";
import { HelpTip } from "../components/help/HelpTip";
import { GoalTemplatePicker } from "../components/goals/GoalTemplatePicker";
import { AsyncState } from "../components/AsyncState";
import { EmptyState } from "../components/EmptyState";
import { PageHeader, Alert, Badge, Button, ButtonLink, Card, Input, Select, Skeleton, Textarea } from "../components/ui";
import { useCreateGoal, useDeleteGoal, useGoals, useUpdateGoal } from "../hooks/queries";
import {
  GOAL_TEMPLATES,
  GOAL_TYPE_DESCRIPTIONS,
  GOAL_TYPE_LABELS as TYPE_LABELS,
  type GoalTemplate,
} from "../lib/goalTemplates";

const TITLE_REQUIRED = "Escribe un título para tu meta.";
import { useShowMore } from "../hooks/useShowMore";
import { examCountdown } from "../lib/studyProgress";

function GoalTypeHelp() {
  return (
    <HelpTip label="Tipo de estudio">
      <ul className="space-y-1">
        {(Object.keys(TYPE_LABELS) as GoalType[]).map((type) => (
          <li key={type}>
            <strong>{TYPE_LABELS[type]}:</strong> {GOAL_TYPE_DESCRIPTIONS[type]}
          </li>
        ))}
      </ul>
    </HelpTip>
  );
}

export function GoalsPage() {
  const goalsQuery = useGoals();
  const goals = goalsQuery.data;
  const createGoal = useCreateGoal();
  const { visible, hiddenCount, expanded, showMore, showLess } = useShowMore(goals);

  const [searchParams] = useSearchParams();
  const wantsNew = searchParams.get("nueva") === "1";
  const [showForm, setShowForm] = useState(wantsNew);
  const formOpen = showForm || !goals || goals.length === 0;
  const [goalType, setGoalType] = useState<GoalType>("LEARNING");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [examDate, setExamDate] = useState("");
  const [savedGoal, setSavedGoal] = useState<GoalDTO | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  // "?nueva=1" (Inicio's "Nueva meta") lands with the form open and the title focused.
  useEffect(() => {
    if (wantsNew) document.getElementById("new-goal-title")?.focus();
  }, [wantsNew]);

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
        ...(examDate ? { exam_date: examDate } : {}),
      });
      setSavedGoal(created);
      setShowForm(true); // keep the form (and its confirmation) after the list gains this goal
      setSelectedTemplateId(null);
      setTitle("");
      setDescription("");
      setExamDate("");
    } catch (error) {
      setCreateError(getApiErrorMessage(error, "No se pudo guardar la meta."));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Target}
        title="Metas"
        help="metas"
        actions={
          !formOpen && (
            <Button variant="secondary" onClick={() => setShowForm(true)}>
              + Nueva meta
            </Button>
          )
        }
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Tus metas</h2>
        <AsyncState
          data={goals}
          isLoading={goalsQuery.isPending}
          isError={goalsQuery.isError}
          isFetching={goalsQuery.isFetching}
          isEmpty={(items) => items.length === 0}
          loading={
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <Skeleton key={i} height={72} />
              ))}
            </div>
          }
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

      {formOpen && (
        <div className="space-y-6">
      <GoalTemplatePicker selectedTemplateId={selectedTemplateId} onSelect={applyTemplate} />

      <Card className="space-y-4">
        <Input
          id="new-goal-title"
          label="Título"
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
        <div className="flex items-end gap-1">
        <Select
          id="new-goal-type"
          label="Tipo de estudio"
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
        <GoalTypeHelp />
        </div>
        <Input
          id="new-goal-exam-date"
          type="date"
          label="Fecha del examen (opcional)"
          value={examDate}
          onChange={(event) => {
            setExamDate(event.target.value);
            setSavedGoal(null);
          }}
        />
        <Textarea
          id="new-goal-description"
          label="Descripción (opcional)"
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
          <Alert tone="success" title="Meta guardada">
            <div>
              <ButtonLink to={`/inicio?meta=${savedGoal.id}#preparar-plan`} variant="secondary">
                Generar un plan con esta meta
              </ButtonLink>
            </div>
          </Alert>
        )}
        {createError && <p role="alert" className="text-sm text-state-error">{createError}</p>}
      </Card>
        </div>
      )}
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
  const [examDate, setExamDate] = useState(goal.exam_date ?? "");
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setGoalType(goal.goal_type);
    setTitle(goal.title);
    setDescription(goal.description);
    setExamDate(goal.exam_date ?? "");
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
        payload: { goal_type: goalType, title: title.trim(), description, exam_date: examDate || null },
      });
      setEditing(false);
    } catch (caught: unknown) {
      setError(getApiErrorMessage(caught, "Error al guardar los cambios."));
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `¿Eliminar la meta "${goal.title}"? Tus planes, sesiones de estudio y práctica se conservan; solo dejarás de poder crear planes nuevos con esta meta.`
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
        <div className="flex items-end gap-1">
        <Select
          id={typeId}
          label="Tipo de estudio"
          value={goalType}
          onChange={(e) => setGoalType(e.target.value as GoalType)}
        >
          {(Object.keys(TYPE_LABELS) as GoalType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
        <GoalTypeHelp />
        </div>
        <Input
          id={titleId}
          label="Título"
          value={title}
          maxLength={255}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Input
          id={`${fieldPrefix}-exam-date`}
          type="date"
          label="Fecha del examen (opcional)"
          value={examDate}
          onChange={(e) => setExamDate(e.target.value)}
        />
        <Textarea
          id={descriptionId}
          label="Descripción (opcional)"
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
        {goal.exam_date && (
          <p className="mt-1 text-sm text-text-muted">
            Examen: {goal.exam_date}
            {examCountdown(goal.exam_date) ? ` · ${examCountdown(goal.exam_date)}` : ""}
          </p>
        )}
        {goal.description && <p className="mt-1 text-sm text-text-muted">{goal.description}</p>}
        {error && <p role="alert" className="mt-1 text-xs text-state-error">{error}</p>}
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
        <Badge color="brand">{TYPE_LABELS[goal.goal_type]}</Badge>
        <Button variant="ghost" aria-label={`Editar «${goal.title}»`} onClick={startEdit}>
          <Pencil aria-hidden="true" className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          aria-label={`Eliminar «${goal.title}»`}
          className="hover:!bg-state-error-subtle hover:!text-state-error"
          onClick={handleDelete}
          disabled={deleteGoal.isPending}
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
