import { useState } from "react";
import { Check, ExternalLink, TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";

import { getApiErrorMessage } from "../../api/errors";
import type { FreeAiDTO, ProviderCatalogEntry } from "../../api/types";
import {
  useDeactivateAllLlmCredentials,
  useLlmCredentials,
  useLlmRuntime,
  useProviderCatalog,
} from "../../hooks/queries";
import { useDemoAccepted } from "../../hooks/useDemoAccepted";
import {
  KEY_SOURCES,
  KEY_STEPS,
  OLLAMA_COMMANDS,
  OLLAMA_DOWNLOAD_URL,
  OLLAMA_NOTES,
} from "../../lib/aiSetupHelp";
import { getConfirmedRuntimeProvider, resolveLlmRuntime } from "../llm/LlmRuntimeSummary";
import { ProviderSetup } from "../llm/ProviderSetup";
import { Alert, Button, SegmentedControl, Spinner } from "../ui";
import { CopyableCommand } from "./CopyableCommand";

export type AiReadiness =
  | { status: "pending" }
  | { status: "unknown" }
  /** Nothing usable yet; `freeLimit` is set when the included AI ran out for today. */
  | { status: "needs-setup"; freeLimit?: number }
  | { status: "ready"; title: string; detail: string; bundled: boolean };

/** Today's allowance of the included AI, if the server sent a well-formed one. */
export function readFreeAi(runtime: unknown): FreeAiDTO | null {
  const value = (runtime as { free_ai?: unknown } | null | undefined)?.free_ai;
  if (typeof value !== "object" || value === null) return null;
  const { limit, used, remaining } = value as Record<string, unknown>;
  return typeof limit === "number" && typeof used === "number" && typeof remaining === "number"
    ? { limit, used, remaining }
    : null;
}

/**
 * Whether the AI step is complete. A real provider (the learner's key, a local model or the
 * included free AI while it has uses left) counts; the demo mode counts only after the learner
 * chose it on purpose, so nobody lands on example content without knowing it.
 */
export function useAiReadiness(): AiReadiness {
  const catalogQuery = useProviderCatalog();
  const runtimeQuery = useLlmRuntime();
  const { accepted: demoAccepted } = useDemoAccepted();

  if (runtimeQuery.isPending || catalogQuery.isPending) return { status: "pending" };
  if (runtimeQuery.error || catalogQuery.error) return { status: "unknown" };
  const resolved = resolveLlmRuntime(runtimeQuery.data, catalogQuery.data);
  if (resolved.kind === "unknown") return { status: "unknown" };
  if (resolved.kind === "mock") {
    return demoAccepted
      ? {
          status: "ready",
          title: "Modo demo",
          detail: "Contenido de ejemplo, sin IA real.",
          bundled: false,
        }
      : { status: "needs-setup" };
  }
  if (resolved.kind === "env" && resolved.bundled) {
    const free = readFreeAi(runtimeQuery.data);
    if (free && free.remaining === 0) return { status: "needs-setup", freeLimit: free.limit };
    return {
      status: "ready",
      title: "IA gratuita",
      detail: free ? `Te quedan ${free.remaining} de ${free.limit} usos hoy.` : "Gratis, con uso limitado.",
      bundled: true,
    };
  }
  return {
    status: "ready",
    title: resolved.kind === "env" ? `Usando ${resolved.label} del servidor` : `Usando ${resolved.label}`,
    detail: `Modelo: ${resolved.model}`,
    bundled: false,
  };
}

type Path = "free" | "key" | "ollama";

/**
 * Step "Elige tu IA" of the setup wizard: the included free AI (a few uses per day), the
 * learner's own API key, or a local Ollama. With nothing configured, demo mode is the last
 * resort. The save → test → activate flow of a key is the same as in Conectar IA.
 */
export function AiStep() {
  const catalogQuery = useProviderCatalog();
  const credentialsQuery = useLlmCredentials();
  const runtimeQuery = useLlmRuntime();
  const readiness = useAiReadiness();
  const { accept: acceptDemo } = useDemoAccepted();
  const useFree = useDeactivateAllLlmCredentials();
  const [chosenPath, setChosenPath] = useState<Path | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ProviderCatalogEntry["provider"] | null>(null);

  const catalog = catalogQuery.data;
  const runtimeRefreshing = runtimeQuery.isPending || runtimeQuery.isFetching || catalogQuery.isPending;
  const confirmedProvider = getConfirmedRuntimeProvider(runtimeQuery.data, catalog, {
    isRefreshing: runtimeRefreshing,
    error: runtimeQuery.error ?? catalogQuery.error,
  });
  const resolved = resolveLlmRuntime(runtimeQuery.data, catalog);
  const freeAi = readFreeAi(runtimeQuery.data);
  const freeActive = resolved.kind === "env" && resolved.bundled;
  const usingOwn = resolved.kind === "user";
  const activePath: Path | null = freeActive
    ? "free"
    : usingOwn
      ? resolved.provider === "OLLAMA"
        ? "ollama"
        : "key"
      : null;
  const path: Path = chosenPath ?? activePath ?? (freeAi ? "free" : "key");

  const keyProviders = (catalog ?? []).filter((entry) => entry.requires_api_key);
  const providerKey = selectedProvider ?? (usingOwn && resolved.provider !== "OLLAMA" ? resolved.provider : null);
  const selectedEntry = keyProviders.find((entry) => entry.provider === providerKey);
  const ollamaEntry = (catalog ?? []).find((entry) => entry.provider === "OLLAMA");

  function credentialFor(entry: ProviderCatalogEntry) {
    return credentialsQuery.data?.find((item) => item.provider === entry.provider);
  }

  if (readiness.status === "pending") {
    return <Spinner label="Consultando el proveedor de IA…" />;
  }

  if (readiness.status === "unknown") {
    return (
      <div className="flex flex-col items-start gap-2 text-sm text-state-warning sm:flex-row sm:items-center">
        <span className="inline-flex items-center gap-2">
          <TriangleAlert aria-hidden="true" className="h-4 w-4" />
          No pudimos comprobar tu IA.
        </span>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            void catalogQuery.refetch();
            void runtimeQuery.refetch();
          }}
        >
          Reintentar
        </Button>
      </div>
    );
  }

  const inUse = (value: Path) => (activePath === value && readiness.status === "ready" ? " (en uso)" : "");
  const options: { value: Path; label: string }[] = [
    ...(freeAi ? [{ value: "free" as const, label: `Gratis · ${freeAi.limit} al día${inUse("free")}` }] : []),
    { value: "key", label: `Mi API key${inUse("key")}` },
    { value: "ollama", label: `En local (Ollama)${inUse("ollama")}` },
  ];

  return (
    <div className="space-y-4">
      {readiness.status === "ready" && !readiness.bundled && (
        <p aria-live="polite" className="text-sm text-text-muted">
          <span className="font-medium text-text-primary">{readiness.title}</span> · {readiness.detail}
        </p>
      )}
      <SegmentedControl appearance="chips" label="Cómo usar la IA" value={path} onChange={setChosenPath} options={options} />

      {path === "free" && freeAi && (
        <div className="space-y-3 rounded-surface border border-line bg-surface-subtle/50 p-3">
          <p className="text-sm text-text-primary">
            {freeAi.remaining > 0
              ? `Cada plan o refuerzo con IA gasta 1 uso. Te quedan ${freeAi.remaining} de ${freeAi.limit} hoy.`
              : `Hoy ya usaste tus ${freeAi.limit} usos. Vuelve mañana o usa tu API key.`}
          </p>
          {freeActive && freeAi.remaining > 0 ? (
            <p className="inline-flex items-center gap-1.5 text-sm font-medium text-state-success">
              <Check aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
              En uso
            </p>
          ) : (
            !freeActive && (
              <Button
                type="button"
                onClick={() => useFree.mutate()}
                disabled={useFree.isPending || freeAi.remaining === 0}
              >
                {useFree.isPending ? "Cambiando…" : "Usar la IA gratuita"}
              </Button>
            )
          )}
          {useFree.isError && (
            <Alert tone="error" title="No se pudo cambiar a la IA gratuita">
              <p>{getApiErrorMessage(useFree.error, "Inténtalo de nuevo.")}</p>
            </Alert>
          )}
        </div>
      )}

      {path === "key" && (
        <div className="space-y-3 rounded-surface border border-line bg-surface-subtle/50 p-3">
          <SegmentedControl
            appearance="chips"
            label="Proveedores disponibles"
            value={providerKey ?? ""}
            onChange={(value) => setSelectedProvider(value === "" ? null : (value as ProviderCatalogEntry["provider"]))}
            options={keyProviders.map((entry) => ({
              value: entry.provider as string,
              label: confirmedProvider === entry.provider ? `${entry.label} (activo)` : entry.label,
            }))}
          />
          {selectedEntry ? (
            <ProviderSetup
              key={selectedEntry.provider}
              catalogEntry={selectedEntry}
              credential={credentialFor(selectedEntry)}
              isRuntimeActive={confirmedProvider === selectedEntry.provider}
              refreshCredentials={credentialsQuery.refetch}
              variant="compact"
            />
          ) : null}
          <details className="text-sm">
            <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-action hover:underline">
              ¿Cómo conseguir una API key?
            </summary>
            <div className="space-y-3 pb-1 pt-2">
              <ol className="list-decimal space-y-1 pl-5 text-text-primary">
                {KEY_STEPS.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <ul aria-label="Dónde conseguir una API key" className="space-y-1">
                {KEY_SOURCES.map((source) => {
                  const label = catalog?.find((entry) => entry.provider === source.provider)?.label ?? source.provider;
                  return (
                    <li key={source.provider} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-1.5 font-medium text-action hover:underline"
                      >
                        {label}
                        <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                        <span className="sr-only">(se abre en otra pestaña)</span>
                      </a>
                      <span className="text-text-muted">{source.note}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </details>
          <Link to="/settings" className="inline-flex min-h-11 items-center text-sm text-action hover:underline">
            Más opciones
          </Link>
        </div>
      )}

      {path === "ollama" && (
        <div className="space-y-4 rounded-surface border border-line bg-surface-subtle/50 p-3">
          <div className="space-y-3">
            {OLLAMA_COMMANDS.map((item) => (
              <CopyableCommand key={item.id} label={item.label} command={item.command} />
            ))}
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-text-muted">
            {OLLAMA_NOTES.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          <a
            href={OLLAMA_DOWNLOAD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-action hover:underline"
          >
            Descargar Ollama
            <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="sr-only">(se abre en otra pestaña)</span>
          </a>
          {ollamaEntry && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-text-primary">4. Elige el modelo</p>
              <ProviderSetup
                catalogEntry={ollamaEntry}
                credential={credentialFor(ollamaEntry)}
                isRuntimeActive={confirmedProvider === "OLLAMA"}
                refreshCredentials={credentialsQuery.refetch}
                variant="compact"
              />
            </div>
          )}
        </div>
      )}

      {readiness.status === "needs-setup" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-sm text-text-muted">
          <span>¿Solo probar?</span>
          <Button type="button" variant="ghost" className="!min-h-10" onClick={acceptDemo}>
            Seguir en modo demo
          </Button>
          <span className="basis-full text-xs">Contenido de ejemplo, sin IA real.</span>
        </div>
      )}
    </div>
  );
}
