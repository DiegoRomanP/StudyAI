import { useEffect, useState } from "react";
import { CircleCheck, CircleX, Clock, Receipt } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { getApiErrorMessage } from "../api/errors";
import { PRICING_PATH } from "../components/credits/CreditNotice";
import { ActivityIndicator, Alert, Button, ButtonLink, Card, PageHeader } from "../components/ui";
import { ORDER_POLL_MAX_MS, formatPrice, useFakeCompleteOrder, useOrder } from "../hooks/useBilling";

/** Development build only (`npm run dev`): the backend also refuses it unless the fake gateway is on. */
function showFakePayment() {
  return import.meta.env.DEV;
}

/** `/pago/resultado?order=`: the gateway sends the learner back here; the webhook decides the status. */
export function PaymentResultPage() {
  const [params] = useSearchParams();
  const raw = Number(params.get("order"));
  const orderId = Number.isInteger(raw) && raw > 0 ? raw : null;
  const [timedOut, setTimedOut] = useState(false);
  const order = useOrder(orderId, !timedOut);
  const fake = useFakeCompleteOrder();

  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), ORDER_POLL_MAX_MS);
    return () => window.clearTimeout(timer);
  }, []);

  let body;
  if (orderId === null) {
    body = <Alert tone="error">No encontramos el número de tu compra en la dirección.</Alert>;
  } else if (order.isPending) {
    body = <ActivityIndicator label="Consultando tu pago…" />;
  } else if (order.isError) {
    body = (
      <Alert tone="error">
        <p>{getApiErrorMessage(order.error, "No se pudo consultar tu compra.")}</p>
        <Button type="button" variant="secondary" onClick={() => void order.refetch()}>
          Reintentar
        </Button>
      </Alert>
    );
  } else {
    const { status, amount_cents } = order.data;
    body = (
      <div className="space-y-4">
        {status === "paid" && (
          <Alert tone="success" title="¡Pago aprobado!">
            <p className="flex items-center gap-2">
              <CircleCheck aria-hidden="true" className="h-4 w-4" />
              Ya sumamos tus créditos ({formatPrice(amount_cents)}).
            </p>
          </Alert>
        )}
        {(status === "failed" || status === "refunded") && (
          <Alert tone="error" title={status === "failed" ? "El pago no se completó" : "Compra reembolsada"}>
            <p className="flex items-center gap-2">
              <CircleX aria-hidden="true" className="h-4 w-4" />
              {status === "failed" ? "No se te cobró nada. Puedes intentarlo otra vez." : "Devolvimos el importe de esta compra."}
            </p>
          </Alert>
        )}
        {status === "pending" && (
          <Alert tone="info" title={timedOut ? "Seguimos esperando la confirmación…" : "Confirmando tu pago…"}>
            <p className="flex items-center gap-2">
              <Clock aria-hidden="true" className="h-4 w-4" />
              {timedOut
                ? "Mercado Pago aún no nos avisa. Si pagaste, tus créditos llegarán solos; puedes volver más tarde."
                : "Esto suele tardar unos segundos. No cierres esta página."}
            </p>
            {timedOut && (
              <Button type="button" variant="secondary" onClick={() => void order.refetch()}>
                Consultar de nuevo
              </Button>
            )}
          </Alert>
        )}
        {status === "pending" && showFakePayment() && (
          <Card className="space-y-2">
            <p className="text-sm text-text-muted">Desarrollo: pasarela simulada.</p>
            <Button type="button" variant="secondary" disabled={fake.isPending} onClick={() => fake.mutate(order.data.id)}>
              Simular pago aprobado
            </Button>
            {fake.isError && <Alert tone="error">{getApiErrorMessage(fake.error, "No se pudo simular el pago.")}</Alert>}
          </Card>
        )}
        <div className="flex flex-wrap gap-2">
          <ButtonLink to="/cuenta">Ver mi cuenta</ButtonLink>
          {status !== "paid" && (
            <ButtonLink to={PRICING_PATH} variant="secondary">
              Volver a precios
            </ButtonLink>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="max-w-2xl space-y-6">
      <PageHeader icon={Receipt} title="Resultado del pago" />
      {body}
    </section>
  );
}
