import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Badge, Button, Card, Spinner } from "../components/ui";
import {
  useDocuments,
  useGeneratePlan,
  useGoals,
  usePlans,
} from "../hooks/queries";

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
            <div className="grid gap-2">
              {indexedDocs.map((d) => (
                <label
                  key={d.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedDocs.includes(d.id)}
                    onChange={() => toggleDoc(d.id)}
                  />
                  <span className="truncate">{d.filename}</span>
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
          <div className="grid gap-3">
            {plans.map((p) => {
              const meta = STATUS[p.status];
              return (
                <Link key={p.id} to={`/plan/${p.id}`}>
                  <Card className="flex items-center justify-between hover:border-brand-300">
                    <div>
                      <p className="font-medium text-slate-800">{p.title}</p>
                      <p className="text-xs text-slate-400">
                        {p.sessions.length} sesiones
                      </p>
                    </div>
                    <Badge color={meta.color}>{meta.label}</Badge>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-400">Aún no has generado planes.</p>
        )}
      </section>
    </div>
  );
}
