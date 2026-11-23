import { useState } from "react";
import { Coins } from "lucide-react";

import type { CreditReason } from "../../api/types";
import { useCreditHistory, useCredits } from "../../hooks/useCredits";
import { parseApiDate } from "../../lib/studyProgress";
import { Dialog } from "../Dialog";
import { Button } from "../ui";
import { CreditNotice } from "./CreditNotice";

const REASON_LABELS: Record<CreditReason, string> = {
  signup_bonus: "Créditos de bienvenida",
  purchase: "Compra de créditos",
  pass_grant: "Créditos del pase",
  plan: "Plan de estudio",
  reinforcement: "Refuerzo con IA",
  refund: "Devolución",
  admin_adjustment: "Ajuste",
  expiration: "Créditos vencidos",
};

function CreditHistory() {
  const history = useCreditHistory(true);
  if (history.isPending) return <p className="text-sm text-text-muted">Cargando movimientos…</p>;
  if (history.isError) return <p className="text-sm text-state-error">No se pudo cargar el historial.</p>;
  if (history.data.length === 0) return <p className="text-sm text-text-muted">Aún no tienes movimientos.</p>;
  return (
    <ul className="divide-y divide-line">
      {history.data.map((entry) => (
        <li key={entry.id} className="flex items-center justify-between gap-3 py-2 text-sm">
          <span className="min-w-0">
            <span className="block text-text-primary">{REASON_LABELS[entry.reason] ?? entry.reason}</span>
            <span className="block text-xs text-text-muted">
              {parseApiDate(entry.created_at)?.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </span>
          <span className="shrink-0 font-semibold text-text-primary">{entry.delta > 0 ? `+${entry.delta}` : entry.delta}</span>
        </li>
      ))}
    </ul>
  );
}

/** Balance in the shell header (saas only; the shell decides whether to render it). */
export function CreditChip() {
  const credits = useCredits();
  const [open, setOpen] = useState(false);
  const balance = credits.data;
  if (!balance) return null;

  const empty = balance.total === 0;
  const label = empty ? "Sin créditos" : `${balance.total} ${balance.total === 1 ? "crédito" : "créditos"}`;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold ${
          empty
            ? "border-state-warning bg-state-warning-subtle text-state-warning"
            : "border-control bg-surface-paper/70 text-text-primary hover:border-action-hover"
        }`}
      >
        <Coins aria-hidden="true" className="h-4 w-4" />
        {label}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Tus créditos"
        description={
          <div className="space-y-3">
            <CreditNotice balance={balance} />
            <h3 className="pt-1 text-sm font-semibold text-text-primary">Movimientos</h3>
            <CreditHistory />
          </div>
        }
      >
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cerrar
        </Button>
      </Dialog>
    </>
  );
}
