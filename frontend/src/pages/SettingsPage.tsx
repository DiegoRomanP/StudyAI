import { useState } from "react";
import { ChevronDown, KeyRound, SquareTerminal } from "lucide-react";

import { getApiErrorMessage } from "../api/errors";
import { getConfirmedRuntimeProvider, LlmRuntimeSummary } from "../components/llm/LlmRuntimeSummary";
import { EmptyState } from "../components/EmptyState";
import { HelpTip } from "../components/help/HelpTip";
import { ProviderIcon } from "../components/llm/ProviderIcon";
import { ProviderSetup } from "../components/llm/ProviderSetup";
import { isAgentCli } from "../lib/aiSetupHelp";
import { PageHeader, Button, Card, Skeleton } from "../components/ui";
import {
  useDeactivateAllLlmCredentials,
  useLlmCredentials,
  useLlmRuntime,
  useProviderCatalog,
} from "../hooks/queries";

export function SettingsPage() {
  const {
    data: catalog,
    isPending: catalogLoading,
    error: catalogError,
    refetch: refreshCatalog,
  } = useProviderCatalog();
  const {
    data: credentials,
    isPending: credentialsLoading,
    error: credentialsError,
    refetch: refreshCredentials,
  } = useLlmCredentials();
  const {
    data: runtime,
    isPending: runtimeLoading,
    isFetching: runtimeFetching,
    error: runtimeError,
    refetch: refreshRuntime,
  } = useLlmRuntime();
  const deactivateAll = useDeactivateAllLlmCredentials();
  const [settingsActionError, setSettingsActionError] = useState<string | null>(null);

  const isLoading = catalogLoading || credentialsLoading || runtimeLoading;
  const runtimeIsRefreshing = runtimeLoading || runtimeFetching || catalogLoading;
  const loadingError = catalogError
    ? getApiErrorMessage(catalogError, "No se pudo cargar el catálogo de proveedores.")
    : credentialsError
      ? getApiErrorMessage(credentialsError, "No se pudieron cargar las configuraciones guardadas.")
      : runtimeError
        ? getApiErrorMessage(runtimeError, "No se pudo consultar el proveedor efectivo.")
        : null;
  const confirmedProvider = getConfirmedRuntimeProvider(runtime, catalog, {
    isRefreshing: runtimeIsRefreshing,
    error: runtimeError,
  });
  async function handleDeactivateAll() {
    setSettingsActionError(null);
    try {
      await deactivateAll.mutateAsync();
    } catch (error: unknown) {
      setSettingsActionError(getApiErrorMessage(error, "No se pudo desactivar el proveedor activo."));
    }
  }

  async function handleRefreshSettings() {
    setSettingsActionError(null);
    const [catalogResult, credentialsResult, runtimeResult] = await Promise.all([
      refreshCatalog(),
      refreshCredentials(),
      refreshRuntime(),
    ]);
    const refreshError = catalogResult.error ?? credentialsResult.error ?? runtimeResult.error;
    if (refreshError) {
      setSettingsActionError(getApiErrorMessage(refreshError, "No se pudo actualizar la configuración."));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader icon={KeyRound} title="Conectar IA" help="conectar-ia" />

      <LlmRuntimeSummary
        runtime={runtime}
        catalog={catalog}
        isLoading={runtimeIsRefreshing}
        error={runtimeError ? getApiErrorMessage(runtimeError, "No se pudo consultar el proveedor efectivo.") : null}
        isDeactivating={deactivateAll.isPending}
        onDeactivate={handleDeactivateAll}
      />

      {(loadingError || settingsActionError) && (
        <Card className="flex flex-col items-start justify-between gap-3 !border-state-error text-sm text-state-error sm:flex-row sm:items-center">
          <span>{loadingError ?? settingsActionError}</span>
          <Button type="button" variant="secondary" onClick={handleRefreshSettings} disabled={isLoading}>
            Reintentar
          </Button>
        </Card>
      )}

      {isLoading ? (
        <div role="status" aria-label="Cargando proveedores…" aria-busy="true" className="grid gap-8 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton height={28} width="40%" />
              <Skeleton height={72} />
              <Skeleton height={72} />
            </div>
          ))}
        </div>
      ) : catalog && catalog.length > 0 ? (
        <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
          {[
            {
              title: "Terminal",
              icon: SquareTerminal,
              help: "Usa tu sesión de Claude, ChatGPT u OpenCode. Solo en local.",
              agentCli: true,
            },
            { title: "Clave de API", icon: KeyRound, help: "Ollama también está en este grupo: corre en tu equipo.", agentCli: false },
          ].map((group) => {
            const entries = catalog.filter((entry) => isAgentCli(entry) === group.agentCli);
            if (entries.length === 0) return null;
            return (
              <section key={group.title} aria-label={`Proveedores: ${group.title}`} className="space-y-3">
                <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-text-primary">
                  <group.icon aria-hidden="true" className="h-5 w-5 text-text-muted" />
                  {group.title}
                  <HelpTip label={`Ayuda sobre ${group.title}`}>{group.help}</HelpTip>
                </h2>
                <div className="space-y-2">
                  {entries.map((entry) => {
                    const credential = credentials?.find((item) => item.provider === entry.provider);
                    const active = confirmedProvider === entry.provider;
                    const status = active
                      ? { text: "Activo", dot: "bg-state-success" }
                      : credential?.is_verified
                        ? { text: "Verificada", dot: "bg-state-correct" }
                        : credential
                          ? { text: "Sin verificar", dot: "bg-state-warning" }
                          : { text: "Sin configurar", dot: "bg-line-strong" };
                    return (
                      <details
                        key={entry.provider}
                        open={active || (Boolean(credential) && !credential?.is_verified)}
                        className="group rounded-control border border-line-strong bg-surface-paper"
                      >
                        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-2 font-display text-lg font-semibold text-text-primary [&::-webkit-details-marker]:hidden">
                          <ProviderIcon provider={entry.provider} />
                          <span className="min-w-0 flex-1">{entry.label}</span>
                          <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${status.dot}`} />
                          {!credential && <span className="sr-only">{status.text}</span>}
                          <ChevronDown
                            aria-hidden="true"
                            className="h-4 w-4 shrink-0 text-text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
                          />
                        </summary>
                        <div className="px-4 pb-4">
                          <ProviderSetup
                            catalogEntry={entry}
                            credential={credential}
                            isRuntimeActive={active}
                            refreshCredentials={refreshCredentials}
                            variant="advanced"
                          />
                        </div>
                      </details>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={KeyRound}
          title="No hay proveedores para configurar"
          description="El servidor no ofrece proveedores ahora mismo. Puedes seguir usando el modo demo."
        />
      )}
    </div>
  );
}
