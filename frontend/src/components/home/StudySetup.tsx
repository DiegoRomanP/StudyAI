import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, FileUp, KeyRound, Play, RotateCcw, Sparkles, Target } from "lucide-react";

import type { GoalType } from "../../api/types";
import {
  getDocumentsListSnapshot,
  useDocuments,
  useGoals,
  useUploadDocument,
} from "../../hooks/queries";
import { useStudyStart, type StudyStartInput } from "../../hooks/useStudyStart";
import {
  GOAL_TEMPLATES,
  GOAL_TYPE_DESCRIPTIONS,
  GOAL_TYPE_LABELS,
  type GoalTemplate,
} from "../../lib/goalTemplates";
import { DocumentPicker } from "../documents/DocumentPicker";
import { DocumentUpload } from "../documents/DocumentUpload";
import { GoalTemplatePicker } from "../goals/GoalTemplatePicker";
import {
  ActivityIndicator,
  Alert,
  Button,
  ButtonLink,
  Card,
  IconTile,
  Input,
  SegmentedControl,
  Select,
} from "../ui";
import { ProviderQuickSetup, useRuntimeConfirmed } from "./ProviderQuickSetup";

type GoalMode = "new" | "existing";

/**
 * First-use flow in one surface (A10): material → goal → AI provider → "Estudiar".
 * Coordination (writes, retries, recovery) lives in useStudyStart; this component
 * only collects the selection and explains what is missing.
 */
export function StudySetup({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const queryClient = useQueryClient();
  const documentsQuery = useDocuments();
  const documents = documentsQuery.data;
  const upload = useUploadDocument();
  const goalsQuery = useGoals();
  const goals = goalsQuery.data ?? [];
  const runtime = useRuntimeConfirmed();
  const study = useStudyStart();
  const lastInput = useRef<StudyStartInput | null>(null);

  const [selectedDocs, setSelectedDocs] = useState<number[]>([]);
  const [goalMode, setGoalMode] = useState<GoalMode>("new");
  const [existingGoalId, setExistingGoalId] = useState<number | "">("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [goalType, setGoalType] = useState<GoalType>("LEARNING");
  const [title, setTitle] = useState("");

  // Planes recién terminados aparecen en el resto de Inicio (read-only refetch).
  useEffect(() => {
    if (study.plan?.status === "READY" || study.plan?.status === "FAILED") {
      void queryClient.invalidateQueries({ queryKey: ["plans"] });
    }
  }, [queryClient, study.plan?.status]);

  const documentsReliable =
    documents !== undefined &&
    documentsQuery.status === "success" &&
    getDocumentsListSnapshot(queryClient).isConfirmedByGet;
  const indexedIds = new Set(
    (documents ?? []).filter((document) => document.status === "INDEXED").map((document) => document.id),
  );
  const selectedIndexed = selectedDocs.filter((id) => indexedIds.has(id));

  const goalReady = goalMode === "existing" ? existingGoalId !== "" : title.trim().length > 0;
  const missing: string[] = [];
  if (!documentsReliable) {
    missing.push(documentsQuery.isError ? "Reintenta la carga de tus documentos." : "Verificando tus documentos…");
  } else if (selectedIndexed.length === 0) {
    missing.push(
      indexedIds.size === 0
        ? "Sube un PDF o Markdown; en unos segundos estará listo para usar."
        : "Marca al menos un documento listo para usar.",
    );
  }
  if (!goalReady) {
    missing.push(goalMode === "existing" ? "Elige una de tus metas." : "Elige una plantilla o escribe tu meta.");
  }
  if (runtime === "unknown") missing.push("No pudimos comprobar tu IA: pulsa «Reintentar» en el paso 3.");
  if (runtime === "pending") missing.push("Consultando el proveedor de IA…");

  const flowActive = study.phase !== "idle" && study.phase !== "error" && study.phase !== "uncertain";
  // After a lost goal creation, re-creating it needs an explicit choice (see StudyStatus).
  const goalUncertain = study.uncertainStage === "goal" && goalMode === "new";
  // While a plan is generating or ready, "Estudiar" would request a second plan.
  const canStart =
    missing.length === 0 &&
    !study.isBusy &&
    study.phase !== "processing" &&
    study.phase !== "ready" &&
    !goalUncertain;

  const requirementsShown = flowActive ? !study.isBusy : missing.length > 0;

  function applyTemplate(template: GoalTemplate) {
    setTemplateId(template.id);
    setGoalType(template.type);
    setTitle(template.title);
  }

  async function handleStart() {
    const input: StudyStartInput = {
      goal:
        goalMode === "existing" && existingGoalId !== ""
          ? { kind: "existing", goalId: existingGoalId }
          : { kind: "template", payload: { goal_type: goalType, title: title.trim(), description: "" } },
      documentIds: selectedIndexed,
    };
    lastInput.current = input;
    await study.start(input);
  }

  const Heading = `h${headingLevel}` as const;
  const StepHeading = `h${headingLevel + 1}` as "h3" | "h4";

  return (
    <Card variant="glass" className="space-y-6">
      <div className="flex items-start gap-3">
        <IconTile icon={Sparkles} className="h-11 w-11" />
        <div>
          <Heading className="font-display text-xl font-semibold text-text-primary">Prepara tu plan de estudio</Heading>
          <p className="mt-0.5 text-sm text-text-muted">
            Sube tu material, elige tu meta y pulsa «Estudiar». La IA arma las sesiones por ti.
          </p>
        </div>
      </div>

      <ol className="space-y-6">
        <li className="space-y-3">
          <StepTitle
            as={StepHeading}
            number={1}
            icon={FileUp}
            title="Tu material"
            done={selectedIndexed.length > 0}
          />
          <DocumentUpload
            headingLevel={headingLevel === 2 ? 4 : 5}
            onUpload={(file) => upload.mutateAsync(file)}
            documents={documents ?? []}
            documentsError={documentsQuery.isError}
          />
          <DocumentPicker
            documents={documents ?? []}
            selectedDocumentIds={selectedDocs}
            onSelectionChange={setSelectedDocs}
            showEmptyState={documentsReliable && indexedIds.size === 0}
            emptyState={<p>Aún no hay documentos indexados. Sube un PDF o Markdown para empezar.</p>}
          />
          {documentsQuery.isError && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void documentsQuery.refetch()}
              disabled={documentsQuery.isFetching}
            >
              Reintentar carga de documentos
            </Button>
          )}
        </li>

        <li className="space-y-3">
          <StepTitle as={StepHeading} number={2} icon={Target} title="Elige tu meta" done={goalReady} />
          {(goals.length > 0 || goalMode === "existing") && (
            <SegmentedControl
              label="Origen de la meta"
              value={goalMode}
              onChange={setGoalMode}
              options={[
                { value: "new", label: "Nueva meta" },
                { value: "existing", label: "Usar una meta guardada" },
              ]}
            />
          )}
          {goalMode === "existing" && goals.length === 0 ? (
            <p className="text-sm text-text-muted">
              {goalsQuery.isFetching
                ? "Buscando tus metas guardadas…"
                : goalsQuery.isError
                  ? "No se pudieron cargar tus metas guardadas. Vuelve a intentarlo o crea una nueva."
                  : "Aún no tienes metas guardadas. Elige «Nueva meta» para crear una."}
            </p>
          ) : goalMode === "existing" ? (
            <Select
              id="study-existing-goal"
              label="Meta guardada"
              hint="Se reutiliza tal cual; no se crea una meta nueva."
              value={existingGoalId}
              onChange={(event) =>
                setExistingGoalId(event.target.value === "" ? "" : Number(event.target.value))
              }
            >
              <option value="">Selecciona una meta…</option>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title} · {GOAL_TYPE_LABELS[goal.goal_type]}
                </option>
              ))}
            </Select>
          ) : (
            <div className="space-y-3">
              <GoalTemplatePicker selectedTemplateId={templateId} onSelect={applyTemplate} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <Input
                  id="study-goal-title"
                  label="Tu meta"
                  hint="Se guarda al pulsar «Estudiar»."
                  value={title}
                  maxLength={255}
                  placeholder="Ej. Aprobar el parcial de Cálculo"
                  onChange={(event) => {
                    setTitle(event.target.value);
                    // Templates with a preset title deselect once edited; "Otro" (empty preset) stays.
                    const preset = GOAL_TEMPLATES.find((item) => item.id === templateId)?.title;
                    if (templateId && preset && preset !== event.target.value) setTemplateId(null);
                  }}
                />
                <Select
                  id="study-goal-type"
                  label="Tipo de estudio"
                  hint={GOAL_TYPE_DESCRIPTIONS[goalType]}
                  value={goalType}
                  onChange={(event) => setGoalType(event.target.value as GoalType)}
                >
                  {(Object.keys(GOAL_TYPE_LABELS) as GoalType[]).map((type) => (
                    <option key={type} value={type}>
                      {GOAL_TYPE_LABELS[type]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          )}
        </li>

        <li className="space-y-3">
          <StepTitle
            as={StepHeading}
            number={3}
            icon={KeyRound}
            title="Conecta tu IA"
            done={runtime === "confirmed"}
          />
          <ProviderQuickSetup />
        </li>
      </ol>

      <div className="space-y-3 border-t border-line pt-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={handleStart}
            disabled={!canStart}
            aria-describedby={!canStart && requirementsShown ? "study-requirements" : undefined}
            className="px-6"
          >
            {study.isBusy ? "Preparando…" : "Estudiar"}
            {!study.isBusy && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
          </Button>
          {flowActive && !study.isBusy && (
            <p className="text-sm text-text-muted" id="study-requirements">
              {study.phase === "ready"
                ? "Tu plan ya está listo. Para otro material, pulsa «Preparar otro plan»."
                : "Espera a que termine este plan o deja de seguirlo para preparar otro."}
            </p>
          )}
        </div>
        {!flowActive && missing.length > 0 && (
          <div id="study-requirements" className="text-sm text-text-muted">
            <p className="font-medium text-text-primary">Para empezar te falta:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        <StudyStatus
          study={study}
          onRetry={() => lastInput.current && void study.start(lastInput.current)}
          onChooseSavedGoal={() => {
            setGoalMode("existing");
            void goalsQuery.refetch();
          }}
        />
      </div>
    </Card>
  );
}

function StepTitle({
  as: Tag,
  number,
  icon: Icon,
  title,
  done = false,
}: {
  as: "h3" | "h4";
  number: number;
  icon: typeof FileUp;
  title: string;
  done?: boolean;
}) {
  return (
    <Tag
      aria-label={`Paso ${number}: ${title}${done ? " (hecho)" : ""}`}
      className="flex items-center gap-2 font-display text-base font-semibold text-text-primary"
    >
      <span
        aria-hidden="true"
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
          done ? "bg-state-success-subtle text-state-success" : "bg-flow text-text-on-action"
        }`}
      >
        {done ? <Check className="h-4 w-4" strokeWidth={2.5} /> : number}
      </span>
      <Icon aria-hidden="true" className="h-4 w-4 text-action-hover" />
      <span>{title}</span>
      {done && (
        <span aria-hidden="true" className="text-xs font-medium text-state-success">
          Hecho
        </span>
      )}
    </Tag>
  );
}

function StudyStatus({
  study,
  onRetry,
  onChooseSavedGoal,
}: {
  study: ReturnType<typeof useStudyStart>;
  onRetry: () => void;
  onChooseSavedGoal: () => void;
}) {
  return (
    <div aria-live="polite" className="space-y-3">
      {study.phase === "saving-goal" && <ActivityIndicator label="Guardando tu meta…" />}
      {study.phase === "requesting-plan" && <ActivityIndicator label="Solicitando tu plan…" />}
      {study.phase === "processing" && (
        <div className="space-y-2">
          <ActivityIndicator label="Generando tu plan…" />
          <p className="text-sm text-text-muted">
            La IA está analizando tus temas y creando sesiones con material y preguntas. Puedes salir
            de esta página: el plan seguirá generándose.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {study.planId !== null && (
              <ButtonLink to={`/plan/${study.planId}`} variant="secondary">
                Ver el detalle del plan
              </ButtonLink>
            )}
            <Button type="button" variant="ghost" onClick={study.reset}>
              Dejar de seguir este plan
            </Button>
          </div>
        </div>
      )}
      {study.phase === "ready" && study.plan && (
        <Alert tone="success" title="¡Tu plan está listo!">
          <p>
            {study.plan.title} · {study.plan.sessions.length}{" "}
            {study.plan.sessions.length === 1 ? "sesión" : "sesiones"}
          </p>
          <div className="flex flex-wrap gap-2">
            {study.nextSession && (
              <ButtonLink to={`/session/${study.nextSession.id}`}>
                <Play aria-hidden="true" className="h-4 w-4" />
                Comenzar la siguiente sesión
              </ButtonLink>
            )}
            <ButtonLink to={`/plan/${study.plan.id}`} variant="secondary">
              Ver todas las sesiones
            </ButtonLink>
            <Button type="button" variant="ghost" onClick={study.reset}>
              Preparar otro plan
            </Button>
          </div>
        </Alert>
      )}
      {study.phase === "error" && study.error && (
        <Alert tone="error" title="No se pudo preparar tu plan">
          <p>{study.error}</p>
          <div className="flex flex-wrap gap-2">
            {study.planLoadFailed ? (
              <>
                <Button type="button" variant="secondary" onClick={study.retryPlan}>
                  <RotateCcw aria-hidden="true" className="h-4 w-4" />
                  Reintentar
                </Button>
                <Button type="button" variant="ghost" onClick={study.reset}>
                  Dejar de seguir este plan
                </Button>
              </>
            ) : study.planId !== null && (
              <>
                <ButtonLink to="/settings" variant="secondary">
                  Revisar mi IA
                </ButtonLink>
                <Button type="button" variant="ghost" onClick={study.reset}>
                  Empezar de nuevo
                </Button>
              </>
            )}
          </div>
        </Alert>
      )}
      {study.phase === "uncertain" && study.error && (
        <Alert tone="warning" title="Resultado sin confirmar">
          <p>{study.error}</p>
          {study.uncertainStage === "plan" ? (
            <div>
              <Button type="button" variant="secondary" onClick={onRetry}>
                <RotateCcw aria-hidden="true" className="h-4 w-4" />
                Reintentar
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={onChooseSavedGoal}>
                Elegir una meta guardada
              </Button>
              <Button type="button" variant="ghost" onClick={onRetry}>
                Crear la meta de nuevo
              </Button>
            </div>
          )}
        </Alert>
      )}
    </div>
  );
}
