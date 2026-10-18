import { useState } from "react";
import { Bot, KeyRound, Server, TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";

import type { ProviderCatalogEntry } from "../../api/types";
import { useLlmCredentials, useLlmRuntime, useProviderCatalog } from "../../hooks/queries";
import { getConfirmedRuntimeProvider, resolveLlmRuntime } from "../llm/LlmRuntimeSummary";
import { ProviderSetup } from "../llm/ProviderSetup";
import { Button, IconTile, OptionCard, Spinner } from "../ui";

/**
 * "Conecta tu IA" inside Inicio: shows the provider the server will actually use and,
 * only if the learner wants their own key, the same secure save → draft → test →
 * activate flow as Conectar IA (compact variant). Mock and Ollama need no key.
 */
export function ProviderQuickSetup() {
  const catalogQuery = useProviderCatalog();
  const credentialsQuery = useLlmCredentials();
  const runtimeQuery = useLlmRuntime();
  const [configuring, setConfiguring] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderCatalogEntry["provider"] | null>(null);

  const catalog = catalogQuery.data;
  const runtimeRefreshing = runtimeQuery.isPending || runtimeQuery.isFetching || catalogQuery.isPending;
  const runtimeError = runtimeQuery.error ?? catalogQuery.error;
  const resolved = resolveLlmRuntime(runtimeQuery.data, catalog);
  const confirmedProvider = getConfirmedRuntimeProvider(runtimeQuery.data, catalog, {
    isRefreshing: runtimeRefreshing,
    error: runtimeError,
  });
  const selectedEntry = catalog?.find((entry) => entry.provider === selectedProvider);

  let summary;
  if (runtimeQuery.isPending || catalogQuery.isPending) {
    summary = <Spinner label="Consultando el proveedor de IA…" />;
  } else if (runtimeError || resolved.kind === "unknown") {
    summary = (
      <div className="flex flex-col items-start gap-2 text-sm text-state-warning sm:flex-row sm:items-center">
        <span className="inline-flex items-center gap-2">
          <TriangleAlert aria-hidden="true" className="h-4 w-4" />
          No pudimos confirmar qué proveedor de IA usará el servidor.
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
  } else if (resolved.kind === "mock") {
    summary = (
      <ProviderLine icon={Bot} title="Modo demo activo" detail="Puedes estudiar sin clave con un LLM simulado y sin costo." />
    );
  } else {
    summary = (
      <ProviderLine
        icon={resolved.kind === "env" ? Server : KeyRound}
        title={resolved.kind === "env" ? `Usando ${resolved.label} del servidor` : `Usando ${resolved.label}`}
        detail={`Modelo: ${resolved.model}`}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div aria-live="polite">{summary}</div>
      {resolved.kind !== "unknown" && "fallbackReason" in resolved && resolved.fallbackReason && (
        <p className="text-sm text-state-warning">{resolved.fallbackReason}</p>
      )}

      {!configuring ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => setConfiguring(true)} disabled={!catalog}>
            <KeyRound aria-hidden="true" className="h-4 w-4" />
            Usar mi propia API key
          </Button>
          <span className="text-xs text-text-muted">Opcional: solo para un proveedor remoto propio.</span>
        </div>
      ) : (
        <div className="space-y-3 rounded-surface border border-line bg-surface-subtle/50 p-3">
          <div role="group" aria-label="Proveedores disponibles" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(catalog ?? []).map((entry) => (
              <OptionCard
                key={entry.provider}
                title={entry.label}
                description={
                  confirmedProvider === entry.provider
                    ? "Activo"
                    : entry.requires_api_key
                      ? "Requiere tu clave"
                      : "No requiere clave"
                }
                selected={selectedProvider === entry.provider}
                onSelect={() => setSelectedProvider(entry.provider)}
              />
            ))}
          </div>
          {selectedEntry && (
            <ProviderSetup
              key={selectedEntry.provider}
              catalogEntry={selectedEntry}
              credential={credentialsQuery.data?.find((item) => item.provider === selectedEntry.provider)}
              isRuntimeActive={confirmedProvider === selectedEntry.provider}
              refreshCredentials={credentialsQuery.refetch}
              variant="compact"
            />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <Link to="/settings" className="inline-flex min-h-11 items-center text-action hover:underline">
              Configuración avanzada en Conectar IA
            </Link>
            <Button type="button" variant="ghost" onClick={() => setConfiguring(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProviderLine({ icon, title, detail }: { icon: typeof Bot; title: string; detail: string }) {
  return (
    <div className="flex items-center gap-3">
      <IconTile icon={icon} className="h-9 w-9" />
      <div className="min-w-0">
        <p className="font-medium text-text-primary">{title}</p>
        <p className="text-sm text-text-muted">{detail}</p>
      </div>
    </div>
  );
}

/** True when the effective provider was read successfully (A09 precondition for "Estudiar"). */
export function useRuntimeConfirmed() {
  const catalogQuery = useProviderCatalog();
  const runtimeQuery = useLlmRuntime();
  if (runtimeQuery.isPending || catalogQuery.isPending) return "pending" as const;
  if (runtimeQuery.error || catalogQuery.error) return "unknown" as const;
  return resolveLlmRuntime(runtimeQuery.data, catalogQuery.data).kind === "unknown"
    ? ("unknown" as const)
    : ("confirmed" as const);
}
