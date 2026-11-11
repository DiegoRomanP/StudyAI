import { useQuery } from "@tanstack/react-query";

import { adaptiveLearningApi } from "../api/adaptiveLearning";

export const adaptiveLearningKeys = {
  mode: (sessionId: number | null) => ["adaptive-learning", "mode", sessionId] as const,
  lesson: (sessionId: number | null) => ["adaptive-learning", "lesson", sessionId] as const,
  assessment: (sessionId: number) => ["adaptive-learning", "assessment", sessionId] as const,
  result: (sessionId: number) => ["adaptive-learning", "result", sessionId] as const,
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
