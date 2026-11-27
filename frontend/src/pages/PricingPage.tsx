import { useState } from "react";
import { Check } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { getApiErrorMessage } from "../api/errors";
import type { ProductDTO } from "../api/types";
import { AsyncState } from "../components/AsyncState";
import { FREE_CREDITS } from "../components/credits/CreditNotice";
import { PublicLayout } from "../components/PublicLayout";
import { Alert, Badge, Button, Card, Skeleton } from "../components/ui";
import { useAppConfig } from "../hooks/useAppConfig";
import { useAuth } from "../hooks/useAuth";
import { formatPrice, useCheckout, useProducts } from "../hooks/useBilling";
import { createIdempotencyKey } from "../lib/idempotency";
import { supabase } from "../lib/supabase";

function perks(product: ProductDTO) {
  if (product.kind === "pass") {
    return [
      `${product.credits} créditos durante ${product.pass_days ?? 30} días`,
      "Metas ilimitadas y más documentos",
      "Los créditos del pase no se acumulan",
    ];
  }
  return [`${product.credits} créditos`, "No vencen nunca", "1 crédito = 1 plan nuevo o 1 repaso con IA"];
}

function ProductCard({ product, busy, onBuy }: { product: ProductDTO; busy: boolean; onBuy: () => void }) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-xl font-bold text-text-primary">{product.name}</h2>
          {product.kind === "pass" && <Badge color="brand">Pase mensual</Badge>}
        </div>
        <p className="font-display text-3xl font-bold text-text-primary">{formatPrice(product.price_cents)}</p>
        <p className="text-xs text-text-muted">IGV incluido · pago único</p>
      </div>
      <ul className="flex-1 space-y-2 text-sm text-text-muted">
        {perks(product).map((perk) => (
          <li key={perk} className="flex items-start gap-2">
            <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-action" />
            {perk}
          </li>
        ))}
      </ul>
      <Button type="button" variant="secondary" disabled={busy} onClick={onBuy}>
        {busy ? "Abriendo el pago…" : "Comprar"}
      </Button>
    </Card>
  );
}

/** `/precios`: public. Buying needs a session; the payment happens on the gateway's page. */
export function PricingPage() {
  const products = useProducts();
  const checkout = useCheckout();
  const { hasLogin } = useAppConfig();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [buying, setBuying] = useState<string | null>(null);

  function buy(code: string) {
    if (supabase && hasLogin && !session) {
      navigate("/login?next=/precios");
      return;
    }
    setBuying(code);
    checkout.mutate(
      // A fresh key per click: a double click while busy is blocked by the disabled button.
      { productCode: code, idempotencyKey: createIdempotencyKey() },
      {
        onSuccess: ({ checkout_url }) => window.location.assign(checkout_url),
        onError: () => setBuying(null),
      },
    );
  }

  return (
    <PublicLayout title="Precios">
      <div className="space-y-8 pt-4">
        <div className="max-w-2xl space-y-3">
          <h1 className="font-display text-3xl font-bold text-text-primary sm:text-4xl">Paga solo por lo que usas</h1>
          <p className="text-text-muted">
            Cada plan nuevo o repaso con IA usa 1 crédito; subir material, crear metas y rendir tests no gasta nada. Tu cuenta
            empieza con {FREE_CREDITS} créditos gratis y, si una generación falla, te devolvemos el crédito.
          </p>
        </div>
        {checkout.isError && <Alert tone="error">{getApiErrorMessage(checkout.error, "No se pudo iniciar el pago. Inténtalo de nuevo.")}</Alert>}
        <AsyncState
          data={products.data}
          isLoading={products.isPending}
          isError={products.isError}
          isFetching={products.isFetching}
          onRetry={() => void products.refetch()}
          loadingLabel="Cargando precios"
          loading={
            <div className="grid gap-4 md:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={256} />
              ))}
            </div>
          }
          isEmpty={(list) => list.length === 0}
          empty={<p className="text-text-muted">Todavía no hay paquetes a la venta.</p>}
          initialErrorMessage="No se pudieron cargar los precios."
        >
          {(list) => (
            <div className="grid gap-4 md:grid-cols-3">
              {list.map((product) => (
                <ProductCard key={product.code} product={product} busy={buying !== null} onBuy={() => buy(product.code)} />
              ))}
            </div>
          )}
        </AsyncState>
        <p className="text-sm text-text-muted">
          Pagas con Yape o tarjeta a través de Mercado Pago. Puedes pedir la devolución de los créditos no usados dentro de los 7
          días de la compra.
        </p>
      </div>
    </PublicLayout>
  );
}
