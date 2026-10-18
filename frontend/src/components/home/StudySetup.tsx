import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileUp,
  KeyRound,
  Play,
  RotateCcw,
  Sparkles,
  Target,
} from "lucide-react";

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
import { AiStep, useAiReadiness } from "./AiStep";

type GoalMode = "new" | "existing";
type StepId = "material" | "meta" | "ia" | "listo";

const STEPS: { id: StepId; label: string; title: string; icon: typeof FileUp }[] = [
  { id: "material", label: "Material", title: "Sube tu material", icon: FileUp },
  { id: "meta", label: "Meta", title: "Elige tu meta", icon: Target },
  { id: "ia", label: "IA", title: "Conecta tu IA", icon: KeyRound },
  { id: "listo", label: "Listo", title: "Todo listo", icon: Sparkles },
];

/**
 * First-use flow, one thing at a time: material → goal → AI → "Estudiar". Each step shows
 * only its own content and "Continuar" stays disabled (with its reason) until it is done;
 * "Estudiar" only exists on the last step, reachable once every step is complete.
 * Coordination (writes, retries, recovery) lives in useStudyStart; this component only
 * collects the selection and explains what is missing.
 */
export function StudySetup({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const queryClient = useQueryClient();
  const documentsQuery = useDocuments();
  const documents = documentsQuery.data;
  const upload = useUploadDocument();
  const goalsQuery = useGoals();
  const goals = goalsQuery.data ?? [];
  const ai = useAiReadiness();
  const study = useStudyStart();
  const lastInput = useRef<StudyStartInput | null>(null);
  const stepRef = useRef<HTMLDivElement>(null);
  const movedByUser = useRef(false);

  const [stepIndex, setStepIndex] = useState(0);
  const [aiRequested, setAiRequested] = useState(false);
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

  // Why each step is not done yet; null means done. Shown under the step and linked to the
  // disabled button with aria-describedby.
  const reasons: Record<Exclude<StepId, "listo">, string | null> = {
    material: !documentsReliable
      ? documentsQuery.isError
        ? "No se cargaron tus documentos."
        : "Verificando tus documentos…"
      : selectedIndexed.length > 0
        ? null
        : indexedIds.size === 0
          ? "Falta subir un documento."
          : "Marca al menos un documento.",
    meta: goalReady
      ? null
      : goalMode === "existing"
        ? "Falta elegir una meta."
        : "Falta tu meta.",
    ia:
      ai.status === "ready"
        ? null
        : ai.status === "pending"
          ? "Consultando el proveedor de IA…"
          : ai.status === "unknown"
            ? "Pulsa «Reintentar»."
            : "Falta conectar una IA.",
  };
  const missing = (Object.values(reasons) as (string | null)[]).filter((item): item is string => item !== null);

  // With the server's included AI there is nothing to connect: the AI step only appears
  // when the learner asks to use their own (or when no AI is available yet).
  const aiIncluded = ai.status === "ready" && ai.bundled;
  const steps = aiRequested || !aiIncluded ? STEPS : STEPS.filter((item) => item.id !== "ia");
  const last = steps.length - 1;

  // A step is reachable once every step before it is done. Derived, so a step that
  // regresses (e.g. the chosen document is deleted) pulls the learner back to it.
  const firstPending = steps.findIndex((item) => item.id !== "listo" && reasons[item.id] !== null);
  const reachable = firstPending === -1 ? last : firstPending;
  const active = Math.min(stepIndex, reachable);
  const step = steps[active];

  // Keyboard and screen-reader users land on the new step's heading, not on a vanished button.
  useEffect(() => {
    if (!movedByUser.current) return;
    stepRef.current?.querySelector<HTMLElement>("[data-step-heading]")?.focus();
  }, [active]);

  function goTo(index: number) {
    movedByUser.current = true;
    setStepIndex(index);
  }

  const flowActive = study.phase !== "idle" && study.phase !== "error" && study.phase !== "uncertain";
  // After a lost goal creation, re-creating it needs an explicit choice (see StudyStatus).
  const goalUncertain = study.uncertainStage === "goal" && goalMode === "new";
  const canStart = missing.length === 0 && !study.isBusy && !flowActive && !goalUncertain;

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
  const stepReason = step.id === "listo" ? null : reasons[step.id];
  const savedGoal = goalMode === "existing" ? goals.find((goal) => goal.id === existingGoalId) : undefined;
  const selectedNames = (documents ?? [])
    .filter((document) => selectedIndexed.includes(document.id))
    .map((document) => document.filename);

  return (
    <Card variant="glass" className="space-y-5">
      <div className="flex items-center gap-3">
        <IconTile icon={Sparkles} className="h-11 w-11" />
        <Heading className="font-display text-xl font-semibold text-text-primary">Prepara tu plan de estudio</Heading>
      </div>

      {!flowActive && (
        <>
          <ol
            aria-label="Pasos para preparar tu plan"
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
          >
            {steps.map((item, index) => {
              const done = item.id !== "listo" && !reasons[item.id];
              const current = index === active;
              const open = index <= reachable && !current;
              const state = current ? "actual" : done ? "hecho" : index > reachable ? "bloqueado" : "disponible";
              const body = (
                <>
                  <span
                    aria-hidden="true"
                    className={`block h-1 rounded-full ${
                      current ? "bg-action-hover" : done ? "bg-state-success" : "bg-line"
                    }`}
                  />
                  <span className="sr-only">
                    {item.label} ({state})
                  </span>
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 hidden items-center gap-1.5 text-sm sm:flex ${
                      current ? "font-semibold text-text-primary" : "text-text-muted"
                    }`}
                  >
                    <span
                      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        done
                          ? "bg-state-success-subtle text-state-success"
                          : current
                            ? "bg-flow text-text-on-action"
                            : "bg-surface-muted"
                      }`}
                    >
                      {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : index + 1}
                    </span>
                    <span className="min-w-0">{item.label}</span>
                  </span>
                </>
              );
              return (
                <li key={item.id} className="min-w-0" aria-current={current ? "step" : undefined}>
                  {open ? (
                    <button type="button" onClick={() => goTo(index)} className="flex min-h-11 w-full flex-col justify-center text-left sm:justify-start">
                      {body}
                    </button>
                  ) : (
                    <div className="flex min-h-11 flex-col justify-center sm:justify-start">{body}</div>
                  )}
                </li>
              );
            })}
          </ol>

          <div ref={stepRef} className="space-y-4">
            <p aria-hidden="true" className="text-xs font-medium uppercase tracking-wide text-text-muted sm:hidden">
              Paso {active + 1} de {steps.length}
            </p>
            <StepTitle
              as={StepHeading}
              number={active + 1}
              total={steps.length}
              icon={step.icon}
              title={step.title}
            />

            {step.id === "material" && (
              <div className="space-y-3">
                <DocumentUpload
                  headingLevel={headingLevel === 2 ? 4 : 5}
                  hideHeading
                  onUpload={(file) => upload.mutateAsync(file)}
                  documents={documents ?? []}
                  documentsError={documentsQuery.isError}
                />
                <DocumentPicker
                  documents={documents ?? []}
                  selectedDocumentIds={selectedDocs}
                  onSelectionChange={setSelectedDocs}
                  showEmptyState={false}
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
              </div>
            )}

            {step.id === "meta" && (
              <div className="space-y-3">
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
                        ? "No se pudieron cargar tus metas."
                        : "Aún no tienes metas guardadas."}
                  </p>
                ) : goalMode === "existing" ? (
                  <Select
                    id="study-existing-goal"
                    label="Meta guardada"
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
              </div>
            )}

            {step.id === "ia" && <AiStep startChanging={aiRequested && aiIncluded} />}

            {step.id === "listo" && (
              <dl className="divide-y divide-line rounded-surface border border-line text-sm">
                <RecapRow
                  label="Material"
                  value={selectedNames.length > 0 ? selectedNames.join(", ") : "—"}
                  onChange={() => goTo(0)}
                />
                <RecapRow
                  label="Meta"
                  value={
                    goalMode === "existing"
                      ? savedGoal
                        ? `${savedGoal.title} · ${GOAL_TYPE_LABELS[savedGoal.goal_type]}`
                        : "—"
                      : title.trim()
                        ? `${title.trim()} · ${GOAL_TYPE_LABELS[goalType]}`
                        : "—"
                  }
                  onChange={() => goTo(1)}
                />
                <RecapRow
                  label="IA"
                  value={ai.status === "ready" ? `${ai.title}. ${ai.detail}` : "—"}
                  onChange={() => {
                    setAiRequested(true);
                    goTo(STEPS.findIndex((item) => item.id === "ia"));
                  }}
                />
              </dl>
            )}
          </div>

          <div className="space-y-3 border-t border-line pt-4">
            {step.id !== "listo" && stepReason && (
              <p id="step-requirement" className="text-sm text-text-muted">
                {stepReason}
              </p>
            )}
            {step.id === "listo" && missing.length > 0 && (
              <div id="study-requirements" className="text-sm text-text-muted">
                <p className="font-medium text-text-primary">Para empezar te falta:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {missing.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {active > 0 ? (
                <Button type="button" variant="ghost" onClick={() => goTo(active - 1)}>
                  <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                  Atrás
                </Button>
              ) : (
                <span />
              )}
              {step.id === "listo" ? (
                <Button
                  type="button"
                  onClick={handleStart}
                  disabled={!canStart}
                  aria-describedby={!canStart && missing.length > 0 ? "study-requirements" : undefined}
                  className="px-6"
                >
                  {study.isBusy ? "Preparando…" : "Estudiar"}
                  {!study.isBusy && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => goTo(active + 1)}
                  disabled={stepReason !== null}
                  aria-describedby={stepReason ? "step-requirement" : undefined}
                  className="px-6"
                >
                  Continuar
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

        </>
      )}

      <StudyStatus
        study={study}
        onRetry={() => lastInput.current && void study.start(lastInput.current)}
        onChooseSavedGoal={() => {
          setGoalMode("existing");
          goTo(1);
          void goalsQuery.refetch();
        }}
      />
    </Card>
  );
}

function RecapRow({ label, value, onChange }: { label: string; value: string; onChange: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
      <div className="min-w-0">
        <dt className="text-xs uppercase tracking-wide text-text-muted">{label}</dt>
        <dd className="break-words text-text-primary">{value}</dd>
      </div>
      <Button type="button" variant="ghost" className="!min-h-10 !px-3" onClick={onChange}>
        Cambiar<span className="sr-only"> {label.toLowerCase()}</span>
      </Button>
    </div>
  );
}

function StepTitle({
  as: Tag,
  number,
  total,
  icon: Icon,
  title,
}: {
  as: "h3" | "h4";
  number: number;
  total: number;
  icon: typeof FileUp;
  title: string;
}) {
  return (
    <Tag
      tabIndex={-1}
      data-step-heading=""
      aria-label={`Paso ${number} de ${total}: ${title}`}
      className="flex items-center gap-2 font-display text-base font-semibold text-text-primary focus:outline-none"
    >
      <Icon aria-hidden="true" className="h-4 w-4 text-action-hover" />
      <span>{title}</span>
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
            Puedes salir de esta página: el plan seguirá generándose.
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
