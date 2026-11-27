import { useState, type FormEvent } from "react";

import { getApiErrorMessage } from "../../api/errors";
import type { ComplaintCreate } from "../../api/types";
import { Alert, Button, Card, Input, Select, Textarea } from "../../components/ui";
import { useSubmitComplaint } from "../../hooks/useBilling";
import { parseApiDate } from "../../lib/studyProgress";
import { LegalDocument } from "./LegalDocument";

type Fields = Omit<ComplaintCreate, "amount_cents"> & { amount: string };

const EMPTY: Fields = { name: "", document_id: "", address: "", phone: "", email: "", kind: "reclamo", amount: "", detail: "", request: "" };

/** "12,50" or "12.50" → 1250; "" → null; anything else → undefined (invalid). */
function parseAmount(value: string): number | null | undefined {
  const text = value.trim().replace(",", ".");
  if (!text) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return undefined;
  return Math.round(Number(text) * 100);
}

/** `/reclamaciones`: Libro de Reclamaciones virtual (Indecopi). Public. */
export function ComplaintsPage() {
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [amountError, setAmountError] = useState<string | null>(null);
  const submit = useSubmitComplaint();
  const set = (key: keyof Fields) => (event: { target: { value: string } }) => setFields((f) => ({ ...f, [key]: event.target.value }));

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const amount = parseAmount(fields.amount);
    if (amount === undefined) {
      setAmountError("Escribe el monto en soles, por ejemplo 19.90.");
      return;
    }
    setAmountError(null);
    const f = fields;
    submit.mutate({
      name: f.name.trim(),
      document_id: f.document_id.trim(),
      address: f.address.trim(),
      phone: f.phone.trim(),
      email: f.email.trim(),
      kind: f.kind,
      amount_cents: amount,
      detail: f.detail.trim(),
      request: f.request.trim(),
    });
  }

  if (submit.data) {
    const date = parseApiDate(submit.data.created_at)?.toLocaleString("es-PE", { dateStyle: "long", timeStyle: "short" });
    return (
      <LegalDocument title="Libro de Reclamaciones">
        <Alert tone="success" title="Registramos tu hoja de reclamación">
          <p>
            Código: <strong>{submit.data.code}</strong>
          </p>
          <p>Fecha: {date}</p>
          <p>Guarda este código. Te responderemos al correo que indicaste en un plazo máximo de 15 días hábiles.</p>
        </Alert>
      </LegalDocument>
    );
  }

  return (
    <LegalDocument title="Libro de Reclamaciones">
      <p>
        Conforme al Código de Protección y Defensa del Consumidor, puedes registrar aquí un <strong>reclamo</strong> (disconformidad
        con el servicio o un pago) o una <strong>queja</strong> (malestar con la atención, sin relación directa con el servicio).
        Responderemos en un plazo máximo de 15 días hábiles. Proveedor: <strong>[titular y RUC pendientes]</strong>.
      </p>
      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="complaint-name" label="Nombre completo" autoComplete="name" required maxLength={200} value={fields.name} onChange={set("name")} />
            <Input id="complaint-document" label="DNI, CE o pasaporte" required maxLength={20} value={fields.document_id} onChange={set("document_id")} />
            <Input id="complaint-email" label="Correo electrónico" type="email" autoComplete="email" required value={fields.email} onChange={set("email")} />
            <Input id="complaint-phone" label="Teléfono" type="tel" autoComplete="tel" required maxLength={30} value={fields.phone} onChange={set("phone")} />
          </div>
          <Input id="complaint-address" label="Domicilio" autoComplete="street-address" required maxLength={300} value={fields.address} onChange={set("address")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select id="complaint-kind" label="Tipo" value={fields.kind} onChange={set("kind")}>
              <option value="reclamo">Reclamo</option>
              <option value="queja">Queja</option>
            </Select>
            <Input
              id="complaint-amount"
              label="Monto reclamado (S/, opcional)"
              inputMode="decimal"
              error={amountError}
              value={fields.amount}
              onChange={set("amount")}
            />
          </div>
          <Textarea id="complaint-detail" label="Detalle" hint="Qué pasó, cuándo y con qué compra, si aplica." required rows={4} maxLength={3000} value={fields.detail} onChange={set("detail")} />
          <Textarea id="complaint-request" label="Pedido" hint="Qué solución esperas." required rows={3} maxLength={2000} value={fields.request} onChange={set("request")} />
          {submit.isError && <Alert tone="error">{getApiErrorMessage(submit.error, "No se pudo registrar tu reclamo. Inténtalo de nuevo.")}</Alert>}
          <Button type="submit" disabled={submit.isPending}>
            {submit.isPending ? "Enviando…" : "Enviar hoja de reclamación"}
          </Button>
        </form>
      </Card>
    </LegalDocument>
  );
}
