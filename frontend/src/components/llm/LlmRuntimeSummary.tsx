import type { LLMCredentialDTO, LLMRuntimeDTO, ProviderCatalogEntry } from "../../api/types";
import { Button, Card } from "../ui";

export type ResolvedLlmRuntime =
  | { kind: "unknown"; detail: string }
  | { kind: "mock"; fallbackReason: string | null }
  | { kind: "env"; label: string; model: string; fallbackReason: string | null }
  | {
      kind: "user";
      provider: LLMCredentialDTO["provider"];
      label: string;
      model: string;
      fallbackReason: string | null;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function resolveLlmRuntime(
  runtime: unknown,
  catalog: ProviderCatalogEntry[] | undefined,
): ResolvedLlmRuntime {
  const invalid = { kind: "unknown" as const, detail: "La respuesta del servidor no es compatible." };
  if (!isRecord(runtime) || !isRecord(runtime.models)) return invalid;

  const rawModels = runtime.models;
  const topicAnalysis = rawModels.topic_analysis;
  const sessionPlan = rawModels.session_plan;
  const sessionContent = rawModels.session_content;
  const fallbackReason = runtime.fallback_reason;
  if (
    !nonEmptyString(topicAnalysis) ||
    !nonEmptyString(sessionPlan) ||
    !nonEmptyString(sessionContent) ||
    !(fallbackReason === null || typeof fallbackReason === "string")
  ) {
    return invalid;
  }

  const providerCatalog = Array.isArray(catalog) ? catalog : [];
  if (
    runtime.source === "MOCK" &&
    runtime.provider === null &&
    topicAnalysis === "simulado" &&
    sessionPlan === "simulado" &&
    sessionContent === "simulado"
  ) {
    return { kind: "mock", fallbackReason };
  }

  if (runtime.source === "ENV" && runtime.provider === "ANTHROPIC") {
    const provider = providerCatalog.find((entry) => entry.provider === runtime.provider);
    if (provider) {
      return {
        kind: "env",
        label: provider.label,
        model: sessionContent,
        fallbackReason,
      };
    }
  }

  if (runtime.source === "USER" && typeof runtime.provider === "string") {
    const provider = providerCatalog.find((entry) => entry.provider === runtime.provider);
    if (provider) {
      return {
        kind: "user",
        provider: provider.provider,
        label: provider.label,
        model: sessionContent,
        fallbackReason,
      };
    }
  }

  return invalid;
}

/**
 * The provider the server confirms it is using, or null. Fails closed: nothing is
 * "active" while the runtime is loading/refetching, errored, or not a user credential.
 * Every surface that marks a provider as active (Configuración, Inicio) must use this.
 */
export function getConfirmedRuntimeProvider(
  runtime: unknown,
  catalog: ProviderCatalogEntry[] | undefined,
  { isRefreshing, error }: { isRefreshing: boolean; error: unknown },
): LLMCredentialDTO["provider"] | null {
  if (isRefreshing || error) return null;
  const resolved = resolveLlmRuntime(runtime, catalog);
  return resolved.kind === "user" ? resolved.provider : null;
}

interface LlmRuntimeSummaryProps {
  runtime?: LLMRuntimeDTO;
  catalog?: ProviderCatalogEntry[];
  isLoading: boolean;
  error: string | null;
  isDeactivating: boolean;
  onDeactivate: () => void;
}

export function LlmRuntimeSummary({
  runtime,
  catalog,
  isLoading,
  error,
  isDeactivating,
  onDeactivate,
}: LlmRuntimeSummaryProps) {
  const resolved = resolveLlmRuntime(runtime, catalog);
  const loadingState = isLoading && !error;
  const isUnknown = Boolean(error) || (!loadingState && resolved.kind === "unknown");

  let heading = "Proveedor efectivo";
  let description = "";
  if (loadingState) {
    heading = "Proveedor efectivo";
    description = "Consultando la configuración del servidor…";
  } else if (isUnknown) {
    heading = "Proveedor efectivo desconocido";
    description = error || resolved.kind !== "unknown"
      ? "No se pudo consultar la configuración del servidor."
      : resolved.detail;
  } else if (resolved.kind === "user") {
    heading = "Configuración de usuario activa";
    description = `${resolved.label} · ${resolved.model}`;
  } else if (resolved.kind === "env") {
    heading = "Configuración del servidor";
    description = `${resolved.label} · ${resolved.model}`;
  } else {
    description = "Modo demo (LLM simulado, sin costo)";
  }

  const fallbackReason = !loadingState && !isUnknown && resolved.kind !== "unknown"
    ? resolved.fallbackReason
    : null;
  const userRuntime = !loadingState && !isUnknown && resolved.kind === "user";

  return (
    <div className="space-y-3">
      <Card className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <p className="text-sm text-text-muted">{heading}</p>
          <p className="mt-1 break-words font-medium text-text-primary">{description}</p>
          {fallbackReason && <p className="mt-2 text-sm text-state-warning">{fallbackReason}</p>}
        </div>
        {userRuntime && (
          <Button
            variant="secondary"
            type="button"
            onClick={onDeactivate}
            disabled={isDeactivating}
            className="shrink-0"
          >
            {isDeactivating ? "Actualizando…" : "Usar configuración del servidor"}
          </Button>
        )}
      </Card>
    </div>
  );
}
