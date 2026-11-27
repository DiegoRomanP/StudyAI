# Precios, pago, cuenta y páginas legales

> **Leer antes de** tocar `PricingPage`, `PaymentResultPage`, `AccountPage`, `hooks/useBilling.ts`,
> `pages/legal/` o `components/PublicLayout.tsx`. Contrato: `docs/api_contract.yaml` (`/billing/*`,
> `/complaints`).

## Compras (solo `saas`)

En `self_hosted` las tres rutas pasan por `SaasOnly` (`App.tsx`) y pintan `NotFoundPage`; mientras
`/config` carga se ve un esqueleto (no un 404 fugaz). El backend también las rechaza.

- **`/precios`** (pública, `PublicLayout`): lista `GET /billing/products`; el precio se formatea con
  `formatPrice` (`Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" })` → `S/ 4.90`).
  «Comprar» sin sesión (Supabase activo) → `/login?next=/precios`. Con sesión → `POST /billing/checkout`
  con una clave nueva de `createIdempotencyKey()` por clic (el doble clic lo evita el botón deshabilitado
  mientras se abre el pago) y luego `window.location.assign(checkout_url)`, solo si la URL es `https:` o del propio origen (`isSafeCheckoutUrl`; si no, error y no navega).
- **`/pago/resultado?order=`** (dentro de `AppShell`, activa «Cuenta»): `useOrder` consulta
  `GET /billing/orders/{id}` cada 3 s mientras esté `pending`; a los 5 min deja de consultar y muestra
  «Seguimos esperando la confirmación…» con «Consultar de nuevo». En `paid` invalida
  `["account-credits"]` y la lista de compras. Estados: aprobado, no completado (`failed`), reembolsado.
- **Simular pago aprobado**: solo cuando `import.meta.env.DEV` (es decir, `npm run dev`) y el pedido está
  `pending`; llama a `POST /billing/fake/complete/{id}`, que el backend solo acepta con la pasarela fake.
  En un build de producción el botón no existe.
- **`/cuenta`**: saldo (`useCredits` + `CreditNotice`), compras (`useOrders`, con `useShowMore`) y
  movimientos de créditos (`CreditHistory`, el mismo componente del diálogo de `CreditChip`, también con
  `useShowMore`). Enlace «Cuenta» en la navegación solo en saas (`NAVIGATION[].mode`).
- Los avisos de «sin créditos» (`CreditNotice`, `NoCreditsReason`, `OutOfCreditsDialog`) enlazan a
  `PRICING_PATH` (`/precios`).

## Páginas legales (todas las modalidades)

`/terminos`, `/privacidad` y `/reclamaciones` son públicas y usan `pages/legal/LegalDocument.tsx`, que pone
arriba el aviso **«Borrador pendiente de revisión legal»** hasta que un abogado apruebe los textos. Los
datos del titular (nombre, RUC, correo) están como `[… pendiente]`.

- Privacidad (Ley 29733): encargados Supabase, Cloudflare, AWS, Resend, Mercado Pago y Anthropic
  (procesamiento en EE. UU.), transferencia internacional, conservación y derechos ARCO.
- **Libro de Reclamaciones**: formulario con los campos de `POST /complaints` (`ComplaintCreate`). El monto
  es opcional, se escribe en soles (`19,90` o `19.90`) y se envía en céntimos; los textos se recortan. Al
  enviar se muestra el código devuelto (`R-AAAA-NNNNNN`) y la fecha.
- Enlaces: `LegalLinks` en el pie de la landing, de `PublicLayout` y de `AppShell` (prop `footer`, solo
  saas). «Precios» solo aparece en saas. El registro enlaza a términos y privacidad.

## Tests

`src/__tests__/billing.test.tsx` (precio, redirección sin sesión, checkout con sesión, polling que se
detiene en `paid`, espera de 5 min, botón de simular solo en desarrollo) y `src/__tests__/legal.test.tsx`
(páginas sin sesión con el aviso, formulario de reclamaciones, enlaces del pie, 404 en self_hosted).
