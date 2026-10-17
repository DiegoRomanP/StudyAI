import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";

import { getApiErrorMessage, isNotFoundError } from "../api/errors";
import type { GoalCreate, PlanDTO, SessionSummaryDTO } from "../api/types";
import { planRequestFingerprint, useIdempotencyKey } from "../lib/idempotency";
import {
  getDocumentsListSnapshot,
  useCreateGoal,
  useGeneratePlan,
  usePlan,
} from "./queries";

/**
 * Coordinates "Estudiar" (A09): save or reuse a goal → request the plan → follow it
 * until READY with sessions. Writes happen only from `start`, never from effects; a
 * synchronous lock blocks a second run; retries reuse the confirmed goal and the
 * same Idempotency-Key, so a lost response never creates a duplicate plan.
 */

export type GoalSelection =
  | { kind: "existing"; goalId: number }
  | { kind: "template"; payload: GoalCreate };

export interface StudyStartInput {
  goal: GoalSelection;
  documentIds: number[];
}

export type StudyStartPhase =
  | "idle"
  | "saving-goal"
  | "requesting-plan"
  | "processing"
  | "ready"
  | "error"
  | "uncertain";

export const STUDY_START_STORAGE_KEY = "studyai.study-start";
const STORAGE_VERSION = 1;

type Step =
  | { phase: "idle" }
  | { phase: "saving-goal" | "requesting-plan" }
  | { phase: "error"; message: string }
  /** `stage` tells the UI whether a retry is safe ("plan", idempotent) or not ("goal"). */
  | { phase: "uncertain"; stage: "goal" | "plan"; message: string };

/** Only a versioned plan ID is stored — never keys, content or answers. */
function readStoredPlanId(): number | null {
  try {
    const raw = window.sessionStorage.getItem(STUDY_START_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: unknown; planId?: unknown };
    return parsed.v === STORAGE_VERSION &&
      typeof parsed.planId === "number" &&
      Number.isSafeInteger(parsed.planId) &&
      parsed.planId > 0
      ? parsed.planId
      : null;
  } catch {
    return null;
  }
}

function writeStoredPlanId(planId: number | null) {
  try {
    if (planId === null) window.sessionStorage.removeItem(STUDY_START_STORAGE_KEY);
    else
      window.sessionStorage.setItem(
        STUDY_START_STORAGE_KEY,
        JSON.stringify({ v: STORAGE_VERSION, planId }),
      );
  } catch {
    // Storage unavailable (private mode): the flow still works for this page view.
  }
}

/** The request may have reached the server: no HTTP response came back. */
function isLostResponse(error: unknown) {
  return axios.isAxiosError(error) && !error.response;
}

function firstPendingSession(plan: PlanDTO | undefined): SessionSummaryDTO | null {
  if (!plan) return null;
  return (
    [...plan.sessions]
      .sort((a, b) => a.order_index - b.order_index)
      .find((session) => session.status === "PENDING") ?? null
  );
}

export function useStudyStart() {
  const queryClient = useQueryClient();
  const createGoal = useCreateGoal();
  const generatePlan = useGeneratePlan();
  const requestKey = useIdempotencyKey();
  const running = useRef(false);
  const createdGoal = useRef<{ fingerprint: string; goalId: number } | null>(null);
  const [step, setStep] = useState<Step>({ phase: "idle" });
  const [goalId, setGoalId] = useState<number | null>(null);
  const [planId, setPlanId] = useState<number | null>(readStoredPlanId);
  const planQuery = usePlan(planId);
  const plan = planQuery.data;
  const planMissing = planQuery.isError && isNotFoundError(planQuery.error);
  // Never loaded and the GET failed for another reason: not "processing", it is unknown.
  const planLoadFailed = planId !== null && !plan && planQuery.isError && !planMissing;

  // A stored plan that no longer exists is forgotten (read-only cleanup, no writes).
  useEffect(() => {
    if (!planMissing) return;
    writeStoredPlanId(null);
    setPlanId(null);
  }, [planMissing]);

  const start = useCallback(
    async (input: StudyStartInput) => {
      if (running.current) return;

      const documentIds = [...new Set(input.documentIds)];
      const snapshot = getDocumentsListSnapshot(queryClient);
      const indexedIds = new Set(
        (snapshot.documents ?? [])
          .filter((document) => document.status === "INDEXED")
          .map((document) => document.id),
      );
      if (!snapshot.isConfirmedByGet) {
        setStep({
          phase: "error",
          message: "No se pudo verificar la lista de documentos. Actualízala antes de estudiar.",
        });
        return;
      }
      if (documentIds.length === 0 || documentIds.some((id) => !indexedIds.has(id))) {
        setStep({ phase: "error", message: "Selecciona al menos un documento indexado." });
        return;
      }
      if (input.goal.kind === "template") {
        const title = input.goal.payload.title.trim();
        if (!title || title.length > 255) {
          setStep({ phase: "error", message: "Escribe un título para tu meta (máximo 255 caracteres)." });
          return;
        }
      }

      running.current = true;
      try {
        let confirmedGoalId: number;
        if (input.goal.kind === "existing") {
          confirmedGoalId = input.goal.goalId;
        } else {
          const payload = { ...input.goal.payload, title: input.goal.payload.title.trim() };
          const fingerprint = JSON.stringify(payload);
          if (createdGoal.current?.fingerprint === fingerprint) {
            // A previous attempt already saved this goal; never create it twice.
            confirmedGoalId = createdGoal.current.goalId;
          } else {
            setStep({ phase: "saving-goal" });
            try {
              const goal = await createGoal.mutateAsync(payload);
              createdGoal.current = { fingerprint, goalId: goal.id };
              confirmedGoalId = goal.id;
            } catch (caught: unknown) {
              if (isLostResponse(caught)) {
                void queryClient.invalidateQueries({ queryKey: ["goals"] });
                setStep({
                  phase: "uncertain",
                  stage: "goal",
                  message:
                    "No sabemos si la meta se guardó. Revisa tus metas y elige la que corresponda antes de volver a intentarlo.",
                });
              } else {
                setStep({ phase: "error", message: getApiErrorMessage(caught, "No se pudo guardar la meta.") });
              }
              return;
            }
          }
        }
        setGoalId(confirmedGoalId);

        setStep({ phase: "requesting-plan" });
        const idempotencyKey = requestKey.keyFor(planRequestFingerprint(confirmedGoalId, documentIds));
        try {
          const status = await generatePlan.mutateAsync({
            goalId: confirmedGoalId,
            documentIds,
            idempotencyKey,
          });
          requestKey.reset();
          writeStoredPlanId(status.id);
          setPlanId(status.id);
          setStep({ phase: "idle" });
        } catch (caught: unknown) {
          setStep(
            isLostResponse(caught)
              ? {
                  phase: "uncertain",
                  stage: "plan",
                  message:
                    "No sabemos si el servidor recibió la solicitud. Puedes reintentar con seguridad: se reutiliza la misma solicitud y no se duplicará el plan.",
                }
              : { phase: "error", message: getApiErrorMessage(caught, "No se pudo iniciar la generación del plan.") },
          );
        }
      } finally {
        running.current = false;
      }
    },
    [createGoal, generatePlan, queryClient, requestKey],
  );

  const reset = useCallback(() => {
    if (running.current) return;
    writeStoredPlanId(null);
    setPlanId(null);
    setGoalId(null);
    setStep({ phase: "idle" });
    createdGoal.current = null;
    requestKey.reset();
  }, [requestKey]);

  let phase: StudyStartPhase = step.phase;
  let error: string | null = step.phase === "error" || step.phase === "uncertain" ? step.message : null;
  if (step.phase === "idle" && planId !== null && !planMissing) {
    if (planLoadFailed) {
      phase = "error";
      error = "No pudimos consultar el estado de tu plan. Puede que siga generándose; vuelve a intentarlo.";
    } else if (!plan || plan.status === "PROCESSING") {
      phase = "processing";
    } else if (plan.status === "FAILED") {
      phase = "error";
      error = plan.error_message || "La generación del plan falló.";
    } else if (plan.sessions.length === 0) {
      phase = "error";
      error = "El plan está listo pero no tiene sesiones disponibles.";
    } else {
      phase = "ready";
    }
  }

  return {
    phase,
    error,
    goalId,
    planId: planMissing ? null : planId,
    plan: phase === "ready" || phase === "error" || phase === "processing" ? plan : undefined,
    nextSession: phase === "ready" ? firstPendingSession(plan) ?? null : null,
    /** Where an unconfirmed write happened; only "plan" retries are idempotent. */
    uncertainStage: step.phase === "uncertain" ? step.stage : null,
    /** The followed plan could not be read (network/5xx); `retryPlan` only re-reads it. */
    planLoadFailed,
    retryPlan: () => void planQuery.refetch(),
    isBusy: phase === "saving-goal" || phase === "requesting-plan",
    start,
    reset,
  };
}
