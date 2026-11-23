# Créditos y cobros (saas)

Leer antes de tocar `credit_service.py`, `ai_charge.py`, el cobro en `plan_service.py` /
`reinforcement_service.py`, los límites por nivel o `/account/*`. Decisiones de producto:
[../despliegue/saas-produccion.md](../despliegue/saas-produccion.md) §3 y §6.

## Qué cuesta

| Acción | `saas` | `self_hosted` |
|---|---|---|
| Plan nuevo (`POST /plans/generate`) | 1 crédito (`plan:{plan_id}:charge`) | cuota diaria `FreeAiQuota` (igual que antes) |
| Refuerzo con IA (`POST /sessions/{id}/reinforcement`) | 1 crédito (`reinforcement:{session_id}:{intento}`) | cuota diaria |
| Reanudar plan (`/plans/{id}/resume`) | **0** (D13) | cuota diaria si usa la IA incluida |
| Asistente de estudio | **0**: mantiene su límite diario `FREE_AI_ASSISTANT_DAILY_LIMIT` | igual |
| Subir documento, crear meta, tests, ruta adaptativa | 0 | 0 |

En `saas`, `uses_free_ai()` devuelve `False`: la cuota diaria no interviene nunca.

## Modelo

- `credit_ledger` (`CreditLedger`): libro **solo de altas**. `delta`, `reason`, `source` (`purchased`|`pass`),
  `reference_type/id` (enlace blando, sin FK: sobrevive al borrado del plan), `balance_after` (total gastable
  tras el movimiento) e `idempotency_key` UNIQUE. Los enums se guardan como `VARCHAR` (`native_enum=False`).
- `users.credit_balance` (comprados/regalados, no vencen), `users.pass_credits`, `users.pass_expires_at`: cachés
  coherentes con el ledger. El **nivel no es columna** (D8): pase vigente → `pass`; alguna compra en el ledger →
  `credits`; si no → `free`.
- `plans.charge_ledger_id`: fila del cobro del plan; se limpia al reembolsar o al quedar READY.
- `goals.archived_at`. Todas con backfill en `init_db._ensure_credit_columns`.

## `CreditService` (`app/services/credit_service.py`)

Cada método hace commit propio, como `FreeAiQuota`.

- `consume(...)`: si la clave existe devuelve ese id sin cobrar. Si no, `UPDATE` condicional (primero el pase
  vigente, luego lo comprado) + fila de ledger en la **misma transacción**. Sin saldo: rollback y
  `InsufficientCreditsError` (402 `INSUFFICIENT_CREDITS`), nada gastado. Dos peticiones sobre el último crédito:
  una gana, la otra 402; nunca saldo negativo (probado con hilos en SQLite y Postgres).
- `refund(charge_id)`: clave `refund:{charge_id}` → exactamente una vez; vuelve a la misma `source`.
- `grant(...)`: abono idempotente por clave.
- `balance(user_id)` → `CreditBalance` (con `total`, límites y usos). `ensure_document_slot` /
  `ensure_goal_slot` lanzan `PlanLimitError` (403 `PLAN_LIMIT_REACHED`).

## Cobro y reembolso

- **Plan** (`PlanService._charge_credit`): en `saas` la fila del plan se crea primero (su id forma la clave) y
  después se cobra; sin créditos la fila se borra y la petición recibe 402, así que no queda plan ni gasto. Un
  reintento con la misma `Idempotency-Key` devuelve el plan existente antes de cobrar.
- **Reembolso del plan**: `_refund_plan_use` generaliza lo de `free_ai_use_date`: limpia por UPDATE condicional
  `free_ai_use_date` y `charge_ledger_id` y devuelve lo que hubiera. Cubre fallo de generación, plan borrado a
  mitad (respaldo con el id capturado al empezar) y recuperación al arrancar (`recover_interrupted_plans`).
- Reanudar tras un fallo cuesta 0: el cobro original ya se reembolsó al fallar.
- **Refuerzo** (`ai_charge.py`): el reclamo `NONE|FAILED → PROCESSING` es atómico, así que los intentos son
  seriales y `n = cobros previos + 1` da una clave única por intento; un doble POST es una réplica sin cobro.
  El token que viaja a la tarea es un `date` (self_hosted) o `AiCharge(ledger_id)` (saas); solo la tarea
  reembolsa (`refund_charge`, idempotente). Al reiniciar, el refuerzo pasa a FAILED sin reembolso (como antes).
  No hay columna `reinforcement_charge_id`: la clave `refund:{id}` ya garantiza «una vez».

## Regalo de bienvenida y antiabuso

`on_user_created` (en `user_service.py`, solo la primera vez que se crea el usuario) concede 3 créditos en
`saas` (D2: un token válido ya implica correo verificado). Antiabuso básico: dominios desechables
(`core/disposable_domains.py`, lista estática corta) y clave por **bandeja normalizada**
(`signup_bonus:{correo sin +etiqueta ni puntos de Gmail}`), así los alias no multiplican el regalo.
No hay límite por IP/día (el hook no ve la petición): pendiente para el rate limiting.

## Límites por nivel (solo `saas`)

| Nivel | Documentos | Metas activas |
|---|---|---|
| free | 3 | 2 |
| credits | 30 | 10 |
| pass | 100 | sin límite |

«Activa» = ni borrada ni archivada. `POST /goals/{id}/archive|unarchive` son idempotentes; reactivar sin hueco
da 403. Una meta archivada sigue en `GET /goals` con `archived_at` y aún admite planes (cuestan crédito igual).
Los límites se comprueban antes de guardar (blandos ante subidas simultáneas).

## Endpoints

`GET /account/credits` → saldo, nivel, límites y usos. `GET /account/credits/history?limit=50` → movimientos del
usuario, recientes primero. Contrato: `docs/api_contract.yaml`. En `self_hosted` el saldo es 0 y los límites `null`.

## Subida de PDF

`inspect_pdf` (PyMuPDF opcional; sin él solo mira `/Encrypt`) rechaza PDF cifrado («El PDF está protegido con
contraseña.») y PDF con más de `MAX_PDF_PAGES` (200 por defecto). 400 en ambos casos, en cualquier modo.

## Trampas

- SQLite reutiliza ids de planes borrados; las claves `plan:{id}:charge` no se repiten en Postgres (secuencias),
  pero los tests vacían el ledger antes de cada caso.
- Un reembolso de pase vuelve a `pass_credits` aunque el pase haya vencido (`shortcut:` en el código).
