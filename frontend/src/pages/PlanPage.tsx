import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { getApiErrorMessage } from "../api/errors";
import type { PlanDTO } from "../api/types";
import { AsyncState } from "../components/AsyncState";
import { Alert, Badge, Button, Card, Select, Skeleton } from "../components/ui";
import { DocumentPicker } from "../components/documents/DocumentPicker";
import {
  getDocumentsListSnapshot,
  useDeletePlan,
  useDocuments,
  useGeneratePlan,
  useGoals,
  usePlans,
} from "../hooks/queries";
import { useShowMore } from "../hooks/useShowMore";
import { planRequestFingerprint, useIdempotencyKey } from "../lib/idempotency";

const STATUS = {
  PROCESSING: { label: "Generando", color: "amber" },
  READY: { label: "Listo", color: "green" },
  FAILED: { label: "Error", color: "red" },
} as const;

export function PlanPage() {
  const goalsQuery = useGoals();
  const goals = goalsQuery.data;
  const documentsQuery = useDocuments();
  const { data: documents } = documentsQuery;
  const plansQuery = usePlans();
  const plans = plansQuery.data;
  const generate = useGeneratePlan();
  const requestKey = useIdempotencyKey();
  const generating = useRef(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { visible, hiddenCount, expanded, showMore, showLess } = useShowMore(plans);

  const [goalId, setGoalId] = useState<number | "">("");
  const [selectedDocs, setSelectedDocs] = useState<number[]>([]);
  const indexedDocumentIds = new Set(
    (documents ?? [])
      .filter((document) => document.status === "INDEXED")
      .map((document) => document.id),
  );
  const selectedIndexedDocumentIds = selectedDocs.filter((id) => indexedDocumentIds.has(id));
  const documentsAreReliable =
    documents !== undefined &&
    documentsQuery.status === "success" &&
    getDocumentsListSnapshot(queryClient).isConfirmedByGet;
  const canGeneratePlan =
    goalId !== "" &&
    !generate.isPending &&
    documentsAreReliable &&
    selectedIndexedDocumentIds.length > 0;

  async function handleGenerate() {
    if (goalId === "") return;

    const latestDocumentList = getDocumentsListSnapshot(queryClient);
    const latestDocuments = latestDocumentList.documents;
    const latestListIsReliable = latestDocumentList.isConfirmedByGet;
    const currentIndexedDocumentIds = new Set(
      (latestDocuments ?? [])
        .filter((document) => document.status === "INDEXED")
        .map((document) => document.id),
    );
    const documentIds = selectedDocs.filter((id) => currentIndexedDocumentIds.has(id));
    if (documentIds.length !== selectedDocs.length) {
      setSelectedDocs(documentIds);
    }
    if (!latestListIsReliable || documentIds.length === 0) return;
    if (generating.current) return;

    generating.current = true;
    setGenerateError(null);
    try {
      const res = await generate.mutateAsync({
        goalId: Number(goalId),
        documentIds,
        // A retry of the same goal + documents replays the original request server-side.
        idempotencyKey: requestKey.keyFor(planRequestFingerprint(Number(goalId), documentIds)),
      });
      requestKey.reset();
      navigate(`/plan/${res.id}`);
    } catch (error: unknown) {
      setGenerateError(getApiErrorMessage(error, "No se pudo iniciar la generación del plan."));
    } finally {
      generating.current = false;
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Plan de estudio</h1>
        <p className="text-text-muted">
          Genera un plan a partir de una meta y tus documentos indexados.
        </p>
      </header>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">Nuevo plan</h2>

        <div className="space-y-2">
          <Select
            id="plan-goal"
            label="Meta"
            value={goalId}
            onChange={(e) => {
              setGoalId(e.target.value === "" ? "" : Number(e.target.value));
              setGenerateError(null);
            }}
            disabled={goalsQuery.isError && !goals}
          >
            <option value="">Selecciona una meta…</option>
            {(goals ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </Select>
          {goalsQuery.isError ? (
            <Alert tone="error">
              <p>No se pudieron cargar tus metas.</p>
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void goalsQuery.refetch()}
                  disabled={goalsQuery.isFetching}
                >
                  Reintentar carga de metas
                </Button>
              </div>
            </Alert>
          ) : goalsQuery.isSuccess && (goals ?? []).length === 0 ? (
            <p className="text-sm text-state-warning">
              Primero crea una meta en la sección <Link className="underline" to="/goals">Metas</Link>.
            </p>
          ) : null}
        </div>

        <DocumentPicker
          documents={documents ?? []}
          selectedDocumentIds={selectedDocs}
          onSelectionChange={(ids) => {
            setSelectedDocs(ids);
            setGenerateError(null);
          }}
          showEmptyState={documentsAreReliable && indexedDocumentIds.size === 0}
          emptyState={
            <p>
              No hay documentos indexados. Sube apuntes en{" "}
              <Link className="underline" to="/documents">Recursos</Link>.
            </p>
          }
        />

        <div className="space-y-2">
          <Button onClick={handleGenerate} disabled={!canGeneratePlan}>
            {generate.isPending ? "Iniciando…" : "Generar plan"}
          </Button>
          {generateError && (
            <Alert tone="error">
              <p>{generateError}</p>
              <p>Puedes volver a intentarlo: no se creará un plan duplicado.</p>
            </Alert>
          )}
          {!documentsAreReliable ? (
            <div className="space-y-2">
              <p
                role={documentsQuery.isError ? "alert" : "status"}
                className="text-sm text-state-warning"
              >
                {documentsQuery.isError
                  ? "No se puede verificar la lista de documentos. Reintenta antes de generar el plan."
                  : "Cargando y verificando la lista de documentos…"}
              </p>
              {documentsQuery.isError && (
                <Button
                  variant="secondary"
                  onClick={() => void documentsQuery.refetch()}
                  disabled={documentsQuery.isFetching}
                >
                  {documentsQuery.isFetching ? "Reintentando…" : "Reintentar carga de documentos"}
                </Button>
              )}
            </div>
          ) : selectedIndexedDocumentIds.length === 0 ? (
            <p role="status" className="text-sm text-state-warning">
              {(documents ?? []).some((document) => document.status === "INDEXED")
                ? "Selecciona al menos un documento indexado para generar el plan."
                : "Necesitas al menos un documento indexado para generar el plan."}
            </p>
          ) : null}
        </div>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Tus planes</h2>
        <AsyncState
          data={plans}
          isLoading={plansQuery.isPending}
          isError={plansQuery.isError}
          isFetching={plansQuery.isFetching}
          isEmpty={(items) => items.length === 0}
          loading={<Skeleton height={72} />}
          loadingLabel="Cargando planes"
          empty={<p className="text-sm text-text-muted">Aún no has generado planes.</p>}
          onRetry={() => void plansQuery.refetch()}
          initialErrorMessage="No se pudieron cargar tus planes."
          updateErrorMessage="No se pudieron actualizar tus planes. Se muestran los últimos cargados."
        >
          {(items) => (
            <>
              <div className="grid gap-3">
                {visible.map((p) => (
                  <PlanRow key={p.id} plan={p} />
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

function PlanRow({ plan }: { plan: PlanDTO }) {
  const deletePlan = useDeletePlan();
  const [error, setError] = useState<string | null>(null);
  const meta = STATUS[plan.status];

  async function handleDelete() {
    if (
      !window.confirm(`¿Eliminar el plan "${plan.title}"? Esta acción no se puede deshacer.`)
    ) {
      return;
    }
    setError(null);
    try {
      await deletePlan.mutateAsync(plan.id);
    } catch (caught: unknown) {
      setError(getApiErrorMessage(caught, "Error al eliminar el plan."));
    }
  }

  return (
    <Card className="space-y-1">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link to={`/plan/${plan.id}`} className="min-w-0 flex-1">
          <p className="truncate font-medium text-text-primary hover:text-action">{plan.title}</p>
          <p className="text-xs text-text-muted">
            {plan.status === "READY"
              ? `${plan.sessions.filter((session) => session.status === "COMPLETED").length} de ${plan.sessions.length} sesiones completadas`
              : `${plan.sessions.length} sesiones`}
          </p>
        </Link>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <Badge color={meta.color}>{meta.label}</Badge>
          <Button
            variant="danger"
            className="px-2.5 py-1 text-xs"
            onClick={handleDelete}
            disabled={deletePlan.isPending}
          >
            {deletePlan.isPending ? "Eliminando..." : "Eliminar"}
          </Button>
        </div>
      </div>
      {error && <p role="alert" className="text-xs text-state-error">{error}</p>}
    </Card>
  );
}
