import { createContext, useContext, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { MessageCircleQuestion, Send, X } from "lucide-react";

import { getApiErrorMessage } from "../../api/errors";
import type { AssistantMode } from "../../api/types";
import { useAskAssistant, useAssistantHistory } from "../../hooks/queries";
import { Alert, Badge, Button, Spinner } from "../ui";
import { SafeMarkdown } from "./SafeMarkdown";

/** The question on screen during the test, so a hint is about that question. */
export const AssistantQuestionContext = createContext<(questionId: string | null) => void>(() => {});

export function useReportAssistantQuestion(questionId: string | number | null | undefined) {
  const report = useContext(AssistantQuestionContext);
  const id = questionId == null ? null : String(questionId);
  useEffect(() => report(id), [id, report]);
}

/** Renders nothing; reports the current question (usable after a component's early returns). */
export function ReportAssistantQuestion({ id }: { id: string | number | null | undefined }) {
  useReportAssistantQuestion(id);
  return null;
}

const MODE_COPY: Record<AssistantMode, { badge: string; hint: string; placeholder: string }> = {
  STUDY: {
    badge: "Resuelve tus dudas",
    hint: "Pregunta lo que no te quede claro del material.",
    placeholder: "¿Qué quieres entender mejor?",
  },
  EXAM: {
    badge: "En el examen solo te doy pistas",
    hint: "Te ayudo a razonar la pregunta en pantalla, pero nunca te daré la respuesta.",
    placeholder: "¿En qué parte te atascaste?",
  },
};

/**
 * Non-modal side panel: the reading or the question stays visible while chatting.
 * The backend decides nothing from `mode` alone: an EXAM prompt never contains the answer.
 */
export function AssistantPanel({
  sessionId,
  mode,
  questionId = null,
}: {
  sessionId: number;
  mode: AssistantMode;
  questionId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const toggleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const reasonId = useId();
  const history = useAssistantHistory(open ? sessionId : null);
  const ask = useAskAssistant(sessionId);
  const copy = MODE_COPY[mode];
  const messages = history.data?.messages ?? [];
  const remaining = history.data?.remaining ?? null;
  const outOfMessages = remaining === 0;
  const empty = draft.trim() === "";

  const wasOpen = useRef(false);
  useEffect(() => {
    // The toggle remounts when the panel closes, so focus it after that render.
    if (open) inputRef.current?.focus();
    else if (wasOpen.current) toggleRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, ask.isPending]);

  function close() {
    setOpen(false);
  }

  function send(event?: FormEvent) {
    event?.preventDefault();
    if (empty || ask.isPending || outOfMessages) return;
    ask.mutate(
      { message: draft.trim(), mode, question_id: mode === "EXAM" ? questionId : null },
      { onSuccess: () => setDraft("") },
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }

  if (!open) {
    return (
      <Button
        ref={toggleRef}
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-30 shadow-flow md:bottom-6 md:right-6"
      >
        <MessageCircleQuestion aria-hidden="true" className="h-5 w-5" />
        Pregúntale al asistente
      </Button>
    );
  }

  return (
    <aside
      aria-labelledby={titleId}
      onKeyDown={(event) => event.key === "Escape" && close()}
      className="fixed inset-x-0 bottom-0 z-40 flex max-h-[60dvh] flex-col rounded-t-surface border border-line-strong/60 bg-surface-elevated shadow-flow md:inset-x-auto md:bottom-6 md:right-6 md:top-20 md:max-h-none md:w-[24rem] md:rounded-surface"
    >
      <header className="flex items-start justify-between gap-2 border-b border-line p-4">
        <div className="space-y-1">
          <h2 id={titleId} className="font-display text-lg font-semibold text-text-primary">
            Asistente de estudio
          </h2>
          <Badge color={mode === "EXAM" ? "amber" : "brand"}>{copy.badge}</Badge>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Cerrar el asistente"
          className="-m-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-text-muted hover:bg-surface-subtle hover:text-text-primary"
        >
          <X aria-hidden="true" className="h-5 w-5" />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite" aria-busy={ask.isPending}>
        {history.isLoading && <Spinner label="Cargando la conversación" />}
        {history.isError && <Alert tone="error">No se pudo cargar la conversación.</Alert>}
        {!history.isLoading && messages.length === 0 && <p className="text-sm text-text-muted">{copy.hint}</p>}
        {messages.map((message) =>
          message.role === "USER" ? (
            <p
              key={message.id}
              className="ml-8 whitespace-pre-wrap rounded-surface bg-surface-subtle p-3 text-sm text-text-primary"
            >
              <span className="sr-only">Tú: </span>
              {message.content}
            </p>
          ) : (
            <div key={message.id} className="prose-study mr-4 text-sm">
              <span className="sr-only">Asistente: </span>
              <SafeMarkdown>{message.content}</SafeMarkdown>
            </div>
          ),
        )}
        {ask.isPending && <Spinner label="El asistente está pensando" />}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="space-y-2 border-t border-line p-4">
        {ask.isError && (
          <Alert tone="error">{getApiErrorMessage(ask.error, "No se pudo enviar tu pregunta. Inténtalo de nuevo.")}</Alert>
        )}
        <label htmlFor={`${titleId}-input`} className="sr-only">
          Tu pregunta
        </label>
        <textarea
          id={`${titleId}-input`}
          ref={inputRef}
          rows={2}
          maxLength={2000}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={copy.placeholder}
          className="w-full resize-none rounded-control border border-control bg-surface-paper p-3 text-sm text-text-primary"
        />
        <div className="flex items-center justify-between gap-2">
          <p id={reasonId} className="text-xs text-text-muted">
            {outOfMessages
              ? "Ya no te quedan mensajes gratis hoy."
              : empty
                ? "Escribe tu pregunta para enviarla."
                : remaining !== null
                  ? `Te quedan ${remaining} mensajes gratis hoy.`
                  : "Enter envía · Mayús+Enter salto de línea"}
          </p>
          <Button
            type="submit"
            disabled={empty || ask.isPending || outOfMessages}
            aria-describedby={empty || outOfMessages ? reasonId : undefined}
          >
            <Send aria-hidden="true" className="h-4 w-4" />
            Enviar
          </Button>
        </div>
      </form>
    </aside>
  );
}
