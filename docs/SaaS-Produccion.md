# StudyAI → SaaS en producción

> Reporte de análisis y hoja de ruta · 2026-10-20
> Alcance: qué le falta a StudyAI para pasar de prototipo funcional a un SaaS de pago para
> estudiantes universitarios peruanos (cuentas, créditos, pagos con Yape y Visa, métricas,
> infraestructura, seguridad y aspectos legales).

---

## Índice

1. [Contexto y decisiones tomadas](#1-contexto-y-decisiones-tomadas)
2. [Diagnóstico del código actual](#2-diagnóstico-del-código-actual)
3. [Modelo de monetización](#3-modelo-de-monetización)
4. [Cuentas y autenticación (Supabase)](#4-cuentas-y-autenticación-supabase)
5. [Modo de despliegue: SaaS vs autoalojado](#5-modo-de-despliegue-saas-vs-autoalojado)
6. [Sistema de créditos](#6-sistema-de-créditos)
7. [Pagos: Yape y tarjeta](#7-pagos-yape-y-tarjeta)
8. [Métricas de uso, costos e ingresos](#8-métricas-de-uso-costos-e-ingresos)
9. [Infraestructura de producción](#9-infraestructura-de-producción)
10. [Seguridad y antiabuso](#10-seguridad-y-antiabuso)
11. [Legal y tributario (Perú)](#11-legal-y-tributario-perú)
12. [Operación, soporte y producto](#12-operación-soporte-y-producto)
13. [Checklist priorizada (P0 / P1 / P2)](#13-checklist-priorizada-p0--p1--p2)
14. [Hoja de ruta por fases](#14-hoja-de-ruta-por-fases)
15. [Verificación y pruebas](#15-verificación-y-pruebas)
16. [Riesgos y decisiones abiertas](#16-riesgos-y-decisiones-abiertas)
17. [Fuentes](#17-fuentes)

---

## 1. Contexto y decisiones tomadas

StudyAI ya es un prototipo completo: el alumno sube material (`.pdf`/`.md`), define una meta
(examen / aprendizaje / memorización) y el backend genera un plan con sesiones espaciadas
(SM-2 / Ebbinghaus), temas priorizados (Pareto), material, flashcards y preguntas de opción
múltiple, además de una ruta adaptativa y repasos con IA.

El problema es que **está construido como una app de un solo usuario en una sola máquina**. Para
venderlo como SaaS faltan cuatro bloques de producto y una capa transversal:

| Bloque | Qué falta |
|---|---|
| Cuentas | Registro con correo + contraseña, Google, verificación, recuperar contraseña |
| Créditos | 3 gratis para siempre, consumo por plan / repaso con IA, saldo visible, aviso en gris |
| Pagos | Recarga con Yape y tarjeta Visa, paquetes y pase mensual |
| Métricas | Uso, temas recurrentes, horas pico, tipos de meta, gasto en tokens, ingresos y margen |
| Transversal | Infraestructura multiusuario, seguridad, antiabuso, legal peruano, soporte |

### Decisiones ya tomadas

| Tema | Decisión |
|---|---|
| Autenticación | **Supabase Auth** (correo + contraseña + Google). Se aprovecha también su Postgres gestionado. |
| Modelo del SaaS | **Solo pago con créditos.** En la plataforma no hay "Mi API key" ni Ollama. |
| Repositorio | Será **open source** y conserva "Mi API key" y Ollama para quien lo monte en su máquina. |
| RUC | Aún no hay, pero se puede sacar rápido → se tramita antes de abrir pagos reales. |

### Decisiones confirmadas (2026-10-21)

| Tema | Decisión |
|---|---|
| Proveedor de IA del SaaS | **Claude Haiku** desde el lanzamiento oficial. La clave está en el `.env` raíz como `CLAUDE_API_KEY` (hoy sin saldo; se recarga al llegar a pruebas reales). Ojo: `Settings` lee `ANTHROPIC_API_KEY`, hay que mapearla. |
| Licencia | **MIT**. |
| Productos | Se mantienen **3 productos**: paquete chico (10 créditos), paquete grande (~60 créditos) y suscripción/pase. **Precios y cantidades provisionales** (S/ 4,90 y S/ 19,90–20 eran un punto de partida): se fijan tras medir costo real y margen en las pruebas. El sistema debe permitir cambiarlos sin desplegar (`products` en base de datos). |
| Desarrollo | `FakeGateway` + Postgres local. Los datos de prueba se limpian antes de subir a la nube. |
| Auth | Supabase. Variables ya en `.env`: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWKS_URL`. La clave secreta **nunca** va al frontend. |
| Hosting | Prototipo/beta en un hosting simple; **destino final AWS** (todo centralizado y escalable). Por eso el código no debe atarse a un hosting concreto (Docker, variables de entorno, S3-compatible para archivos). |
| Pagos | Cuenta de Mercado Pago creada; el sandbox aún no está activado. |
| RUC | Se tramita ~2 días antes del despliegue de pruebas, para probar la pasarela real. |
| Lanzamiento | Beta con al menos **15 estudiantes**; el lanzamiento oficial al superar **40**. |
| Entrada a la sesión (§8 del plan de frontend) | Al llegar a `READY`: botón «Empezar la primera sesión pendiente» + «Ver todas». Sin redirección automática. |
| Idempotencia | Se cubre con la clave idempotente del `credit_ledger` (un cobro por pedido); no hay tarea backend aparte. |
| Hosting final | **AWS** (control de gastos y todo en una sola cuenta). Región São Paulo (`sa-east-1`). Crear desde el inicio un presupuesto con alerta (AWS Budgets) y guardar secretos en Secrets Manager / SSM, nunca en el repo. |
| Comprobantes | Boletas por **SUNAT SOL** (manual) durante la beta; **Nubefact** antes del lanzamiento oficial (>40 usuarios). |
| Legal en la beta | Política de privacidad y términos publicados desde la beta; el registro del banco de datos personales, antes del lanzamiento oficial. |
| Variables | `ANTHROPIC_API_KEY` ya renombrada. Mercado Pago: `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`, `MP_WEBHOOK_SECRET`. |
| Estado | **Preparación**: no se implementa nada hasta que el entorno (Supabase, Google, Mercado Pago, AWS) esté listo. |

---

## 2. Diagnóstico del código actual

### 2.1 Lo que ya está bien y se reutiliza

- **Aislamiento por usuario ya diseñado.** Todas las rutas reciben `user: User = Depends(get_current_user)`
  y filtran por `user.id` (≈36 usos en `backend/app/api/v1/routes/`). Los modelos `Document`, `Goal`,
  `Plan`, `FlashcardReview`, `LLMCredential` y `FreeAiUsage` tienen `user_id` con FK a `users`.
  → Cambiar a usuarios reales es, en lo esencial, reemplazar una función.
- **Consumo/reembolso atómico de usos.** `FreeAiQuota` (`backend/app/services/free_ai_quota.py`) hace
  `UPDATE ... WHERE uses < limit` y reembolsa exactamente una vez usando `Plan.free_ai_use_date`.
  Es el patrón correcto para créditos; solo cambia la unidad (saldo en vez de usos diarios).
- **Idempotencia en generación.** `Plan` tiene `UniqueConstraint("user_id", "idempotency_key")` y el
  frontend tiene `src/lib/idempotency.ts`. El mismo principio sirve para órdenes de pago.
- **Generación reanudable y robusta.** Commits por paso, `progress_stage`, recuperación al arrancar.
- **Seguridad de credenciales.** Fernet para claves, protección SSRF (`app/core/url_safety.py`), logs
  saneados (`app/core/logging.py`).
- **Patrón "dos implementaciones con fallback"** (embedder, vector store, chunker, LLM). Se usa igual
  para la pasarela de pagos (real + falsa para desarrollo/tests).

### 2.2 Lo que falta o bloquea

| Área | Estado actual (archivo) | Problema para SaaS |
|---|---|---|
| Usuarios | `app/api/deps.py` devuelve siempre `DEFAULT_USER_ID = 1` (`demo@studyai.local`). `User` tiene `email` y `hashed_password=""` | No hay registro, login, Google, verificación ni recuperación |
| Cuota | `FREE_AI_DAILY_LIMIT=3` **por día UTC** (`free_ai_quota.py`) | El modelo deseado es 3 gratis **de por vida** + créditos pagados |
| Reanudar | `PlanService.resume_plan` gasta otro uso | En SaaS se percibe como cobro doble por un fallo del sistema |
| Pagos | No existe nada | Pasarela, órdenes, webhooks, saldo, comprobantes |
| Costo de IA | `LLMProvider.complete()` (`app/llm/base.py`) devuelve solo `str`. `AnthropicProvider._validate_usage` lee `usage` pero lo descarta | **No se registra ningún token**: no se puede calcular costo por plan ni margen |
| Métricas | Solo el dashboard del alumno (`/dashboard`) | Sin analítica de producto ni panel de negocio |
| Base de datos | SQLite (WAL) + `Base.metadata.create_all()` + backfills a mano en `app/db/init_db.py` | No soporta concurrencia real ni varios procesos; sin migraciones versionadas ni backups |
| Vectores | ChromaDB local o `_InMemoryStore` en JSON (`app/rag/vector_store.py`) | Atado al disco de una máquina |
| Archivos | `UPLOAD_DIR` en disco local (`app/services/document_service.py:47`) | Se pierden al redeplegar; no escalan horizontalmente |
| Tareas en 2º plano | `BackgroundTasks` de FastAPI + `recover_interrupted_plans` al arrancar (`main.py`) | **Asume un solo proceso**: con 2 workers, uno al arrancar marca FAILED las generaciones vivas del otro |
| Embeddings | sentence-transformers (torch, pesado) o embedder por hashing | Torch infla la imagen; el hashing tiene mala calidad semántica |
| Modo demo / mock | Si no hay proveedor, cae a `MockLLMProvider` | Un usuario que paga nunca debe recibir contenido falso |
| BYOK / Ollama | Página "Conectar IA" (`SettingsPage.tsx`), paso "Elige tu IA" en `StudySetup` | Debe ocultarse y bloquearse en backend en el SaaS. Ollama además no funciona en la nube: `OLLAMA_BASE_URL` lo lee el servidor, que no llega a la PC del alumno |
| Seguridad | Sin rate limiting; `SECRET_KEY=change-me-in-production`; validación de archivo por extensión y tamaño (`MAX_UPLOAD_MB=25`) | Abuso de endpoints caros, archivos maliciosos, cuentas múltiples para farmear créditos |
| Legal | No hay términos, privacidad ni Libro de Reclamaciones | Obligatorio en Perú para vender online a consumidores |
| Infra | Sin Docker, sin CI/CD, sin staging, sin monitoreo de errores | Nada para desplegar ni detectar caídas |
| Correo | No hay envío de correos | Verificación, recibos, avisos de vencimiento |

---

## 3. Modelo de monetización

### 3.1 Qué es un "intento" (crédito)

| Acción | Créditos | Llamadas al LLM |
|---|---|---|
| Generar un plan nuevo | **1** | `2 + N` (N = sesiones; típico 6–10) |
| "Repasar con IA" (refuerzo de una sesión) | **1** | 1 |
| Reanudar un plan que falló | **0** | lo que falte |
| Subir documento | 0 | 0 (solo embeddings locales) |
| Crear / editar meta | 0 | 0 |
| Rendir test, ruta adaptativa, repaso sin IA | 0 | 0 (la ruta adaptativa no usa LLM) |

Reglas:
- Si la generación falla, **se devuelve el crédito** (como hoy con la cuota gratis).
- Un mismo pedido repetido (doble clic, reintento de red) cobra **una sola vez** (idempotencia).
- El repaso con IA es mucho más barato que un plan; cobrar lo mismo subsidia los planes y simplifica
  la explicación al usuario ("todo con IA cuesta 1").

### 3.2 Cuenta gratuita

- **3 créditos de regalo, una sola vez**, al verificar el correo o entrar con Google.
- Hasta **3 documentos** y **2 metas activas**.
- Los créditos de regalo se consumen igual que los pagados.

### 3.3 Paquetes y pase mensual (precios en soles)

Yape solo opera en soles, y los estudiantes piensan en soles. US$1 ≈ S/ 3.75.

| Producto | Idea original | Recomendación | Motivo |
|---|---|---|---|
| Paquete chico | US$1 → 10 intentos | **S/ 4.90 → 10 créditos** | A S/ 3.75 la comisión fija + IGV se comen casi todo |
| Paquete grande | US$5 → 80 intentos | **S/ 19.90 → 60–80 créditos** | El número final se fija tras medir el costo real (Fase 1) |
| Mensual | US$10 → 1 mes, 100 documentos | **S/ 34.90 / 30 días: 100 documentos, metas ilimitadas, 150 créditos (uso justo)** | El costo lo generan los planes, no los documentos |

- Créditos comprados: **no vencen** (menos reclamos y más simple de explicar).
- Créditos del pase: se reinician cada 30 días y no se acumulan.
- Si alguien tiene pase activo y además compró créditos, se consumen primero los del pase.

### 3.4 Cuántas metas puede tener un usuario

Una meta por sí sola no cuesta nada (no llama al LLM). El límite solo sirve para ordenar la
experiencia y empujar suavemente al pago:

| Plan | Metas activas | Documentos |
|---|---|---|
| Gratis | 2 | 3 |
| Con créditos comprados | 10 | 30 |
| Pase mensual | Ilimitadas | 100 |

"Activa" = no archivada. Se añade **archivar meta** (`Goal.archived_at`), así el alumno cierra un curso
terminado y abre otro sin pagar y sin perder su historial.

### 3.5 Unidad económica (estimación a validar)

Supuestos: venta como persona con RUC en régimen con IGV (18% incluido en el precio), pasarela con
~3–4% + monto fijo + IGV sobre la comisión, IA con DeepSeek.

**Costo de IA estimado por crédito** (hay que medirlo, ver §8):
- Plan: ~8–12 llamadas, ~30k tokens de entrada y ~25k de salida → **~US$0.02–0.06** (S/ 0.08–0.23).
- Repaso con IA: 1 llamada → **~US$0.003–0.008**.

**Paquete S/ 4.90 (10 créditos) pagado con Yape:**

| Concepto | Monto |
|---|---|
| Precio | S/ 4.90 |
| − IGV (4.90 / 1.18) | − S/ 0.75 |
| − Comisión pasarela (~3% + S/ 0.30 + IGV) | − S/ 0.53 |
| **Neto** | **≈ S/ 3.62** |
| − Costo IA (10 planes, peor caso) | − S/ 2.25 |
| **Margen peor caso** | **≈ S/ 1.37 (38%)** |
| Margen caso típico (mezcla planes/repasos, S/ 0.10 por crédito) | ≈ S/ 2.60 (72%) |

**Paquete S/ 19.90 (80 créditos):** neto ≈ S/ 15.70; costo IA peor caso 80 × 0.23 = S/ 18.40 →
**pérdida en el peor caso**. Con 60 créditos el peor caso queda en ≈ S/ 1.90 de margen.
→ Por eso el número del paquete grande se decide **después** de medir.

**Pase S/ 34.90 (150 créditos):** neto ≈ S/ 28.30; peor caso 150 × 0.23 = S/ 34.50 → pérdida si alguien
usa todo en planes. En la práctica pocos consumen el 100% (breakage), pero hay que vigilarlo en el
panel de margen.

Con tarjeta, la comisión suele ser más alta (≈4% + S/ 0.60 + IGV) → el neto del paquete chico baja a ≈ S/ 3.25.

### 3.6 Pase mensual y Yape

Yape **no admite cobros automáticos recurrentes**. Por eso:
- **Lanzamiento:** "Pase de 30 días" **prepagado** (Yape o tarjeta), sin renovación automática.
  Correo de aviso 3 días antes de vencer y botón "Renovar".
- **Más adelante:** renovación automática solo con tarjeta (API de suscripciones de la pasarela),
  con manejo de cobros fallidos.

### 3.7 Texto aclaratorio en gris

Ubicación: debajo de los botones "Estudiar" (generar plan), "Repasar con IA" y del área de subida de
material. Estilo: `text-sm` con el token de texto secundario (gris), ni muy grande ni muy pequeño.

> Cada plan nuevo o repaso con IA usa 1 crédito. Te quedan **2 de 3 gratis**. Subir material y crear
> metas no gasta créditos. Si la generación falla, te devolvemos el crédito. · [Ver precios](/precios)

Variantes:
- Con saldo pagado: «Cada plan nuevo o repaso con IA usa 1 crédito. Tienes **14 créditos**.»
- Con pase: «Tu pase vence el 18 nov. Te quedan **120 de 150** créditos este mes.»
- Sin saldo: el botón principal se deshabilita mostrando su motivo (regla existente del proyecto:
  `aria-describedby`) y un botón «Recargar créditos».

---

## 4. Cuentas y autenticación (Supabase)

### 4.1 Qué hace Supabase y qué hace el backend

| Responsabilidad | Quién |
|---|---|
| Registro, login, Google OAuth, verificación de correo, recuperar contraseña, sesiones y refresh | Supabase Auth |
| Validar el token en cada petición y mapearlo a un `User` local | Backend (`get_current_user`) |
| Datos de la app (documentos, planes, créditos, órdenes) | Postgres (de Supabase) vía SQLAlchemy, como hoy |

### 4.2 Backend

1. `Settings` (`app/core/config.py`): `AUTH_MODE` (`demo` | `supabase`), `SUPABASE_URL`,
   `SUPABASE_JWT_AUDIENCE`, URL de JWKS.
2. `get_current_user` (`app/api/deps.py`):
   - `AUTH_MODE=demo` → comportamiento actual (usuario 1). Así el modo autoalojado no cambia.
   - `AUTH_MODE=supabase` → leer `Authorization: Bearer <jwt>`, validar firma con JWKS (cacheado),
     `aud`, `exp`, `iss`; 401 si falla. Buscar `User` por `supabase_user_id` (`sub`); si no existe,
     crearlo con su `email` (alta perezosa, *just-in-time*).
   - Rechazar usuarios con correo no verificado para acciones que consumen créditos.
3. Modelo `User`: añadir `supabase_user_id` (único, indexado), `email_verified_at`, `credit_balance`,
   `plan_tier`, `deleted_at`. `hashed_password` deja de usarse en SaaS.
4. Regalo de 3 créditos: al crear el `User` con correo verificado (o al verificar), un asiento
   `signup_bonus` idempotente (clave `signup_bonus:{user_id}`).
5. Las rutas **no cambian**: ese límite se diseñó para esto (ver nota en `deps.py`).

### 4.3 Frontend

1. Dependencia `@supabase/supabase-js`.
2. Páginas `/login`, `/registro`, `/recuperar`, `/cuenta` (perfil, saldo, compras, eliminar cuenta).
3. Interceptor en `src/api/client.ts` que añade `Authorization: Bearer` con el token vigente y
   redirige a `/login` ante un 401.
4. Rutas protegidas en `App.tsx`: todo lo que vive dentro de `AppShell`. Siguen públicas `/`, `/demo`,
   `/precios`, `/terminos`, `/privacidad`, `/reclamaciones`.
5. `/demo` sigue sin importar el cliente de API (regla del proyecto).

### 4.4 Configuración de Supabase

- Proveedores: Email (confirmación obligatoria) y Google (cliente OAuth en Google Cloud con dominio verificado).
- Plantillas de correo en español.
- URLs de redirección: dominio de producción y de staging.
- SMTP propio (Resend/Brevo) para no depender del límite de correos del plan gratuito de Supabase.

---

## 5. Modo de despliegue: SaaS vs autoalojado

El repositorio será open source. El mismo código debe servir para la plataforma de pago y para quien
lo instale en su máquina.

### 5.1 Variable de entorno

`DEPLOYMENT_MODE=self_hosted` (por defecto) | `saas`, leída solo en `app/core/config.py`.

### 5.2 Comportamiento

| Aspecto | `self_hosted` | `saas` |
|---|---|---|
| Autenticación | demo (usuario 1) o Supabase opcional | Supabase obligatorio |
| Cadena de proveedores (`resolve_llm_provider`, `app/llm/factory.py`) | Como hoy: credencial del usuario → `.env` Anthropic → IA gratuita → mock | **Solo la clave del servidor**. Se ignoran credenciales del usuario y Ollama |
| Mock | Permitido (modo demo, regla del CLAUDE.md) | **Prohibido**: si no hay proveedor real, error claro y crédito devuelto |
| Cuota | `FreeAiQuota` diaria | `CreditService` |
| `/llm-settings/*` (escritura) | Disponible | 404 |
| UI "Conectar IA" y paso "Elige tu IA" | Visibles | Ocultos |
| Páginas de precios / compra | Ocultas | Visibles |

### 5.3 Exposición al frontend

Un endpoint `GET /config` (o un campo en `GET /llm-settings/runtime`) devuelve `deployment_mode` y
`auth_mode`. El frontend decide qué páginas y pasos mostrar. **El backend siempre valida**: ocultar en
la UI no basta.

### 5.4 Licencia

- **AGPL-3.0** si no quieres que un tercero monte tu mismo SaaS cerrado con tu código (obliga a
  publicar los cambios cuando se ofrece como servicio en red).
- **MIT** si no te importa ese escenario.
- Nunca subir `.env` con claves (ya están en `.gitignore`); revisar el historial de git antes de
  publicar por si alguna vez se commiteó una clave.

---

## 6. Sistema de créditos

### 6.1 Tablas propuestas

```text
credit_ledger                         -- libro contable: nunca se edita, solo se agregan filas
  id               PK
  user_id          FK users
  delta            INTEGER            -- +10 compra, -1 plan, +1 reembolso
  reason           ENUM(signup_bonus, purchase, pass_grant, plan, reinforcement,
                        refund, admin_adjustment, expiration)
  source           ENUM(purchased, pass) -- de qué bolsa sale/entra
  reference_type   VARCHAR            -- 'plan' | 'session' | 'order'
  reference_id     INTEGER
  idempotency_key  VARCHAR UNIQUE     -- p. ej. 'plan:123:charge', 'order:45:credit'
  balance_after    INTEGER
  created_at       TIMESTAMP

users (+columnas)
  credit_balance   INTEGER  -- caché del saldo comprado, coherente con el ledger
  pass_credits     INTEGER  -- saldo del pase vigente
  pass_expires_at  TIMESTAMP NULL
  plan_tier        ENUM(free, credits, pass)  -- derivado, para límites de metas/documentos
```

### 6.2 Consumo atómico

Mismo patrón que `FreeAiQuota.consume`:

```sql
-- primero el pase vigente, luego lo comprado
UPDATE users SET pass_credits = pass_credits - 1
 WHERE id = :uid AND pass_credits >= 1 AND pass_expires_at > now();
-- si rowcount = 0:
UPDATE users SET credit_balance = credit_balance - 1
 WHERE id = :uid AND credit_balance >= 1;
-- si rowcount = 0 → 402 INSUFFICIENT_CREDITS
```

En la misma transacción se inserta la fila del ledger con su `idempotency_key`; si la clave ya
existe (doble petición), no se cobra otra vez.

### 6.3 Reembolso exactamente una vez

Hoy `Plan.free_ai_use_date` garantiza devolver un uso una sola vez. Se generaliza a
`Plan.charge_ledger_id` (y lo mismo para el refuerzo en `Session`): el reembolso inserta
`refund` con `idempotency_key = 'refund:' || charge_ledger_id` y limpia la columna. Cubre los mismos
casos que hoy: fallo de generación, cancelación de refuerzo, plan borrado, recuperación al arrancar.

### 6.4 Servicios a tocar

- Nuevo `app/services/credit_service.py` (`balance`, `consume`, `refund`, `grant`).
- `PlanService.create_plan` y `resume_plan` (`app/services/plan_service.py`): en SaaS usan
  `CreditService`; `resume_plan` no cobra.
- `_Generator` (reembolso en fallo) y `recover_interrupted_plans`.
- `ReinforcementService` (`app/services/reinforcement_service.py`): cobro al iniciar, reembolso solo
  desde la tarea en segundo plano (misma regla que hoy).
- Límites de documentos (`DocumentService.upload`) y metas activas (`goals.py` → servicio) según `plan_tier`.
- Excepción nueva `InsufficientCreditsError` → **402** con `code="INSUFFICIENT_CREDITS"` en
  `_register_exception_handlers` (`main.py`).

### 6.5 Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/account/credits` | Saldo comprado, del pase, vencimiento, límites del plan |
| GET | `/account/credits/history` | Movimientos del ledger (paginado) |

### 6.6 Frontend

- Saldo en la cabecera de `AppShell` (chip "14 créditos").
- Texto gris (§3.7) en `StudySetup`, `PlanDetailPage`/refuerzo y subida de documentos.
- Ante 402: abrir un `Dialog` (`components/Dialog.tsx`, reutilizado) con los paquetes.
- Reemplazar las referencias a `runtime.free_ai` (usos diarios) por el saldo de créditos en SaaS.

---

## 7. Pagos: Yape y tarjeta

### 7.1 Requisitos previos

1. **RUC** como persona natural con negocio (o empresa más adelante). Un contador debe elegir el
   régimen (NRUS, RER o MYPE Tributario) según ingresos esperados y la necesidad de emitir boletas
   electrónicas.
2. Cuenta bancaria a nombre del titular del RUC.
3. Términos, privacidad y Libro de Reclamaciones publicados (las pasarelas suelen pedirlos al aprobar la cuenta).

### 7.2 Pasarela recomendada

| Opción | A favor | En contra |
|---|---|---|
| **Mercado Pago** (recomendada para empezar) | Yape (vía Checkout API con número + código OTP de la app Yape) + Visa/Mastercard; checkout hospedado (no manejas datos de tarjeta, sin carga PCI); webhooks; API de suscripciones para el futuro; alta sencilla | Comisiones a confirmar en su página oficial; la experiencia de Yape exige que el alumno ingrese su número y OTP |
| **Culqi** (alternativa / segunda pasarela) | Muy usada en Perú; Yape y tarjetas; soporta cargos recurrentes | Cifras de comisión contradictorias entre fuentes; verificar requisitos de alta |
| Izipay / Niubiz | Bancarias, Yape QR | Integración y alta más pesadas para un emprendimiento pequeño |

Las comisiones publicadas en blogs se contradicen (p. ej. Culqi: entre 3.44% y 4.20% + monto fijo +
IGV; Yape vía Culqi 2.99% + S/ 0.30 según una fuente). **Confirmar en las páginas oficiales antes de
fijar precios.**

### 7.3 Diseño en el backend

Mismo patrón de "dos implementaciones" del repo:

```text
app/services/billing/
  gateway.py            # interfaz PaymentGateway: create_checkout(order) -> url,
                        #   parse_webhook(request) -> PaymentEvent, fetch_payment(id)
  mercadopago_gateway.py
  fake_gateway.py       # desarrollo y tests: marca pagado al instante
  billing_service.py    # órdenes, acreditación, pases
app/api/v1/routes/billing.py
```

### 7.4 Tablas

```text
products
  id, code UNIQUE ('pack_10', 'pack_80', 'pass_30d'),
  name, price_cents (en céntimos de sol), currency='PEN',
  credits, pass_days NULL, active, created_at

orders
  id, user_id FK, product_id FK,
  status ENUM(pending, paid, failed, cancelled, refunded),
  amount_cents, currency,
  gateway ENUM(mercadopago, culqi, fake),
  gateway_payment_id UNIQUE NULL,   -- id externo, evita acreditar dos veces
  payment_method (yape, visa, mastercard, ...),
  idempotency_key UNIQUE,
  receipt_number NULL,              -- boleta SUNAT
  created_at, paid_at

payment_events                      -- auditoría de webhooks recibidos
  id, gateway, event_id UNIQUE, payload_hash, received_at, processed_at, error
```

### 7.5 Flujo de compra

```text
Alumno            Frontend                Backend                    Pasarela
  │ elige paquete    │                        │                          │
  │─────────────────>│ POST /billing/checkout │                          │
  │                  │ {product, idem_key} ──>│ crea order(pending)      │
  │                  │                        │── crear preferencia ────>│
  │                  │<── checkout_url ───────│<── url / id ─────────────│
  │<── redirige ─────│                        │                          │
  │ paga con Yape/Visa ─────────────────────────────────────────────────>│
  │                  │                        │<── webhook (firmado) ────│
  │                  │                        │ verifica firma           │
  │                  │                        │ consulta el pago a la API│
  │                  │                        │ order → paid (UPDATE     │
  │                  │                        │   WHERE status=pending)  │
  │                  │                        │ ledger +créditos         │
  │                  │                        │ (idem 'order:{id}')      │
  │<── vuelve a /pago/resultado ──────────────│                          │
  │                  │ GET /billing/orders/{id} (polling hasta paid)     │
```

Reglas no negociables:
- **Nunca acreditar desde la redirección del navegador**; solo desde el webhook verificado (o una
  consulta del backend a la API de la pasarela).
- Verificar la **firma** del webhook y, además, consultar el pago por su id a la API.
- Procesamiento **idempotente**: el mismo evento dos veces acredita una vez (`payment_events.event_id`
  único + `UPDATE ... WHERE status='pending'`).
- Montos siempre desde `products` en el servidor, nunca desde el cliente.
- Tarea de conciliación diaria: órdenes `pending` de más de 1 hora se consultan a la pasarela.

### 7.6 Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/billing/products` | Paquetes y pase activos (para `/precios`) |
| POST | `/billing/checkout` | Crea orden y devuelve la URL de pago |
| POST | `/billing/webhooks/mercadopago` | Webhook (sin auth de usuario, con firma) |
| GET | `/billing/orders` | Historial de compras del usuario |
| GET | `/billing/orders/{id}` | Estado de una orden (polling tras el pago) |

### 7.7 Comprobantes electrónicos (SUNAT)

Cada venta a un consumidor requiere una **boleta electrónica**. Opciones:
- Un OSE/PSE con API (p. ej. Nubefact) llamado tras marcar la orden como pagada; guardar
  `receipt_number` y enviar el PDF por correo.
- Al inicio, emisión manual desde SUNAT SOL si el volumen es muy bajo (no escala).

### 7.8 Reembolsos

Política sugerida: devolución del dinero de créditos **no usados** dentro de los 7 días de la compra.
El reembolso registra `refunded` en `orders` y un asiento negativo en el ledger.

---

## 8. Métricas de uso, costos e ingresos

### 8.1 Registro de uso del LLM (lo primero que hay que hacer)

Hoy no se guarda ningún token. Cambio propuesto:

1. `LLMProvider.complete()` (`app/llm/base.py`) devuelve también el uso. Para no romper los call
   sites, el resultado puede ser un objeto con `.text` y `.usage` (tokens de entrada, salida, modelo),
   o el proveedor puede notificar el uso a un registrador inyectado.
2. Fuentes del uso:
   - Anthropic: `response.usage.input_tokens` / `output_tokens` (ya se lee en `_validate_usage`).
   - OpenAI-compatible / DeepSeek: `usage.prompt_tokens` / `completion_tokens` del cuerpo JSON
     (`app/llm/openai_compatible_provider.py`); DeepSeek además informa aciertos de caché.
   - Mock / Ollama: 0 costo.
3. Tabla:

```text
llm_usage
  id, user_id, plan_id NULL, session_id NULL,
  kind ('topic_analysis' | 'session_plan' | 'session_content'),
  provider, model,
  input_tokens, output_tokens, cached_input_tokens,
  cost_usd NUMERIC(10,6),     -- calculado con la tabla de precios
  latency_ms, success BOOLEAN, error_code NULL,
  created_at
```

4. Precios por modelo en `Settings` (USD por millón de tokens de entrada/salida), actualizables sin
   desplegar código.
5. Se registra también en llamadas fallidas (las que cobra el proveedor aunque nosotros reembolsemos).

### 8.2 Analítica de producto

**PostHog** (plan gratuito generoso o autoalojado), en frontend y backend:

| Evento | Propiedades |
|---|---|
| `signup_completed` | método (email / google) |
| `document_uploaded` | tipo, tamaño, páginas |
| `goal_created` | `goal_type` (exam / learning / memorization), días hasta el examen |
| `plan_requested` / `plan_ready` / `plan_failed` | sesiones, duración, código de error |
| `session_completed` | puntaje, primera vez o reintento |
| `reinforcement_requested` | — |
| `checkout_started` / `purchase_completed` | producto, método de pago, monto |
| `credits_exhausted` | — (momento clave para conversión) |

La **hora más visitada** sale de los eventos con zona horaria `America/Lima`.
No enviar contenido de documentos ni nombres de temas a PostHog (privacidad).

### 8.3 Métricas de dominio desde la base

- **Temas más recurrentes:** agregar `PlanTopic.name` normalizado (minúsculas, sin tildes, sin
  puntuación) por semana; más adelante agrupar sinónimos con los embeddings que ya existen.
  Solo en agregado y con un mínimo de usuarios por tema (p. ej. ≥5) para no identificar a nadie.
- **Objetivos más planteados:** conteo de `Goal.goal_type` y longitud del horizonte de estudio.
- **Uso real:** sesiones completadas por usuario y semana, retención a 7/30 días.

### 8.4 Panel de negocio (admin)

**Metabase** conectado a Postgres con un usuario de solo lectura (lo más rápido de montar):

| Tarjeta | Fuente |
|---|---|
| Usuarios nuevos / activos (DAU, WAU, MAU) | `users`, PostHog |
| Conversión gratis → pago | `users` + `orders` |
| Ingresos por día / método de pago | `orders` (status = paid) |
| Gasto en IA por día / por usuario / por plan | `llm_usage` |
| **Margen bruto** = ingresos netos − gasto IA − comisiones | `orders` + `llm_usage` |
| ARPU, ticket promedio | `orders` |
| Costo promedio por plan y por repaso | `llm_usage` agrupado por `plan_id` / `kind` |
| Tasa de fallos de generación | `plans.status`, `llm_usage.success` |
| Metas por tipo, temas top, mapa de calor por hora | `goals`, `plan_topics`, PostHog |
| Créditos vendidos vs consumidos (breakage) | `credit_ledger` |

### 8.5 Alertas

- Saldo de la cuenta DeepSeek bajo (el proveedor devuelve 402 al agotarse).
- Gasto diario en IA por encima de un umbral.
- Un usuario con consumo anómalo (posible abuso).
- Tasa de fallos de generación > X% en una hora.

---

## 9. Infraestructura de producción

### 9.1 Base de datos

- **Postgres** (el de Supabase) en vez de SQLite. SQLAlchemy ya abstrae casi todo; revisar:
  - los `UPDATE` condicionales con `rowcount` (funcionan igual en Postgres),
  - `app/db/session.py` (los PRAGMA de WAL y `busy_timeout` son solo de SQLite),
  - `PRAGMA foreign_keys` está apagado a propósito en SQLite; en Postgres las FK **sí** se aplican,
    así que los `ondelete="CASCADE"` empezarán a actuar. Revisar `delete_plan` y el borrado de metas
    (hoy hacen limpieza explícita) para que no choquen.
- **Alembic de verdad:** generar una migración base desde los modelos actuales; en SaaS las migraciones
  corren en el despliegue. `create_all` + backfills de `init_db.py` quedan solo para el modo autoalojado.
- **Backups:** diarios automáticos (Supabase los incluye según plan) y una prueba de restauración documentada.

### 9.2 Vectores y embeddings

- **pgvector** como tercer backend de `VectorStore` (`app/rag/vector_store.py`), con la misma interfaz:
  todo en una sola base, filtrado por `document_id` como hoy.
- Embeddings: **fastembed** (ONNX, sin torch, imagen liviana) o una API de embeddings barata. El
  embedder por hashing queda solo como fallback.

### 9.3 Archivos

**Supabase Storage** (o Cloudflare R2, compatible S3) con rutas `users/{user_id}/documents/{uuid}.pdf`,
bucket privado y URLs firmadas si alguna vez se descargan desde el navegador.

### 9.4 Trabajos en segundo plano

`BackgroundTasks` muere con el proceso y obliga a un solo worker. Reemplazo:

- **Redis + `arq`** (async, liviano) o RQ: la API encola `generate_plan(plan_id)` y `reinforce(session_id)`;
  un proceso **worker** separado los ejecuta.
- Recuperación por **lease/heartbeat**: el worker actualiza `plans.heartbeat_at` cada N segundos; un
  job periódico marca FAILED (y reembolsa) solo los planes cuyo heartbeat venció. Esto reemplaza la
  regla "todo lo PROCESSING al arrancar es huérfano", que rompe con varios procesos.
- Mantener `LLM_REQUEST_PACING_SECONDS` y el límite de concurrencia del worker acorde al rate limit
  del proveedor.

### 9.5 Hosting sugerido

| Pieza | Servicio | Nota |
|---|---|---|
| Frontend | Vercel o Cloudflare Pages | Estático, CDN, previews por PR |
| Backend API + worker | Railway, Render o Fly.io | Región São Paulo (la más cercana a Lima) |
| Postgres + Auth + Storage | Supabase | Región São Paulo |
| Redis | Upstash o el del hosting | Para la cola |
| Dominio + DNS | Cloudflare | HTTPS, protección básica |

### 9.6 Entrega

- `Dockerfile` del backend (multi-stage, sin torch) y `docker-compose.yml` para el modo autoalojado.
- **GitHub Actions:** `pytest -q`, `npm run lint`, `npm test`, `npm run build` en cada PR; despliegue
  a staging en merge a `main`, a producción con tag o aprobación manual.
- **Staging** con el sandbox de la pasarela y un proyecto Supabase separado.
- Variables y secretos en el gestor del hosting, nunca en el repositorio.

---

## 10. Seguridad y antiabuso

| # | Medida | Detalle |
|---|---|---|
| 1 | Rate limiting | Por usuario e IP (slowapi o en el proxy): login, subida, generación, checkout |
| 2 | Antiabuso del regalo | Créditos solo con correo verificado o Google; bloquear dominios de correo desechable; límite de cuentas nuevas por IP/día |
| 3 | Archivos | Validar tipo real (magic bytes), límite de páginas, timeout de parseo, rechazar PDFs cifrados o con bombas de compresión |
| 4 | Secretos | `SECRET_KEY` real (rotarlo invalida las credenciales Fernet; en SaaS ya no hay BYOK, así que el impacto es bajo) |
| 5 | CORS | Solo el dominio de producción en `CORS_ORIGINS` |
| 6 | Aislamiento | Test automático: el usuario B nunca lee ni modifica recursos del usuario A (todas las rutas) |
| 7 | Webhooks | Firma verificada, endpoint sin cookies, idempotente |
| 8 | Prompt injection | El texto de los documentos va como dato delimitado en los prompts; el LLM nunca decide enlaces (regla existente de YouTube) ni acciones |
| 9 | Dependencias | `pip-audit` y `npm audit` en CI |
| 10 | Encabezados | HSTS, CSP básica, `X-Content-Type-Options` en el frontend |
| 11 | Docs de API | `/docs` (Swagger) deshabilitado o protegido en producción |

---

## 11. Legal y tributario (Perú)

| Requisito | Qué implica | Prioridad |
|---|---|---|
| **RUC** | Persona natural con negocio; régimen a elegir con contador | P0 (antes de cobrar) |
| **Comprobantes electrónicos** | Boleta por venta (OSE/PSE con API, p. ej. Nubefact) | P0 |
| **Términos y condiciones** | Qué es un crédito, que no vencen, reembolsos, uso aceptable, propiedad del material subido | P0 |
| **Política de privacidad** (Ley 29733) | Qué datos se recogen, para qué, con quién se comparten (Supabase, pasarela, proveedor de IA), plazos de conservación, derechos ARCO | P0 |
| **Transferencia internacional de datos** | El material se envía a un proveedor de IA fuera del Perú. **DeepSeek procesa en China**: declararlo explícitamente o elegir otro proveedor | P0 |
| **Registro del banco de datos personales** | Ante la Autoridad Nacional de Protección de Datos Personales | P1 |
| **Libro de Reclamaciones virtual** | Obligatorio para proveedores que venden a consumidores (Código de Protección y Defensa del Consumidor, Indecopi); enlace visible en la web | P0 |
| **Información de precios** | En soles, con IGV incluido, condiciones visibles antes de pagar | P0 |
| **Derechos ARCO** | Eliminar cuenta y exportar datos desde `/cuenta` | P1 |
| **Menores de edad** | Indicar edad mínima en los términos | P1 |

Recomendación: una sesión con un contador (régimen y boletas) y revisión de los textos legales por un abogado antes del lanzamiento público.

---

## 12. Operación, soporte y producto

- **Correos transaccionales** (Resend o Brevo): bienvenida, compra confirmada + boleta, pase por vencer,
  plan listo (si tardó), créditos agotados.
- **Monitoreo de errores:** Sentry en backend y frontend (sin enviar contenido de documentos).
- **Disponibilidad:** UptimeRobot o similar sobre `/health`; página de estado simple.
- **Logs estructurados** con `request_id` y `user_id` (sin datos personales en texto libre).
- **Soporte:** WhatsApp Business + correo; preguntas frecuentes en `/ayuda` (créditos, Yape, reembolsos).
- **Landing:** sección de precios, testimonios, SEO básico, Open Graph para compartir.
- **Móvil:** revisar todas las pantallas a 360 px; PWA instalable (la mayoría estudiará desde el celular).
- **Herramienta de admin mínima:** ajustar créditos de un usuario (con asiento `admin_adjustment` y motivo), ver sus órdenes.
- **Referidos** (P2): créditos para quien invita y para el invitado tras su primera compra.

---

## 13. Checklist priorizada (P0 / P1 / P2)

**P0 = bloquea el lanzamiento · P1 = primer mes · P2 = con tracción**

### P0
- [ ] Registro de uso de tokens y costo por llamada (`llm_usage`)
- [ ] `DEPLOYMENT_MODE` con mock prohibido y BYOK/Ollama bloqueados en SaaS
- [ ] Supabase Auth en backend (`get_current_user`) y frontend (login, registro, recuperar, rutas protegidas)
- [ ] Postgres + Alembic + pgvector + almacenamiento de archivos en la nube
- [ ] `credit_ledger`, `CreditService`, 402 `INSUFFICIENT_CREDITS`, reembolso exactamente una vez
- [ ] Regalo de 3 créditos con correo verificado
- [ ] Límites de documentos y metas activas; archivar metas
- [ ] Texto gris de créditos y saldo en la cabecera
- [ ] RUC
- [ ] Mercado Pago (sandbox → producción) con webhook verificado e idempotente; `FakeGateway` para tests
- [ ] Página `/precios`, checkout, resultado del pago, historial
- [ ] Boletas electrónicas
- [ ] Términos, privacidad, Libro de Reclamaciones
- [ ] Cola de trabajos con worker separado y recuperación por heartbeat
- [ ] Rate limiting, validación de archivos, antiabuso del regalo, CORS y `SECRET_KEY`
- [ ] Test de aislamiento entre usuarios
- [ ] Docker, CI, staging, backups
- [ ] Sentry y monitoreo de disponibilidad

### P1
- [ ] PostHog con los eventos de §8.2
- [ ] Metabase con el panel de §8.4 y alertas de §8.5
- [ ] Correos transaccionales
- [ ] Eliminar cuenta y exportar datos
- [ ] Registro del banco de datos personales
- [ ] Pase de 30 días prepagado
- [ ] Conciliación diaria de órdenes pendientes
- [ ] Revisión móvil / PWA
- [ ] Preguntas frecuentes y canal de soporte

### P2
- [ ] Renovación automática del pase con tarjeta
- [ ] Segunda pasarela (Culqi)
- [ ] Agrupación semántica de temas
- [ ] Referidos
- [ ] Herramienta de admin más completa

---

## 14. Hoja de ruta por fases

| Fase | Duración aprox. | Contenido | Resultado |
|---|---|---|---|
| **1. Medir** | 1 semana | `llm_usage` + tabla de precios por modelo; `DEPLOYMENT_MODE` | Costo real por plan y por repaso → precios con datos |
| **2. Cuentas e infra** | 2–3 semanas | Supabase Auth; Postgres, Alembic, pgvector, Storage; Docker y CI | Multiusuario real |
| **3. Créditos** | 1 semana | Ledger, `CreditService`, límites, texto gris, modal de compra con `FakeGateway` | Flujo completo sin dinero real |
| **4. Pagos y legal** | 2 semanas (en paralelo con el RUC) | Mercado Pago sandbox → producción, `/precios`, boletas, textos legales, Libro de Reclamaciones | Cobro real con Yape y Visa |
| **5. Beta cerrada** | 2 semanas | Cola + worker, hosting, rate limiting, Sentry, PostHog, staging, backups | 20–50 estudiantes reales |
| **6. Negocio** | continuo | Metabase, alertas, correos, pase mensual, ajuste de precios | Decisiones con métricas |

Dependencias clave: la Fase 1 define los números de §3; la Fase 2 es requisito de la 3; el RUC es
requisito de pasar la Fase 4 a producción.

---

## 15. Verificación y pruebas

Por cada fase, además de `python -m pytest -q`, `npm run lint`, `npm test` y `npm run build` en CI:

| Área | Prueba |
|---|---|
| Auth | Token inválido/expirado → 401; usuario nuevo se crea una vez; `AUTH_MODE=demo` sigue igual |
| Aislamiento | Usuario B recibe 404 en todos los recursos de A (documentos, metas, planes, sesiones, quizzes, órdenes) |
| Modo SaaS | Sin clave del servidor → error claro, nunca mock; rutas de BYOK → 404 |
| Créditos | Consumo concurrente no deja saldo negativo; doble petición cobra una vez; fallo de generación reembolsa una vez; reanudar no cobra |
| Webhooks | Firma inválida → rechazado; mismo evento dos veces → una acreditación; monto alterado → rechazado |
| Pagos (staging) | Compra con Yape de prueba y tarjeta de prueba → saldo actualizado → generar plan → crédito descontado → forzar fallo → crédito devuelto |
| Costos | Un plan generado aparece en `llm_usage` con tokens y costo; la compra en `orders`; ambos en Metabase |
| Recuperación | Matar el worker a mitad de una generación → el plan pasa a FAILED tras el heartbeat y se reembolsa |

---

## 16. Riesgos y decisiones abiertas

| # | Tema | Riesgo / decisión | Cuándo |
|---|---|---|---|
| 1 | Créditos del paquete grande y del pase | Con el costo estimado, 80 créditos por S/ 19.90 pueden dar pérdida en el peor caso | Tras la Fase 1 |
| 2 | Proveedor de IA del SaaS | DeepSeek: barato pero datos en China. Claude Haiku / Gemini Flash: más caros, más confianza. Afecta margen y política de privacidad | Antes de la Fase 4 |
| 3 | Régimen tributario | Define IGV, límites de facturación y tipo de comprobante | Con un contador, antes de cobrar |
| 4 | FK en Postgres | Al pasar de SQLite, los `ondelete="CASCADE"` se activan; validar borrado de planes y metas | Fase 2 |
| 5 | Abuso del regalo | Cuentas múltiples para obtener créditos gratis | Fase 3 (antiabuso) |
| 6 | Dependencia del proveedor de IA | Saldo agotado o caída = sin servicio; los reembolsos lo mitigan, pero hay que alertar | Fase 5 |
| 7 | Licencia open source | AGPL vs MIT según si te preocupa un SaaS clon | Antes de publicar el repo |
| 8 | Créditos que no vencen | Pasivo contable creciente; revisar con el contador | Fase 4 |

---

## 17. Fuentes

- [Comparativa de pasarelas de pago en Perú 2026 (kom.pe)](https://kom.pe/pasarelas-pago-tienda-virtual-peru-2026/)
- [El panorama de pasarelas de pago en Perú (guiadesoftware.com)](https://www.guiadesoftware.com/blog/mejor-pasarela-pago-peru)
- [Mercado Pago Developers: Yape en Checkout API](https://mercadopago.com.pe/developers/en/docs/checkout-api/integration-configuration/yape)
- [Comisión de Yape Empresas (La República, 2024)](https://larepublica.pe/economia/2024/08/13/comision-de-295-en-yape-a-quienes-les-cobra-por-hacer-transferencias-yape-empresa-atmp-509561)
- [Culqi: librería oficial PHP (Packagist)](https://packagist.org/packages/culqi/culqi-php)

> Las comisiones citadas por blogs se contradicen entre sí. Antes de fijar precios, confirmar en las
> páginas oficiales de Mercado Pago y Culqi y en el contrato de afiliación.
