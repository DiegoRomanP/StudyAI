# Historial de producto y backend

> Resumen de los planes de trabajo que ya se ejecutaron (septiembre–octubre 2026). Sustituye a
> `plans/ResolveProblems.md`, `GeneracionContenido_Reanudar.md`, `ModoEnfoque_RutaAdaptativa.md`,
> `OnboardingUX.md`, `Planteamiento_Modelo_Aprendizaje.md` y `AnalisisVersionPago.md`. El comportamiento
> vigente vive en `CLAUDE.md`, `README.md` y el código; aquí solo queda el porqué de cada decisión.
> Los textos completos originales siguen en git (lo de `docs/`) o en el respaldo local
> `~/studyai-docs-backup-2026-10-20.tgz` (lo de `plans/`, que no estaba versionado).

## 1. Revisión y resolución de problemas (2026-09-11 → 09-13)

**Problema.** Fallos de conexión con proveedores de IA (claves válidas clasificadas como inválidas, 403 de
NVIDIA, activación sin verificación real) y varios defectos del recorrido (quizzes con respuestas
incompletas o duplicadas, `document_ids` sin validar, JSON de ejemplo con llaves dobles en el prompt de
contenido, persistencia JSON del vector store sin concurrencia).

**Resultado.** Ciclo de credenciales con revisión y evidencia (`PUT clave → PATCH modelo → POST test →
POST activate`), perfiles de solicitud por proveedor, mapeo de errores seguro, adaptadores dedicados para
OpenRouter y NVIDIA NIM (catálogo curado, endpoint fijo, sin repetir POST tras `202`), y regresiones para los
defectos del recorrido. Descrito hoy en `CLAUDE.md` («LLM provider settings»).

## 2. Modo Enfoque + ruta adaptativa (2026-10-19)

**Pedido del usuario.** La sesión debe ser un flujo de enfoque (Empezar → estudio con cronómetro 25→0 →
«Terminé» → descanso → test → resultado) y cada examen debe ajustar la ruta de forma heurística.

**Decisiones que siguen vigentes**
- Cada examen evalúa solo el tema de su sesión. Los reintentos (`?fase=test` sobre una sesión completada)
  guardan un `QuizResult` pero **no** mueven la ruta (si no, un tema se «domina» en minutos).
- El repaso abre con «Puntos a reforzar» y ofrece «Refuerza con IA»: 1 uso de la cuota gratuita solo si el
  proveedor es el incluido, reembolsado si falla.
- El orden de la ruta se calcula **al leer** (`routeOrder`, frontend); el backend no reescribe `order_index`.
- Menú oculto durante toda la sesión mediante `AppShell chrome="focus"` (no un layout aparte: perdería foco y título).
- La preferencia «Siempre con IA» va en `localStorage` con try/catch, sin columna en `users`.
- YouTube pasa a la pantalla de resultado como chips de búsqueda.
- Sin LLM en la ruta: examen = 0 llamadas; un refuerzo = exactamente 1.

**Riesgos aceptados.** «Hoy» es UTC en backend y local en navegador (±1 día cerca de medianoche); un
reinicio a mitad de un refuerzo lo deja FAILED sin reembolso; salir con × pierde el cronómetro.

**Implementado en** commits `eef5fb9` … `5362d50` (backend: dominio y repasos, SM-2 por tarjeta con copias,
refuerzo con máquina de estados; frontend: ruta ordenada, pantalla de resultado, tarjeta de refuerzo).

## 3. Generación de contenido que no se detiene (2026-10-19)

**Síntoma.** El plan «se para en un punto» con Ollama, con la IA gratuita y con clave propia.

**Causas raíz** (verificadas en la base de datos): (C1) presupuestos de salida demasiado justos, agravados
porque los modelos que razonan gastan `max_tokens` pensando → `LLM_OUTPUT_LIMIT`; (C2) un fallo tumbaba el
plan entero; (C3) una única transacción SQLite larga y un `except` sin `rollback()` dejaban planes en
PROCESSING para siempre; (C4) un reinicio mataba la `BackgroundTask` sin recuperación; (C5) sin progreso real
en la UI; (C6) Ollama sin `OLLAMA_CONTEXT_LENGTH` truncaba el prompt (4096 por defecto).

**Decisiones**
- Fallo a mitad → **reanudar** (`POST /plans/{id}/resume`), generando solo lo que falta; en la UI el plan
  FAILED se llama «Incompleto». `PlanStatus` no cambia.
- Razonamiento apagado/mínimo en generación (tabla en `CLAUDE.md`). Se cambia la identidad de un perfil
  solo si el campo nuevo puede romper una configuración ya verificada.
- Presupuestos por llamada (`OUTPUT_BUDGETS`) con un único reintento al doble ante `LLM_OUTPUT_LIMIT`.
  Éxito = `2 + N` llamadas; peor caso `3 + 2N`.
- Commit tras cada paso, `progress_stage/done/total`, recuperación al arrancar (`recover_interrupted_*`).
  Supone **un solo proceso**.
- Reanudar con la IA gratuita gasta 1 uso; el reembolso es exactamente una vez, en el día UTC original
  (`Plan.free_ai_use_date`).
- SQLite en WAL con `busy_timeout` de 30 s; `foreign_keys` sigue apagado a propósito.
- La IA gratuita pasó a ser DeepSeek (`90454e0`); NVIDIA y Gemini quedan como BYOK.

**Verificado con proveedores reales:** DeepSeek y la IA gratuita terminan en READY; Ollama (`gemma4:e4b`) también,
tras prohibir comillas dobles en los textos generados (`510bd6d`, ≈20 min en CPU); `kill -9` a mitad + reinicio
→ FAILED reanudable; dos `/resume` simultáneos gastan 1 uso.

**Implementado en** `0a4d458` … `ae4b3b9` (fases A backend, B recuperación/reanudar, C frontend, D docs).

## 4. Guía de uso en cada página (onboarding UX, 2026-10-17/18)

**Decisiones del usuario (no reabrir).** Panel propio «¿Cómo funciona esta página?» cerrable y persistido en
`localStorage` (sin librerías de tours); se mantiene el orden del menú del mockup; renombres «Conectar IA» y
«Temas clave»; implementación real con tests, no artefactos de la skill.

**Resultado** (rama `feat/onboarding-guidance`): `PageGuide`/`HelpTerm`/`EmptyState`, checklist «Primeros
pasos» horizontal que se desbloquea paso a paso, asistente de un paso a la vez en Inicio (Material → Meta →
IA → Listo), paso de IA con tres opciones y motivo visible bajo todo botón principal deshabilitado.

**QA manual (2026-10-18):** 9 de 10 criterios cumplidos, 254 tests Vitest y 269 de backend en verde, sin
errores de consola ni desbordes. Fallaba un criterio (dos `h1` en Sesión por el Markdown de la IA); ya corregido: `SafeMarkdown` baja un nivel los encabezados.

## 5. Notas de producto de origen (`Planteamiento_Modelo_Aprendizaje`)

Flujo deseado: documento → meta → ruta → material → cronómetro/enfoque → descanso → examen → ajuste de ruta.
Los puntos 4, 5 y 8 (prioridad alta: modo enfoque y ajuste heurístico) están resueltos (sección 2). Siguen
abiertos los puntos 1 (baja), 2 (baja) y 3 (media), ver abajo.

## 6. Monetización

`AnalisisVersionPago.md` proponía separar «inteligencia de la plataforma» (ruta, progreso, SM-2, que debe
seguir disponible sin créditos) de «generación con IA» (que consume créditos). Esa idea está incorporada en
`docs/SaaS-Produccion.md` (§3), que es la hoja de ruta vigente.

## Pendientes que sobreviven

| Origen | Pendiente |
|---|---|
| Planteamiento #3 (media) | Mostrar la ruta en un lateral integrada con el material, no como pieza principal |
| Planteamiento #2 (baja) | Metas totalmente iguales se guardan como distintas: averiguar por qué (¿deduplicar?) |
| Planteamiento #1 (baja) | Flujo de subida aún mejorable para quien tiene poca ayuda técnica |
| ResolveProblems §3.8 | Suscripciones: ChatGPT Plus/Pro vía Local Codex; Claude Pro/Max exige autorización oficial de Anthropic. Aislarlas de la ruta de API key |
| ResolveProblems §4 | Reducir tokens de PDF: PyMuPDF4LLM opcional, limpieza de cabeceras, presupuesto de tokens por etapa; **medir antes de prometer un ahorro** |
| ResolveProblems §8 | Verificación live con cuentas reales de cada proveedor; revisión visual/accesible amplia en móvil y escritorio |
| Reanudar §10 | Ollama por API nativa `/api/chat` (fijar `num_ctx`); razonamiento en OpenAI serie o y OpenRouter (T3 saltada: OpenRouter rechaza `effort:"none"` en modelos con razonamiento obligatorio); guardar si un refuerzo gastó un uso para reembolsarlo tras una caída; heartbeat y multi-worker; reintento automático de la sesión fallida |
| Reanudar §9 | Si hay `LLM_TIMEOUT` en la IA gratuita, subir `DEFAULT_AI_READ_TIMEOUT_SECONDS` a 90 y `DEFAULT_AI_TOTAL_BUDGET_SECONDS` a 180 |
| Enfoque §13 | `weak_topics` del dashboard basado en el dominio por tema; fecha de examen en la meta; preguntas intercaladas; guardar el cronómetro al recargar; preferencia «Siempre» entre dispositivos |
| Onboarding §10 / QA | Enlaces «¿Dónde obtengo una API key?» por proveedor (hecho en parte en `lib/aiSetupHelp.ts`); FAQ in-app derivable de `glossary.ts`/`pageGuides.ts`; QA H2–H9 (sin verificar si siguen abiertos) de copy/accesibilidad (objetivos táctiles de `HelpTerm`, 8 proveedores desplegados sin recomendación, error de título vacío en Metas sin foco) |
| Producto | Ocultar respuestas del quiz hasta el envío; rate limiting; auth real (cubierto por `SaaS-Produccion.md`) |
