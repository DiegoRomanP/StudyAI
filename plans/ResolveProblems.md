# Plan de resolución de problemas y rediseño de StudyAI

Fecha: 2026-09-11

Ampliación técnica de proveedores: 2026-09-13.

Estado: histórico. Las correcciones de proveedores y configuración descritas en
la sección 3 se implementaron después de este diagnóstico; la optimización de
PDF/tokens, las suscripciones y el rediseño visual siguen siendo propuestas.

## Estado actual

- IA-01 a IA-10: resueltos en el ciclo revisionado de credenciales, los perfiles
  de solicitud, el mapeo de errores, el runtime y los contratos por proveedor.
- OpenRouter y NVIDIA NIM tienen adaptadores dedicados; NVIDIA usa catálogo de
  modelos curado, endpoint fijo y no repite el POST tras `202`.
- La suite backend verificada tiene 239 tests; el frontend tiene 32 tests Vitest,
  además de typecheck y build.
- La comprobación con cuentas reales, el rediseño visual amplio, la reducción
  adicional de tokens y las integraciones de suscripción permanecen pendientes.

Este documento conserva el razonamiento y el inventario de la revisión original.
Para el estado operativo actual usa `docs/AGENTS_STATUS.md`; para comandos y
contratos usa `README.md`, `AGENTS.md`, `CLAUDE.md` y `docs/api_contract.yaml`.

## 1. Objetivo y alcance acordado

Revisar y corregir el frontend y el backend, resolver los problemas de conexión
con proveedores de IA, incorporar una reducción interna de tokens para documentos
PDF y rediseñar la interfaz para facilitar el recorrido de estudio.

Decisiones acordadas con el usuario:

- La aplicación se ejecutará localmente y será de uso personal.
- ChatGPT Plus/Pro se integrará mediante Local Codex y su autenticación oficial.
- Claude se utilizará mediante API por ahora. La integración de Pro/Max queda
  pendiente de autorización oficial de Anthropic.
- La conversión PDF → Markdown será un proceso interno del backend, sin descarga
  pública ni controles visibles de conversión.
- Los fragmentos necesarios seguirán enviándose al proveedor de IA seleccionado.
- El frontend tendrá un diseño claro y minimalista, centrado en el estudio.

## 2. Estado de la revisión

Se realizó una revisión estática transversal de configuración de proveedores,
credenciales, procesamiento de documentos, generación de planes, sesiones,
cuestionarios y progreso.

La comprobación del frontend `tsc --noEmit`, la suite del backend, las pruebas
Vitest y el build pasaron después de implementar las correcciones. La reproducción
con proveedores reales y la validación visual amplia en navegador siguen pendientes.

La causa exacta del error de NVIDIA comunicado por el usuario aún no está
confirmada. Los hallazgos del código y los reportes externos son pistas que deben
contrastarse con el código HTTP y la respuesta saneada del caso concreto.

## 3. Proveedores de pago y capas gratuitas

### 3.1. Evidencia, prioridades y recorrido actual

Las rutas y números de línea siguientes corresponden al árbol de trabajo leído
el 2026-09-13; las funciones indicadas son la referencia estable si cambian las
líneas. «Confirmado» significa comprobado por lectura del código, no reproducción
con una cuenta real. Los escenarios descritos son casos que se deben convertir
en pruebas aisladas durante la implementación.

**Precisión sobre «API key inválida»:** el adaptador no transforma todos los
errores en ese mensaje. El servicio solo declara literalmente que la clave no
es válida cuando, después de `strip()`, tiene menos de 8 caracteres
(`llm_settings_service.py:46-48`). El frontend usa «No se pudo verificar la
clave» como mensaje alternativo y, normalmente, muestra el `detail` recibido.
Los defectos son la verificación acoplada al modelo, la falta de clasificación
y los estados ambiguos; no está demostrado que NVIDIA rechace la clave por un
fallo de StudyAI.

Recorrido implementado actualmente:

```text
SettingsPage
  PUT /llm-settings/{provider}             guarda o reemplaza la clave
  PATCH /llm-settings/{provider}/model     guarda modelo/URL como nueva revisión
  POST /llm-settings/{provider}/test       prueba exactamente la revisión guardada
  POST /llm-settings/{provider}/activate   exige evidencia vigente de esa revisión
  GET /llm-settings/runtime                expone la fuente efectiva sin secretos

provider_registry.py
  metadatos → validación → perfil → construcción → verificación por proveedor
```

Ollama tiene un recorrido diferente: descubre modelos locales, envía el modelo
elegido al test, omite Bearer, permite 32 tokens de prueba y desactiva pacing y
reintentos de 429. Eso explica diferencias de comportamiento sin demostrar que
todo problema del adaptador sea exclusivo de proveedores externos.

| ID | Prioridad | Defecto | Estado |
| --- | --- | --- | --- |
| IA-01 | Alta | Modelo fijo bloquea la verificación y oculta el selector | Resuelto |
| IA-02 | Alta | Es posible activar sin verificación real | Resuelto |
| IA-03 | Alta | Se prueba una URL y se guarda otra | Resuelto |
| IA-04 | Alta | Errores sin clasificar y respuestas externas expuestas como texto | Resuelto |
| IA-05 | Alta | `max_tokens` incompatible con un modelo o-series sugerido | Resuelto en código y contrato; cuenta real pendiente |
| IA-06 | Media | Prueba de 5 tokens y lectura insuficiente de respuestas | Resuelto mediante perfiles y validación de salida |
| IA-07 | Media | Reintentos de cuota agotada y espera mal acotada | Resuelto |
| IA-08 | Alta | La UI anuncia demo aunque el servidor pueda usar Anthropic | Resuelto con runtime efectivo |
| IA-09 | Media | `session_content` no usa el modelo económico del reparto Anthropic | Resuelto para la ruta `.env` |
| IA-10 | Media | La URL personalizada de Anthropic se guarda pero se ignora | Resuelto con rechazo explícito |

### 3.2. Corrección específica de cada defecto

#### IA-01 — Verificación forzada del modelo predeterminado

**Dónde:** `frontend/src/pages/SettingsPage.tsx:127-145`,
`handleVerifyAndSave()`; líneas 123 y 253-309, exclusión entre formulario de
clave y selector; `backend/app/services/llm_settings_service.py:150-154`,
selección del modelo de prueba. NVIDIA usa el valor fijo definido en
`backend/app/llm/providers_catalog.py:100-113`.

**Causa:** la UI envía el test sin modelo. Si el modelo predeterminado devuelve
403, 404 o 410, no se ejecuta el PATCH y `credential.model` continúa vacío. La
UI vuelve a ofrecer la clave y no permite probar un modelo al que sí se tenga
acceso.

**Reproducción prevista:** simular fallo de acceso del modelo predeterminado y
éxito de otro modelo con la misma clave. Hoy el segundo no puede seleccionarse
durante la configuración inicial.

**Cambios:**

- `SettingsPage.tsx`: separar «Guardar clave» de «Guardar y verificar modelo»;
  mostrar el selector en cuanto exista una credencial, aunque no esté verificada.
  Conservar el modelo escrito si el test falla y permitir reintentar sin volver
  a introducir la clave ya guardada.
- `llm_settings_service.py`: el test verificará la configuración almacenada por
  el PATCH previo, según el protocolo de 3.3; no elegirá silenciosamente otro
  modelo. `default_model` será una sugerencia inicial del formulario.
- `providers_catalog.py`: conservar entrada personalizada; comprobar IDs y
  condiciones de acceso antes de actualizar sugerencias. No sustituir un ID por
  otro supuesto ni equiparar «listado» con «autorizado».

**Aceptación:** con idéntica clave, un fallo del modelo A no impide configurar y
verificar B; nunca se activa B basándose en el test de A.

#### IA-02 — Activación sin haber probado la configuración

**Dónde:** `backend/app/services/llm_settings_service.py:78-127`,
`update_model()` y `activate()`; `frontend/src/pages/SettingsPage.tsx:100-102`,
`Boolean(credential?.model)`; `backend/app/models/llm_credential.py`, entidad
sin columnas de verificación.

**Causa:** escribir un nombre de modelo equivale a declarar verificada la
credencial. El servidor confía en el orden de operaciones del navegador.

**Reproducción prevista:** con una clave ficticia, ejecutar PUT → PATCH de modelo
→ POST activate, omitiendo POST test. El código permite la activación sin ninguna
llamada externa. `test_activate_fails_until_a_model_has_been_set` de
`backend/tests/test_llm_settings.py` documenta actualmente este comportamiento
incorrecto, y varios tests de fábrica lo utilizan como preparación.

**Cambios:**

- Añadir versión y evidencia de verificación a `LLMCredential`, según 3.3.
- `update_model()`: guardar borrador, invalidar evidencia y desactivar cuando
  cambie realmente modelo o URL; guardar metadatos nunca verificará una conexión.
- `test_credential()`: registrar éxito solo para la revisión probada, mediante
  escritura condicional que descarte resultados de pruebas obsoletas.
- `activate()`: exigir evidencia correspondiente a la configuración efectiva.
- `LLMCredentialResponse` y tipos TS: devolver `is_verified` explícito;
  `SettingsPage.tsx` dejará de inferirlo a partir del modelo.
- Sustituir el test citado por uno que exija una prueba simulada satisfactoria;
  actualizar los fixtures de `test_llm_factory.py` para no perpetuar el bypass.

**Aceptación:** PATCH → activate sin test devuelve 409 `LLM_NOT_VERIFIED`;
una prueba iniciada antes de reemplazar la clave no verifica la nueva clave.

#### IA-03 — Modelo probado contra la URL anterior

**Dónde:** `frontend/src/pages/SettingsPage.tsx:179-191`, `handleSaveModel()`;
`frontend/src/api/endpoints.ts`, `testLlmCredential()`;
`backend/app/schemas/llm_settings.py:31-34`, `LLMConnectionTest` solo admite
modelo; `backend/app/llm/factory.py:68-74`, URL tomada de la credencial guardada.

**Causa:** el formulario contiene URL B, pero POST test utiliza URL A. Después
PATCH guarda B y mantiene potencialmente `is_active=True`.

**Reproducción prevista:** guardar A y editar a B; simular A=200 y B=403. Hoy el
formulario anuncia «Modelo guardado y verificado» tras contactar solo A.

**Cambios:** usar PATCH de borrador → test de esa revisión → activación. El
test no recibirá una URL independiente de lo persistido. Validar la URL en
guardado y justo antes de uso mediante `assert_safe_outbound_url()`, conservando
`follow_redirects=False`. En PATCH, URL omitida conserva la anterior; `""`
significa explícitamente volver a la URL predeterminada. Actualizar DTO y servicio
para no confundir omisión con cadena vacía.

**Aceptación:** se contacta B, el fallo deja B sin verificar y sin activar, y
modificar solo el modelo no borra accidentalmente una URL personalizada.

#### IA-04 — Pérdida de semántica y propagación del cuerpo externo

**Dónde:** `backend/app/llm/openai_compatible_provider.py:135-152` y 185-191;
`backend/app/llm/anthropic_provider.py`, excepciones de `complete()`;
`backend/app/core/exceptions.py`, `LLMError` sin atributos;
`backend/main.py:81-83`, handler que devuelve 502 con `str(exc)`;
`backend/app/services/plan_service.py:120-125`, persistencia del texto de error;
`SettingsPage.tsx:148-149` y restantes bloques `catch`.

**Causa:** no hay distinción estable entre clave rechazada, permisos, saldo o
modelo. Además, truncar `response.text` o `repr(data)` no sanea posibles secretos
o fragmentos del prompt devueltos por un proxy/proveedor.

**Cambios:**

- `core/exceptions.py`: convertir `LLMError` en un error con código estable,
  mensaje público seguro, estado upstream, proveedor y atributo `retryable`.
- Crear `backend/app/llm/error_mapping.py`: interpretar códigos conocidos por
  proveedor; aplicar una clasificación conservadora cuando el formato sea
  desconocido. Compartir el resultado entre decisión de reintentar y respuesta
  pública. No interpretar arbitrariamente cualquier 403 como clave válida.
- Adaptadores: eliminar cuerpos crudos de mensajes y registros; normalizar
  errores HTTP, red, JSON inválido y estructura inesperada. Loguear solo una
  lista permitida de metadatos, sin encabezados de autorización ni prompts.
- `main.py`: exponer el contrato de 3.4. Mantener `detail` como string para que
  las pantallas existentes no intenten renderizar un objeto.
- Crear `frontend/src/api/errors.ts`: extraer un mensaje seguro de errores
  tipados, fallos de red y arrays de validación 422; utilizarlo en configuración.
- `plan_service.py`: persistir únicamente el mensaje saneado; sus bloques de
  logging tampoco deben recuperar el cuerpo externo mediante la causa encadenada.

**Aceptación:** 401, 403, cuota, 404 y timeout muestran explicaciones diferentes;
un cuerpo externo que refleje una clave ficticia no aparece en API, DB ni logs.

#### IA-05 — Parámetro de tokens incompatible con o-series

**Dónde:** `backend/app/llm/openai_compatible_provider.py:80-87`, payload siempre
con `max_tokens`; `backend/app/llm/providers_catalog.py:65`, sugerencia de
`o4-mini`; `backend/app/llm/factory.py:75-81`, construcción sin perfil de modelo.

**Causa:** compartir el formato de Chat Completions no significa compartir todos
los parámetros. La referencia oficial de OpenAI indica que `max_tokens` no es
compatible con los modelos o-series más recientes y que `max_completion_tokens`
incluye salida visible y razonamiento.

**Cambios:**

- Crear `backend/app/llm/request_profiles.py` con un perfil pequeño e inmutable
  por proveedor/modelo: nombre del parámetro de límite, presupuesto de prueba y
  opciones de razonamiento admitidas. Resolverlo en la fábrica.
- `OpenAICompatibleProvider`: construir el payload a partir del perfil; para
  OpenAI o-series usar `max_completion_tokens` y no enviar simultáneamente
  `max_tokens`. Mantener el argumento interno `complete(max_tokens=...)` para
  que los orquestadores no dependan del formato externo.
- No propagar esta sustitución a NVIDIA, GLM, OpenRouter u Ollama sin comprobar
  su contrato. No enviar `reasoning_effort="none"` a todos los modelos.
- Para IDs personalizados sin perfil confirmado, usar el perfil base del
  proveedor; si rechaza parámetros, devolver `LLM_UNSUPPORTED_REQUEST` en lugar
  de adivinar variantes o marcar la clave como inválida.

**Aceptación:** inspeccionar en tests el JSON saliente para `OPENAI/o4-mini` y
para NVIDIA/Ollama; cada uno recibe solo los parámetros de su perfil.

#### IA-06 — Prueba demasiado corta y respuestas mal interpretadas

**Dónde:** `openai_compatible_provider.py:50`, 171-192;
`anthropic_provider.py:99-101`; `factory.py:65` demuestra que ya existe una
excepción para Ollama con 32 tokens.

**Causa:** se exige texto no vacío con 5 tokens, sin inspeccionar
`finish_reason`, rechazo, uso de tokens o tipos. HTTP 200 con `content=null` y
`finish_reason="length"` no demuestra un error de credencial. Un contenido no
string puede causar `AttributeError`, y un JSON inválido puede escapar como 500.

**Cambios:** usar presupuestos explícitos del perfil de IA-05; propuesta inicial
de 32 tokens para chat convencional y 256 para el perfil OpenAI o-series,
sujetos a verificación de compatibilidad, manteniendo Ollama en 32. Si 256 no
alcanza, informar presupuesto insuficiente; no aumentar indefinidamente.

Separar lectura de respuesta y validación de prueba: exigir contenido textual
útil, clasificar `length` como `LLM_OUTPUT_LIMIT`, rechazo como `LLM_REFUSED` y
estructura/JSON inválidos como `LLM_INVALID_RESPONSE`. No tratar texto de
razonamiento como respuesta final ni aceptar cualquier HTTP 200 como éxito.
Durante generación, no entregar JSON truncado al parser como contenido completo.

**Aceptación:** fixtures 200 con texto, texto vacío, null, lista, JSON inválido,
`finish_reason=length` y rechazo tienen resultados controlados; ninguno se
transforma en «clave inválida» por carecer de texto.

#### IA-07 — Reintentos de cuota agotada y espera de prueba excesiva

**Dónde:** `openai_compatible_provider.py:102-118`, reintentos por cualquier 429;
líneas 155-169, lectura exclusivamente numérica y recorte de `Retry-After`.

**Causa:** no se distingue cuota agotada de throttling. Sin `Retry-After`, seis
reintentos esperan 10+20+30+40+50+60 = **210 segundos solo de pausas**, además
de las solicitudes. Recortar `Retry-After: 120` a 65 segundos permite reintentar
antes del tiempo indicado. También falta un presupuesto total para la operación.

**Cambios:**

- Clasificar antes de reintentar; cuota/saldo agotados no se reintentan.
- Admitir `Retry-After` numérico o fecha HTTP válida. Si supera el presupuesto
  restante, devolver límite temporal con espera sugerida; no adelantar el retry.
- Separar política de test y generación en `core/config.py` y fábrica. Propuesta
  inicial para pruebas externas: timeout de conexión de 5 s, lectura de 30 s,
  máximo un reintento transitorio y presupuesto total de 45 s. Limitar cada
  intento por el tiempo restante usando reloj monotónico; no basta con limitar
  `sleep()` ni con un timeout de lectura aislado.
- Conservar los valores de generación existentes, añadiendo su presupuesto total
  explícito y validado: propuesta inicial de 600 s para intentos/reintentos de
  cada llamada externa, configurable, no para el plan entero. Ollama mantiene
  sus parámetros locales y cero retries 429.
- Documentar los ajustes en `backend/.env.example` y README; ningún valor nuevo
  se considerará una promesa de tiempo de respuesta del proveedor.

**Aceptación:** cuota agotada genera una sola solicitud; un 429 temporal puede
recuperarse; `Retry-After` largo no provoca un retry anticipado. Tests con reloj y
sleep simulados, sin esperar minutos.

#### IA-08 — «Modo demo» no corresponde a la selección real

**Dónde:** `SettingsPage.tsx:24`, 45-57; `llm_settings_service.py:129-137`,
`deactivate_all()`; `factory.py:84-117`, cadena credencial → `.env` → mock.

**Causa:** la UI deduce demo exclusivamente de `is_active`. Desactivar credenciales
no borra la clave del servidor. La fábrica también puede degradar a otra fuente
si falla la construcción de una credencial activa.

**Implementación entregada para conservar la cadena existente:**

- Añadir `GET /llm-settings/runtime`, servido por la misma lógica de resolución
  usada al construir el proveedor. Responder `source` (`USER`, `ENV`, `MOCK`),
  proveedor, modelos por tipo de llamada y un motivo saneado de fallback cuando
  exista. Es estado de selección, no una prueba de conectividad.
- Extraer en `factory.py` la resolución compartida en vez de duplicar condiciones
  en el controlador. No descifrar claves para enviarlas al navegador.
- Cambiar el botón a «Usar configuración del servidor». Mostrar «Modo demo» solo
  si la fuente efectiva es `MOCK`; si existe `.env`, mostrar Anthropic del servidor.
- Añadir tipo, endpoint y hook de runtime; invalidarlo al guardar, verificar,
  activar, desactivar o eliminar credenciales. Si la consulta falla, mostrar
  estado desconocido/error, no asumir demo.

Un selector de «forzar demo» persistente sería otra funcionalidad; esta corrección
resuelve la información falsa conservando la precedencia actual. La fuente se
vuelve a resolver al generar un plan; la pantalla no garantiza futuras respuestas
ni presupuesto disponible.

**Aceptación:** sin credenciales activas y con clave `.env`, UI y fábrica muestran
Anthropic; sin ambas, muestran mock. Un fallo de construcción expone el motivo
de fallback sin exponer su excepción cruda.

#### IA-09 — Uso del modelo de planificación para contenido/cuestionario

**Dónde:** `anthropic_provider.py:21` y 56-61, `_QUIZ_KINDS` y `_model_for()`;
`backend/app/services/plan_service.py:266-267`, `kind="session_content"`.

**Causa:** se fusionaron las llamadas de contenido y quiz, pero el selector de
modelo conserva los nombres anteriores. Los tests de Anthropic siguen comprobando
`quiz` y `content` y no cubren `session_content`.

**Cambios:** añadir `session_content` a los tipos que usan `LLM_MODEL_QUIZ`;
mantener `topic_analysis` y `session_plan` en `LLM_MODEL_PLAN`. Conservar el modelo
fijo para todos los tipos si el usuario configura una credencial propia.
Actualizar docstring de `llm/base.py`, tests y explicación de costes del README.

**Aceptación:** con ajustes ficticios diferentes `plan-model` y `quiz-model`,
comprobar el modelo saliente de cada kind; el proveedor BYO-key siempre utiliza
su modelo fijo. No dividir la llamada fusionada ni alterar `2 + N` llamadas.

#### IA-10 — Anthropic ignora la URL personalizada

**Dónde:** `factory.py:46-51` retorna `AnthropicProvider` antes del bloque de URL
de líneas 68-73; `AnthropicProvider.__init__()` no recibe `base_url`;
`SettingsPage.tsx:312-329` ofrece el campo a todo proveedor distinto de Ollama.

**Causa:** el guardado acepta el override, pero el cliente nativo no lo recibe.
Una clave de un gateway puede probarse contra Anthropic directo y fallar por
autenticación, aunque la configuración mostrada indique otra URL.

**Solución elegida para esta corrección:** rechazar overrides de Anthropic,
porque el soporte de gateways nativos no está implementado. Añadir
`supports_custom_base_url` a `ProviderMeta`, catálogo y tipos TS: `false` para
Anthropic/Ollama y `true` para los adaptadores OpenAI-compatible actuales.
Ocultar el campo cuando sea falso; el servicio debe rechazarlo también en PUT y
PATCH. La fábrica debe detectar valores históricos no vacíos antes del retorno
de Anthropic y producir `LLM_UNSUPPORTED_CONFIGURATION`, nunca ignorarlos.

Conservar el valor histórico para permitir al usuario identificarlo y borrarlo
explícitamente. No enviar su clave a un endpoint distinto en silencio.

**Aceptación:** el override se rechaza en escritura; una fila histórica no lo
ignora al probar; al limpiar explícitamente la URL puede verificarse Anthropic
nativo. Añadir soporte nativo de gateways requeriría un cambio separado.

### 3.3. Protocolo único de configuración y evidencia persistida

**Decisión de diseño propuesta:** conservar guardar clave y verificar como fases
separadas, pero sustituir «modelo no vacío = verificado» por evidencia del servidor.
El orden nuevo será **PUT clave → PATCH borrador → POST test → POST activate**.
Esto cambia intencionadamente la semántica actual de PATCH; actualizar frontend,
tests, contrato y notas del repositorio en la misma entrega.

#### Persistencia y concurrencia

En `backend/app/models/llm_credential.py` añadir:

| Campo | Uso |
| --- | --- |
| `config_revision: int` | Versión creciente; comienza en 1. Aumenta en reemplazo de clave y cambios reales de modelo/URL. |
| `verified_revision: int | null` | Revisión probada satisfactoriamente; null si no hay evidencia vigente. |
| `verified_at: datetime | null` | Momento del último éxito vigente, en UTC. |
| `verified_fingerprint: str | null` | Hash interno de proveedor, revisión, modelo, URL efectiva y versión del perfil de solicitud. No incluye la clave en claro. |

La huella contempla la URL efectiva, no solo `base_url`, para detectar cambios de
defaults o de `OLLAMA_BASE_URL` entre prueba y uso. No reemplaza la validación DNS
en cada uso. Es interna y no debe exponerse en DTOs.

- Crear helper de configuración/huella en `backend/app/llm/credential_state.py`;
  utilizar la misma normalización en servicio y fábrica, preservando paths como
  `/v1` y `/api/paas/v4`.
- `is_verified` será derivado de modelo presente, timestamp, igualdad de
  revisiones y coincidencia de huella. No añadir otro booleano persistido que
  pueda quedar desincronizado.
- Guardar cambios e invalidar evidencia/desactivar en una sola transacción.
  PATCH idéntico será un no-op; reemplazar la clave siempre requiere reverificar.
- POST test toma un snapshot de ID, revisión y configuración; cierra la
  transacción de lectura antes de esperar la red. Al terminar, usa actualización
  condicional por ID y revisión en `LLMCredentialRepository`. Si ya cambió o fue
  eliminada, devolver 409 `LLM_CONFIGURATION_CHANGED`, sin recrear ni verificar
  otra fila. No mantener un bloqueo SQLite durante la petición externa.
- Activar debe comprobar revisión/huella y modificar las credenciales activas en
  una transacción que impida una actualización concurrente entre comprobar y
  activar. El repositorio expone operaciones condicionales; no usar una lectura
  seguida de un `save()` incondicional. Serializar también activaciones del mismo
  usuario para que dos pestañas no dejen dos proveedores activos.
- Un fallo inicial nunca crea evidencia. Al reintentar una configuración ya
  verificada, un timeout/429 no convierte su evidencia histórica en éxito nuevo
  ni la declara clave inválida. Un rechazo definitivo de autenticación revoca la
  evidencia de esa revisión y la desactiva mediante actualización condicional.
  La UI debe mostrar el fallo de la última prueba aunque conserve un éxito previo.
- Cerrar clientes HTTP/SDK en `finally` después de la prueba; definir un método
  `close()` con implementación no-op por defecto y un contrato de comprobación
  explícito en `llm/base.py` para eliminar el `type: ignore[attr-defined]` actual.
  El generador cerrará igualmente el proveedor al finalizar.

#### Migración de instalaciones existentes

En `backend/app/db/init_db.py`, añadir `_ensure_llm_verification_columns()` con
inspección por columna y backfill aditivo. Filas antiguas: revisión 1, evidencia
null; conservar claves/modelos/URLs. No asumir que tener modelo demuestra éxito.
Las filas históricas quedan pendientes de nueva verificación y se desactivan en
la migración inicial, no en cada arranque. Ante migración parcialmente aplicada,
desactivar solo filas sin evidencia válida; no revocar indiscriminadamente filas
que ya se verificaron con el esquema nuevo. Informar que puede quedar como fuente
efectiva la configuración `.env`, conforme a IA-08.

#### Contrato HTTP implementado

| Operación | Entrada y comportamiento |
| --- | --- |
| `PUT /llm-settings/{provider}` | Guardar/reemplazar clave, mantener las reglas sin clave de Ollama. Borra modelo/evidencia y desactiva como hoy. Responde `config_revision` e `is_verified=false`. |
| `PATCH /llm-settings/{provider}/model` | `{model, base_url?, expected_revision}`. Guarda borrador; una revisión desactualizada devuelve 409. No hace llamadas externas. |
| `POST /llm-settings/{provider}/test` | `{expected_revision}`. Prueba exactamente el borrador actual y devuelve `{ok: true, credential: LLMCredentialResponse}` al persistir el éxito. |
| `POST /llm-settings/{provider}/activate` | `{expected_revision}`. Rechaza revisión obsoleta o sin prueba vigente con 409. Devuelve la credencial activada. |
| `GET /llm-settings/runtime` | Estado efectivo descrito en IA-08, sin prueba de red ni promesa de conectividad. |

Retirar el `model` opcional del test anterior y rechazar campos desconocidos en
el DTO de esa operación. No interpretar una petición del frontend viejo como
prueba de otra configuración. Actualizar los clientes junto con el backend.
`LLMCredentialResponse` añade `config_revision`, `is_verified` y `verified_at`;
no devuelve secreto cifrado ni huella interna.

#### Cambios concretos del frontend

En `SettingsPage.tsx`, los manejadores actuales se reorganizan así:

```text
Guardar clave:
  PUT → actualizar caché → limpiar input sensible → habilitar selector

Guardar y verificar modelo:
  PATCH(modelo, URL, revisión) → obtener revisión nueva
  POST test(revisión nueva) → actualizar credencial desde respuesta

Activar:
  POST activate(revisión verificada) → refrescar credenciales y runtime
```

Deshabilitar acciones incompatibles mientras una operación esté pendiente.
Mantener un borrador de formulario separado de datos remotos: sincronizarlo al
cambiar la revisión si no hay cambios locales; si los hay, informar conflicto.
Los `useState(initialModel)` actuales no se actualizan solos al cambiar las props.
Para Ollama esperar al descubrimiento de modelos sin sobrescribir la selección
del usuario, mostrar errores de descubrimiento y conservar la validación de modelo
instalado. El perfil HTTP local permanece sin Bearer, con JSON mode, sin pacing y
sin retries 429.

### 3.4. Contrato de errores y diagnóstico seguro

Para fallos externos conservar HTTP 502 como envoltorio de dependencia y añadir
campos tipados. Distinguir el estado de StudyAI de `upstream_status`; no propagar
un 401 upstream como si hubiera caducado una sesión de usuario de StudyAI.
Errores locales de configuración usan 400/422 y conflictos de revisión/verificación
usan 409.

Ejemplo de contrato; la respuesta real debe contrastarse con `/openapi.json`:

```json
{
  "detail": "NVIDIA rechazó el acceso al modelo. Revisa sus permisos y disponibilidad.",
  "code": "LLM_ACCESS_DENIED",
  "provider": "NVIDIA",
  "upstream_status": 403,
  "retryable": false,
  "retry_after_seconds": null
}
```

| Señal upstream | Código normalizado | Acción |
| --- | --- | --- |
| 401 / código inequívoco de autenticación | `LLM_AUTHENTICATION_FAILED` | Revisar/reemplazar credencial; sin retry automático. |
| 403 sin causa más específica | `LLM_ACCESS_DENIED` | Revisar permisos/modelo/endpoint; no afirmar que la clave está validada. |
| 402 o código conocido de cuota/saldo, incluso dentro de 429 | `LLM_QUOTA_EXHAUSTED` | Revisar saldo/límite; sin retry automático. |
| 404/410 con código de modelo inequívoco | `LLM_MODEL_UNAVAILABLE` | Seleccionar otro modelo. |
| 404/410 ambiguo | `LLM_ENDPOINT_OR_MODEL_UNAVAILABLE` | Revisar URL y modelo; no inventar cuál falló. |
| 400 con parámetro incompatible identificado | `LLM_UNSUPPORTED_REQUEST` | Revisar perfil de solicitud. |
| 429 temporal o sin evidencia de cuota permanente | `LLM_RATE_LIMITED` | Retry acotado; respetar tiempo sugerido. |
| Timeout / red | `LLM_TIMEOUT` / `LLM_CONNECTION_FAILED` | Retry según presupuesto; la clave no se declara inválida. |
| 5xx externo | `LLM_PROVIDER_UNAVAILABLE` | Retry transitorio acotado. |
| HTTP 200 truncado / rechazo / formato inválido | `LLM_OUTPUT_LIMIT` / `LLM_REFUSED` / `LLM_INVALID_RESPONSE` | Error de salida; no marcar verificada la conexión. |
| Otro error externo | `LLM_PROVIDER_ERROR` | Mensaje seguro genérico, sin cuerpo crudo. |

Campos de log permitidos: proveedor, identificador de modelo validado, operación,
estado upstream, código normalizado, número de intento y duración. Omitir claves,
payloads, contenido de documentos y URLs con query. El saneado debe aplicarse
también a excepciones encadenadas y logs de SDK; truncar no es sanear.

### 3.5. Inventario de archivos y responsabilidades

La tabla conserva el inventario de cambios de la revisión original. Los cambios
de credenciales, proveedores, runtime y contrato que se listan aquí ya fueron
implementados; las propuestas de PDF, suscripciones y rediseño permanecen en
las secciones posteriores.

| Archivo existente | Cambio concreto |
| --- | --- |
| `backend/app/models/llm_credential.py` | Columnas de revisión/evidencia y comentarios que ya no equiparen modelo con verificación. |
| `backend/app/db/init_db.py` | Backfill aditivo e idempotente; tratamiento explícito de filas históricas. |
| `backend/app/repositories/llm_credential_repository.py` | Escrituras condicionales de configuración, resultado de test y activación transaccional. |
| `backend/app/services/llm_settings_service.py` | Implementar nuevo ciclo de borrador/test/activación, revisiones y capacidades de URL; cerrar clientes. |
| `backend/app/schemas/llm_settings.py` | DTOs con revisiones, verificación, runtime y capacidades; URL omitida distinta de vacía. |
| `backend/app/api/v1/routes/llm_settings.py` | Recibir nuevos DTOs y delegar; añadir `/runtime`; mantener ORM fuera del controlador. |
| `backend/app/llm/base.py` | Contrato de test/cierre y kinds vigentes. |
| `backend/app/llm/factory.py` | Resolver perfil, configuración efectiva y fuente; comprobar evidencia para usar credenciales activas; detectar overrides no soportados. |
| `backend/app/llm/providers_catalog.py` | Capacidades de URL y sugerencias verificadas, conservando IDs personalizados. |
| `backend/app/llm/openai_compatible_provider.py` | Payload por perfil, parseo defensivo, errores tipados y retries acotados. |
| `backend/app/llm/anthropic_provider.py` | Error mapping del SDK, prueba/cierre y selección de `session_content`. |
| `backend/app/core/exceptions.py` | Atributos de dominio de `LLMError` y errores de conflicto. |
| `backend/main.py` | Serialización de errores seguros y conflictos 409. |
| `backend/app/core/config.py` y `backend/.env.example` | Ajustes separados de prueba/generación con rangos y presupuestos validados. |
| `backend/app/services/plan_service.py` | Mensajes/logs saneados y cierre del proveedor; preservar `2 + N`. |
| `frontend/src/api/types.ts` | Reflejar DTOs, retirar inferencia por modelo vacío y añadir errores/runtime. |
| `frontend/src/api/endpoints.ts` | Enviar revisiones; test de configuración guardada; wrapper de `/runtime`. |
| `frontend/src/hooks/queries.ts` | Mutations con DTOs nuevos; actualizar credenciales e invalidar runtime, incluido test. |
| `frontend/src/pages/SettingsPage.tsx` | Selector antes de verificar, pasos explícitos, errores accionables, borradores sincronizados y fuente efectiva. |
| `README.md` | Flujo nuevo, significado de API vs suscripción, diagnóstico por códigos y límites de prueba. |
| `docs/api_contract.yaml` | Nuevos cuerpos/respuestas y códigos 409/502; contrastar con OpenAPI generado. |
| `AGENTS.md` y `CLAUDE.md` | Sustituir la regla obsoleta de «modelo no vacío = verificado» por revisión/evidencia; conservar prioridad de fuentes y excepciones de Ollama. |

Archivos nuevos incorporados durante la implementación:

- `backend/app/llm/credential_state.py`: configuración efectiva y huella compartida.
- `backend/app/llm/request_profiles.py`: perfiles de solicitud mínimos y explícitos.
- `backend/app/llm/error_mapping.py`: clasificación upstream sin dependencias web.
- `frontend/src/api/errors.ts`: normalización segura para la UI.

`backend/app/core/url_safety.py` conserva la validación actual y se reutiliza;
estas correcciones no requieren sustituirla ni ampliar acceso a redes privadas.

### 3.6. Pruebas de regresión y orden de entrega de proveedores

| Archivo de pruebas | Casos que añadir/cambiar |
| --- | --- |
| `backend/tests/test_llm_settings.py` | Reemplazar bypass actual; PUT/PATCH sin test no activa; fallo A no impide B; revisión obsoleta; cambio URL/modelo invalida; PATCH omitido conserva URL; un 429 no equivale a autenticación inválida. |
| `backend/tests/test_llm_factory.py` | Fixtures verificadas mediante transporte simulado; URL efectiva probada; estado runtime ENV/MOCK/USER; override Anthropic rechazado; Ollama conserva perfil; fallback saneado. |
| `backend/tests/test_openai_compatible_provider.py` | Payload o-series vs convencional; 401/403/402/404/410/429; cuota sin retries; Retry-After numérico/fecha/largo; respuestas 200 mal formadas/truncadas; límite total y cierre. |
| `backend/tests/test_anthropic_provider.py` | Añadir `session_content` al reparto; modelo fijo; errores SDK clasificados y ausencia de texto sensible. |
| `backend/tests/test_plan_generation_pipeline.py` | `2 + N` llamadas; contenido truncado no se trata como válido; errores almacenados/logueados saneados; cliente cerrado al completar o fallar. |
| `backend/tests/test_llm_verification_migration.py` — nuevo | DB antigua, parcialmente migrada y nueva; conserva secretos/modelos; backfill idempotente y verificación pendiente. |
| `backend/tests/test_llm_verification_concurrency.py` — nuevo | Test en vuelo vs reemplazo/eliminación; dos activaciones concurrentes; escritura condicional sobre SQLite temporal real con sesiones separadas. |
| `backend/tests/test_url_safety.py` y `test_ollama_client.py` | Mantener todas las regresiones actuales al cambiar fábrica y servicio. |

Frontend: `frontend/src/__tests__/SettingsPage.test.tsx` ya cubre con Vitest, Testing
Library y transporte simulado la selección inicial, recuperación de modelo fallido
sin repetir clave,
PATCH→test con revisión correcta, conflicto entre pestañas, activación bloqueada,
error 422 renderizable, estado runtime y selección Ollama tras descubrimiento.
Estas pruebas son de comportamiento observable, no de detalles internos del hook.

Orden específico:

1. Capturar fixtures saneadas y añadir reproducciones que fallen con el código
   actual; ninguna prueba automática usa claves reales ni red del proveedor.
2. Implementar IA-04 a IA-07 y IA-09 con regresiones de adaptadores: mejora el
   diagnóstico antes de cambiar el flujo de configuración.
3. Entregar conjuntamente persistencia/migración/DTOs/servicio/UI de IA-01,
   IA-02, IA-03 e IA-10, con contrato actualizado. El frontend antiguo deja de
   ser compatible con los cuerpos nuevos de test/activación.
4. Entregar runtime y mensajes de IA-08 sobre el mismo resolver.
5. Ejecutar suite backend aislada, tests frontend, typecheck/build y recorrido
   en navegador; después comprobar manualmente NVIDIA y una API de pago cuando
   el usuario tenga configuradas sus credenciales. No publicar claves en comandos.
6. La integración de suscripciones de 3.8 se implementa después, en un adaptador
   separado, y no sustituye la corrección de autenticación API.

### 3.7. Diagnóstico live específico para NVIDIA

El adaptador y el contrato de NVIDIA ya están aislados y cubiertos con transporte
simulado. La causa de un rechazo upstream con una cuenta real todavía requiere la
siguiente evidencia reproducible:

1. Registrar si falla guardar, probar o generar; modelo exacto y uso de URL
   predeterminada o personalizada, sin copiar la clave.
2. Comprobar que el request usa la URL esperada
   `https://integrate.api.nvidia.com/v1/chat/completions`, el modelo elegido y
   Bearer. Verificar estos detalles con transporte simulado en tests; no escribir
   el header real en logs. No eliminar `/v1` basándose en intuiciones sobre cómo
   un cliente HTTP combina paths.
3. Obtener estado/código del proveedor con el saneado de IA-04:
   - 401: autenticación rechazada; revisar tipo de clave y endpoint.
   - 403: acceso rechazado; comprobar permisos/cuenta/modelo. Los reportes de
     «Public API Endpoints» son una hipótesis, no una solución confirmada.
   - 404/410: contrastar modelo y ruta con catálogo/documentación vigentes.
   - 429: identificar cuota vs límite temporal antes de esperar.
   - 200 sin texto: inspeccionar señales estructurales de IA-06.
4. Repetir, desde el mismo backend, un request mínimo oficial con el mismo
   endpoint/modelo/clave mediante un diagnóstico local que no registre secretos.
   Si falla igual, investigar cuenta/proveedor; si solo falla StudyAI, comparar
   payload y perfil. Una respuesta 200 de listado de modelos no demuestra que
   la cuenta pueda ejecutar inferencia.
5. Guardar una fixture saneada del fallo y probar la corrección contra ella;
   finalmente verificar generación real de un plan corto. La comprobación de
   conectividad por sí sola no valida la generación completa ni su cuota.

No marcar este incidente como resuelto únicamente por cambiar el texto de error
o actualizar un modelo del catálogo.

### 3.8. Suscripciones

#### ChatGPT Plus/Pro

Crear un adaptador independiente mediante Local Codex, usando su autenticación
oficial y gestión de sesión.

- El backend se comunicará con el proceso local.
- StudyAI mostrará conexión, modelo y errores de límites de uso.
- La generación utilizará respuestas estructuradas y herramientas deshabilitadas
  para limitarse al material de estudio.
- Se comprobará la compatibilidad con la versión instalada antes de implementar
  la integración.

#### Claude Pro/Max

La integración de suscripción queda pendiente. La documentación de Anthropic
exige aprobación previa para ofrecer el login y los límites de claude.ai desde
aplicaciones de terceros. Claude por API se incluye en las correcciones de
proveedores descritas arriba.

## 4. Reducción privada de tokens al procesar PDF

### 4.1. Situación actual

StudyAI ya extrae texto del PDF y recupera fragmentos; no envía el PDF completo al
modelo. Convertir a Markdown, por sí solo, no garantiza ahorro y puede añadir
tokens.

La propuesta combina conversión estructurada, limpieza conservadora y selección
de contexto:

```text
PDF
 ↓
Conversión local a Markdown por páginas/secciones
 ↓
Limpieza de ruido repetido
 ↓
Fragmentación conservando títulos y referencias de página
 ↓
Indexación
 ↓
Recuperación + eliminación de solapamientos
 ↓
Selección bajo presupuesto de tokens
 ↓
Proveedor elegido
```

### 4.2. Implementación propuesta

- Usar PyMuPDF4LLM como conversor opcional, manteniendo la extracción actual como
  alternativa.
- Conservar tablas, listas, títulos y contenido técnico.
- Eliminar encabezados y pies repetitivos cuando se puedan identificar con
  suficiente confianza.
- Normalizar espacios y saltos de línea sin borrar información sustantiva.
- Evitar enviar varias veces el mismo texto por solapamiento entre fragmentos.
- Aplicar un presupuesto por etapa, reservando espacio para instrucciones y
  respuesta.
- Usar tokenización del modelo cuando esté disponible e identificar las
  aproximaciones como estimaciones.
- Mantener **2 + N llamadas** para la generación del plan: análisis de temas,
  distribución de sesiones y una llamada fusionada de contenido/cuestionario por
  sesión.

### 4.3. Privacidad

- Almacenar Markdown y metadatos internamente, fuera de archivos públicos.
- No crear endpoints de descarga ni controles de conversión en el frontend.
- No incluir contenido documental en mensajes de error ni logs.
- Eliminar los derivados junto con el documento.
- Enviar al proveedor elegido únicamente los fragmentos seleccionados, conforme
  al alcance acordado.

### 4.4. Medición del ahorro

Comparar contra los prompts actuales, no contra el tamaño del PDF. Medir tokens,
cobertura y preservación de tablas y definiciones con documentos representativos.
No fijar un porcentaje de ahorro antes de realizar esa medición.

Archivos principales afectados:

- `backend/app/processors/pdf_processor.py`
- `backend/app/processors/pipeline.py`
- `backend/app/rag/chunker.py`
- `backend/app/rag/retriever.py`
- `backend/app/rag/vector_store.py`
- `backend/app/services/document_service.py`
- `backend/app/services/plan_service.py`

## 5. Nuevo frontend: claro, minimalista y guiado

### 5.1. Problemas de uso encontrados

- La navegación lateral desaparece en móvil y no tiene sustituto.
- Varias pantallas muestran un spinner indefinido cuando falla una consulta.
- Crear metas, generar planes y enviar cuestionarios carecen de mensajes de error
  adecuados.
- La generación muestra un 60 % fijo, sin relación con el progreso real.
- El resultado del cuestionario se guarda y enseguida se desmonta su componente.
- Al cambiar entre flashcards, el estado de «respuesta visible» puede conservarse.
- La interfaz utiliza términos como RAG, indexado y SM-2 en acciones que pueden
  explicarse de forma más sencilla.

### 5.2. Diseño propuesto

| Pantalla | Cambio principal |
| --- | --- |
| Inicio | «Qué estudiar hoy», siguiente sesión pendiente y acción principal «Continuar estudiando». |
| Biblioteca | Subida accesible, estados «Procesando / Disponible / Necesita atención» y errores recuperables. |
| Crear plan | Recorrido guiado: documentos → objetivo → confirmar y generar. |
| Mis planes | Progreso por sesiones, siguiente acción y estados de generación comprensibles. |
| Sesión | Lectura cómoda, temporizador secundario, tarjetas accesibles y resultado visible antes de salir. |
| Conexiones de IA | Opciones diferenciadas para suscripción compatible, API y Ollama local; conexión activa destacada. |
| Progreso | Historial comprensible y datos coherentes con las sesiones realizadas. |

Estilo visual:

- Fondo claro cálido y acentos azul/índigo.
- Iconos consistentes y tipografía legible.
- Formularios con etiquetas y foco visible.
- Navegación lateral en escritorio y alternativa móvil accesible.
- Conservar React, Vite, Tailwind y TanStack Query, reorganizando componentes y
  flujos sobre la estructura existente.

Archivos principales afectados:

- `frontend/src/App.tsx`
- `frontend/src/components/AppShell.tsx`
- `frontend/src/components/ui.tsx`
- `frontend/src/index.css`
- `frontend/src/pages/`
- `frontend/src/hooks/queries.ts`
- `frontend/src/api/`

## 6. Correcciones adicionales del recorrido completo

| Área | Defecto identificado | Resultado esperado |
| --- | --- | --- |
| Cuestionarios | El backend acepta respuestas incompletas y duplicadas y calcula la nota sobre las respuestas recibidas. | Validación de integridad de la entrega y cálculo coherente de la nota. |
| Finalización | Reenviar un cuestionario o completar repetidamente una sesión puede duplicar resultados y avanzar los repasos. | Evitar duplicados accidentales y definir explícitamente el comportamiento de nuevos intentos o repasos. |
| Documentos del plan | No se valida suficientemente la selección; una lista vacía acaba significando «buscar en todos los documentos». | Selección explícita y validación de existencia, pertenencia y estado de los documentos. |
| Prompt de contenido | El ejemplo JSON de `backend/app/llm/prompts/session_content.py` contiene llaves dobles literales. | Ejemplo JSON válido que no induzca respuestas mal formadas. |
| Contenido generado | Faltan validaciones estrictas para impedir planes vacíos, preguntas incompletas u opciones incompatibles con la respuesta. | Validar la salida antes de persistir contenido como listo. |
| Persistencia vectorial alternativa | Varias instancias pueden sobrescribir el archivo JSON con estados distintos durante cargas concurrentes. | Persistencia consistente ante operaciones concurrentes. |

Estas correcciones deben tener casos de regresión específicos y no quedar ocultas
dentro del cambio visual.

## 7. Orden de ejecución original

El orden siguiente documenta cómo se abordó el diagnóstico; no es una lista de
tareas pendiente. La corrección de proveedores ya se entregó y las áreas abiertas
se enumeran en `docs/AGENTS_STATUS.md`.

1. **Establecer la línea base.** Ejecutar pruebas aisladas y reproducir el fallo de
   NVIDIA con diagnóstico saneado.
2. **Corregir proveedores.** Implementar verificación revisionada, clasificación de
   errores, selección de modelos y regresiones de Ollama. **Completado.**
3. **Integrar Local Codex.** Conexión oficial, generación estructurada y manejo de
   desconexión y límites.
4. **Implementar el procesamiento privado del PDF.** Conversión, presupuesto y
   medición del ahorro.
5. **Rediseñar el frontend y corregir el recorrido completo.** Navegación,
   formularios, sesiones y progreso.
6. **Validación final y documentación.** Backend, TypeScript/build, pruebas de
   interfaz y contrato API. **Completado para el MVP; la validación live y visual
   amplia siguen pendientes.**

Durante la implementación, mantener las capas routes/controllers → services →
repositories → modelos y esquemas. Los cambios en tablas existentes requieren
backfill aditivo en `backend/app/db/init_db.py`, porque `create_all()` no modifica
tablas ya creadas.

## 8. Verificación y criterios de aceptación

### Verificación ejecutada y pendientes

- Ejecutar la suite del backend en un entorno aislado, sin reutilizar base de
  datos, uploads, vectores o credenciales reales.
- [x] Añadir casos de regresión para los defectos identificados, incluyendo errores
  de permisos, cuota, modelo y configuración no verificada.
- [x] Comprobar que Ollama y el modo demo conservan su funcionamiento.
- [ ] Comprobar conexión y generación con cuentas reales de cada proveedor.
- [ ] Medir tokens y calidad del contexto antes y después de la optimización.
- Verificar que los derivados Markdown no se exponen por la API o como archivos
  públicos y que se eliminan con su documento.
- [x] Ejecutar `npm test`, `npm run lint` y `npm run build` desde `frontend/`.
- [ ] Verificar navegación, accesibilidad básica, estados de error y recorrido de
  estudio completo en móvil y escritorio.
- [x] Sincronizar `README.md`, instrucciones de agentes y `docs/api_contract.yaml`
  con el resultado implementado.

### Criterios de aceptación

- Una clave válida no se clasifica como inválida por un problema de modelo,
  permisos o cuota.
- La activación corresponde a una configuración realmente verificada.
- La interfaz muestra el proveedor efectivamente utilizado.
- Ollama conserva su funcionamiento local sin clave.
- ChatGPT Plus/Pro utiliza la conexión oficial de Local Codex. **Pendiente.**
- Claude por API funciona; Pro/Max permanece pendiente de autorización oficial.
- El Markdown convertido permanece interno.
- El ahorro de tokens se demuestra mediante medición contra los prompts actuales,
  con comprobaciones de preservación de contenido.
- Se conserva la generación de planes en `2 + N` llamadas.
- El usuario puede completar el recorrido de estudio sin bloqueos, resultados
  perdidos ni duplicación accidental de progreso.

## 9. Fuentes consultadas

- [Autenticación oficial de Local Codex](https://github.com/openai/codex/blob/main/sdk/python/docs/getting-started.md).
- [Claude Agent SDK: condiciones de autenticación](https://code.claude.com/docs/en/agent-sdk/overview).
- [OpenAI Chat Completions: parámetros de límite y razonamiento](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).
- [PyMuPDF4LLM](https://github.com/pymupdf/pymupdf4llm).
- [Reporte comparable de permisos NVIDIA](https://forums.developer.nvidia.com/t/403-forbidden-authorization-failed-on-integrate-api-nvidia-com-v1-newly-generated-nvapi-key-works-on-nvcf-but-not-on-chat-completions-endpoint/373402).

## 10. Próximos pasos recomendados

Priorizar la verificación live con credenciales proporcionadas por el usuario y,
después, decidir si la optimización de PDF/tokens y el rediseño visual justifican
su coste frente al MVP actual. Las integraciones de suscripción deben mantenerse
aisladas de la ruta de API-key.
