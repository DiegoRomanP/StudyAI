# Asistente de estudio

> **Leer antes de** tocar `app/services/assistant_service.py`, `POST /sessions/{id}/assistant` o
> `GET /assistant/questions`. Lado frontend: [../../frontend/funcionalidades/sesion-y-test.md](../../frontend/funcionalidades/sesion-y-test.md#asistente).

`POST /sessions/{id}/assistant` answers one learner message with **one** LLM call, kind `assistant_chat`
(1024 tokens, free Markdown, not JSON; the mock returns fixed text), grounded in the session material and 4
retrieved chunks plus the last 6 messages. `mode=EXAM` adds the question on screen (prompt and options) but
**never its answer key**: the model can't leak what it never receives, so a client forcing `mode=STUDY`
gains nothing. Rows live in `assistant_messages` (no FK to plan or session; `delete_plan` removes them
explicitly). Cuota gratuita separada (`FREE_AI_ASSISTANT_DAILY_LIMIT`): ver
[../llm/resolucion-y-cuota-gratuita.md](../llm/resolucion-y-cuota-gratuita.md). `GET /assistant/questions`
feeds «Mis preguntas» (`/preguntas`).
