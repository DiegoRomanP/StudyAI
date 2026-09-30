import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { PlanDTO } from "../api/types";
import { Badge, Button, Card, Spinner } from "../components/ui";
import {
  useDeletePlan,
  useDocuments,
  useGeneratePlan,
  useGoals,
  usePlans,
} from "../hooks/queries";
import { useShowMore } from "../hooks/useShowMore";

const STATUS = {
  PROCESSING: { label: "Generando", color: "amber" },
  READY: { label: "Listo", color: "green" },
  FAILED: { label: "Error", color: "red" },
} as const;

export function PlanPage() {
  const { data: goals } = useGoals();
  const { data: documents } = useDocuments();
  const { data: plans, isLoading } = usePlans();
  const generate = useGeneratePlan();
  const navigate = useNavigate();
  const { visible, hiddenCount, expanded, showMore, showLess } = useShowMore(plans);

  const [goalId, setGoalId] = useState<number | "">("");
  const [selectedDocs, setSelectedDocs] = useState<number[]>([]);

  const indexedDocs = (documents ?? []).filter((d) => d.status === "INDEXED");

  function toggleDoc(id: number) {
    setSelectedDocs((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleGenerate() {
    if (goalId === "") return;
    const res = await generate.mutateAsync({
      goalId: Number(goalId),
      documentIds: selectedDocs,
    });
    navigate(`/plan/${res.id}`);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Plan de estudio</h1>
        <p className="text-slate-500">
          Genera un plan a partir de una meta y tus documentos indexados.
        </p>
      </header>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">Nuevo plan</h2>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Meta</label>
          <select
            value={goalId}
            onChange={(e) => setGoalId(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Selecciona una meta…</option>
            {(goals ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
          {(goals ?? []).length === 0 && (
            <p className="mt-1 text-xs text-amber-600">
              Primero crea una meta en la sección <Link className="underline" to="/goals">Metas</Link>.
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Documentos ({selectedDocs.length} seleccionados)
          </label>
          {indexedDocs.length === 0 ? (
            <p className="text-xs text-amber-600">
              No hay documentos indexados. Sube apuntes en{" "}
              <Link className="underline" to="/documents">Documentos</Link>.
            </p>
          ) : (
            <div className="grid min-w-0 grid-cols-1 gap-2">
              {indexedDocs.map((d) => (
                <label
                  key={d.id}
                  className="flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedDocs.includes(d.id)}
                    onChange={() => toggleDoc(d.id)}
                  />
                  <span className="min-w-0 truncate">{d.filename}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <Button
          onClick={handleGenerate}
          disabled={goalId === "" || generate.isPending}
        >
          {generate.isPending ? "Iniciando…" : "Generar plan"}
        </Button>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Tus planes</h2>
        {isLoading ? (
          <Spinner />
        ) : plans && plans.length > 0 ? (
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
            {expanded && plans.length > 6 && (
              <Button variant="ghost" onClick={showLess}>
                Mostrar menos
              </Button>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-400">Aún no has generado planes.</p>
        )}
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
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Error al eliminar el plan.");
    }
  }

  return (
    <Card className="space-y-1">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link to={`/plan/${plan.id}`} className="min-w-0 flex-1">
          <p className="truncate font-medium text-slate-800 hover:text-brand-600">{plan.title}</p>
          <p className="text-xs text-slate-400">{plan.sessions.length} sesiones</p>
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
      {error && <p className="text-xs text-red-600">{error}</p>}
    </Card>
  );
}
