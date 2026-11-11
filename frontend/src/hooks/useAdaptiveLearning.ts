import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  adaptiveLearningApi,
  type AssessmentSubmissionV2,
} from "../api/adaptiveLearning";

export const adaptiveLearningKeys = {
  mode: (sessionId: number | null) => ["adaptive-learning", "mode", sessionId] as const,
  lesson: (sessionId: number | null) => ["adaptive-learning", "lesson", sessionId] as const,
  assessment: (sessionId: number | null) => ["adaptive-learning", "assessment", sessionId] as const,
  result: (sessionId: number | null) => ["adaptive-learning", "result", sessionId] as const,
};

/** The session's version is resolved before any version-specific content is requested. */
export function useLearningMode(sessionId: number | null) {
  return useQuery({
    queryKey: adaptiveLearningKeys.mode(sessionId),
    queryFn: () => adaptiveLearningApi.getLearningMode(sessionId as number),
    enabled: sessionId !== null,
  });
}

/** Fetches v2 lesson content only after the server confirms that the session uses v2. */
export function useAdaptiveLearning(sessionId: number | null) {
  const mode = useLearningMode(sessionId);
  const lesson = useQuery({
    queryKey: adaptiveLearningKeys.lesson(sessionId),
    queryFn: () => adaptiveLearningApi.getLearningV2(sessionId as number),
    enabled: sessionId !== null && mode.data?.content_version === 2,
  });

  return { mode, lesson };
}

/** Loads the public, key-free assessment after the session mode has selected v2. */
export function useAdaptiveAssessment(sessionId: number | null, enabled = true) {
  return useQuery({
    queryKey: adaptiveLearningKeys.assessment(sessionId),
    queryFn: () => adaptiveLearningApi.getAssessmentV2(sessionId as number),
    enabled: sessionId !== null && enabled,
  });
}

/** Reads the persisted result only when the route/session state calls for it. */
export function useAdaptiveAssessmentResult(sessionId: number | null, enabled = true) {
  return useQuery({
    queryKey: adaptiveLearningKeys.result(sessionId),
    queryFn: () => adaptiveLearningApi.getAssessmentResultV2(sessionId as number),
    enabled: sessionId !== null && enabled,
  });
}

/** Saves the result in cache and refreshes the existing progress projections. */
export function useSubmitAdaptiveAssessment(sessionId: number, planId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ quizId, input }: { quizId: number; input: AssessmentSubmissionV2 }) =>
      adaptiveLearningApi.submitAssessmentV2(quizId, input),
    onSuccess: async (result) => {
      queryClient.setQueryData(adaptiveLearningKeys.result(sessionId), result);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["session", sessionId] }),
        queryClient.invalidateQueries({ queryKey: ["plan", planId] }),
        queryClient.invalidateQueries({ queryKey: ["plans"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
  });
}
