import { UserRound } from "lucide-react";

import type { OrderDTO, OrderStatus } from "../api/types";
import { AsyncState } from "../components/AsyncState";
import { CreditHistory } from "../components/credits/CreditChip";
import { CreditNotice, PRICING_PATH } from "../components/credits/CreditNotice";
import { Badge, Button, ButtonLink, Card, PageHeader, Skeleton } from "../components/ui";
import { formatPrice, useOrders, useProducts } from "../hooks/useBilling";
import { useCredits } from "../hooks/useCredits";
import { useShowMore } from "../hooks/useShowMore";
import { parseApiDate } from "../lib/studyProgress";

const STATUS: Record<OrderStatus, { label: string; color: "slate" | "green" | "red" | "amber" }> = {
  pending: { label: "Pendiente", color: "amber" },
  paid: { label: "Pagado", color: "green" },
  failed: { label: "No completado", color: "red" },
  refunded: { label: "Reembolsado", color: "slate" },
};

function OrderList({ orders }: { orders: OrderDTO[] }) {
  const products = useProducts();
  const { visible, hiddenCount, showMore } = useShowMore(orders);
  const nameOf = (code: string) => products.data?.find((p) => p.code === code)?.name ?? code;
  return (
    <>
      <ul className="divide-y divide-line">
        {visible.map((order) => (
          <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <span className="min-w-0">
              <span className="block text-text-primary">{nameOf(order.product_code)}</span>
              <span className="block text-xs text-text-muted">
                {parseApiDate(order.created_at)?.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            </span>
            <span className="flex items-center gap-3">
              <Badge color={STATUS[order.status].color}>{STATUS[order.status].label}</Badge>
              <span className="font-semibold text-text-primary">{formatPrice(order.amount_cents)}</span>
            </span>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <Button type="button" variant="secondary" onClick={showMore}>
          Mostrar {hiddenCount} más
        </Button>
      )}
    </>
  );
}

/** `/cuenta` (saas): balance, credit movements and purchases. */
export function AccountPage() {
  const credits = useCredits();
  const orders = useOrders();

  return (
    <section className="max-w-3xl space-y-6">
      <PageHeader icon={UserRound} title="Cuenta" actions={<ButtonLink to={PRICING_PATH}>Comprar créditos</ButtonLink>} />
      <Card className="space-y-3">
        <h2 className="font-display text-lg font-bold text-text-primary">Tu saldo</h2>
        {credits.data ? (
          <>
            <p className="font-display text-3xl font-bold text-text-primary">
              {credits.data.total} {credits.data.total === 1 ? "crédito" : "créditos"}
            </p>
            <CreditNotice balance={credits.data} />
          </>
        ) : credits.isError ? (
          <p className="text-sm text-state-error">No se pudo cargar tu saldo.</p>
        ) : (
          <Skeleton height={40} width="50%" />
        )}
      </Card>
      <Card className="space-y-3">
        <h2 className="font-display text-lg font-bold text-text-primary">Compras</h2>
        <AsyncState
          data={orders.data}
          isLoading={orders.isPending}
          isError={orders.isError}
          isFetching={orders.isFetching}
          onRetry={() => void orders.refetch()}
          loadingLabel="Cargando compras"
          loading={<Skeleton height={96} />}
          isEmpty={(list) => list.length === 0}
          empty={<p className="text-sm text-text-muted">Aún no has comprado créditos.</p>}
          initialErrorMessage="No se pudieron cargar tus compras."
        >
          {(list) => <OrderList orders={list} />}
        </AsyncState>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-display text-lg font-bold text-text-primary">Movimientos de créditos</h2>
        <CreditHistory />
      </Card>
    </section>
  );
}
