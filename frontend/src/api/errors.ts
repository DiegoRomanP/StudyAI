import axios from "axios";

import type { LLMProviderErrorDTO } from "./types";

type ValidationIssue = { msg?: unknown };
type ApiErrorPayload = Partial<LLMProviderErrorDTO> & { detail?: unknown };

const LLM_ERROR_CODES = new Set([
  "LLM_ACCESS_DENIED",
  "LLM_AUTHENTICATION_FAILED",
  "LLM_CONNECTION_FAILED",
  "LLM_ENDPOINT_OR_MODEL_UNAVAILABLE",
  "LLM_INVALID_RESPONSE",
  "LLM_MODEL_UNAVAILABLE",
  "LLM_PROVIDER_ERROR",
  "LLM_PROVIDER_UNAVAILABLE",
  "LLM_QUOTA_EXHAUSTED",
  "LLM_RATE_LIMITED",
  "LLM_TIMEOUT",
  "LLM_UNSUPPORTED_REQUEST",
]);

function isTypedLlmError(payload: ApiErrorPayload): payload is LLMProviderErrorDTO {
  return (
    typeof payload.detail === "string" &&
    typeof payload.code === "string" &&
    LLM_ERROR_CODES.has(payload.code) &&
    (typeof payload.provider === "string" || payload.provider === null) &&
    (typeof payload.upstream_status === "number" || payload.upstream_status === null) &&
    typeof payload.retryable === "boolean" &&
    (typeof payload.retry_after_seconds === "number" || payload.retry_after_seconds === null)
  );
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError<ApiErrorPayload>(error)) return fallback;

  const payload = error.response?.data ?? {};
  const detail = payload.detail;
  if (isTypedLlmError(payload) && payload.detail.trim()) return payload.detail;
  // Only a fully typed 502 payload may show a provider's public detail.
  if (error.response?.status !== 502 && typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((issue: ValidationIssue) => (typeof issue?.msg === "string" ? issue.msg : null))
      .filter((message): message is string => message !== null);
    if (messages.length > 0) return messages.join(". ");
  }
  if (!error.response) return "No se pudo conectar con el servidor. Inténtalo de nuevo.";
  return fallback;
}
