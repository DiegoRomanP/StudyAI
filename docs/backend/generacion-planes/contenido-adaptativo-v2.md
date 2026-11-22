# Contenido adaptativo por perfil (v2)

> **Leer antes de** tocar `app/pedagogy/`, `adaptive_content_builder.py`, `adaptive_session_content.py`,
> `AdaptiveLearningService`/`AdaptiveQuizService` o los endpoints `learning-mode`/`assessment`.
> Piloto y revisión pedagógica: [piloto-perfiles.md](piloto-perfiles.md).

`POST /plans/generate` opts in with `content_version=2` and accepts an optional `profile_hint`. Topic
analysis resolves a profile and learning objectives for each topic in the first LLM call. The topic
checkpoint stores the snapshot and the plan stores the generation goal type. Resuming uses those persisted
values. The merged content call validates lesson and assessment together before writing a session.

Real models rarely return a fully valid v2 payload, so optional or per-item parts **degrade instead of
failing the session** (`adaptive_content_builder.py`, logged as warnings): unverifiable citations, feedback
and stimuli are dropped, and invalid questions are dropped (up to `multiple_choice` published). Coverage of
every objective, one objective question, the profile's lesson kinds and the flashcard count stay
mandatory. Topic objectives cap at 3 and an out-of-profile `bloom_target` becomes `understand`. Quiz
flashcards retain integer IDs for SM-2. Other v2 questions and their keys live in the versioned adaptive
payload. Las preguntas se anclan en el material de la misma llamada.

The client reads `/sessions/{id}/learning-mode` before choosing a lesson or quiz endpoint. V2 assessment
reads project public DTOs and **omit answer keys and grounded feedback**. Submission claims the session
before the quiz, validates the revision and persists the result in the same transaction as the completion
effects. An equivalent replay returns the saved result. Only objective items contribute to the v2 score
and mastery.

Reinforcement generates a replacement against the stored profile and goal strategy. The v2 job checks its
run token before publishing. Publishing keeps the quiz ID and opens a new assessment revision.
Cancellation and completion invalidate an active token, so a superseded task cannot replace the quiz.

Estímulos ricos (`svg`, `figure`): [../documentos/ingesta-y-figuras.md](../documentos/ingesta-y-figuras.md).
