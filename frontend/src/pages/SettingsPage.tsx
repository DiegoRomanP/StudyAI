import { useState } from "react";

import { getApiErrorMessage } from "../api/errors";
import { getConfirmedRuntimeProvider, LlmRuntimeSummary } from "../components/llm/LlmRuntimeSummary";
import { ProviderSetup } from "../components/llm/ProviderSetup";
import { Button, Card, Spinner } from "../components/ui";
import {
  useDeactivateAllLlmCredentials,
  useLlmCredentials,
  useLlmRuntime,
  useProviderCatalog,
} from "../hooks/queries";

export function SettingsPage() {
  const {
    data: catalog,
    isLoading: catalogLoading,
    error: catalogError,
    refetch: refreshCatalog,
  } = useProviderCatalog();
  const {
    data: credentials,
    isLoading: credentialsLoading,
    error: credentialsError,
    refetch: refreshCredentials,
  } = useLlmCredentials();
  const {
    data: runtime,
    isLoading: runtimeLoading,
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
  const providersWithoutKey = catalog
    ?.filter((entry) => !entry.requires_api_key)
    .map((entry) => entry.label);
  const providersWithDiscovery = catalog
    ?.filter((entry) => entry.supports_model_discovery)
    .map((entry) => entry.label);

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
      <header className="max-w-reading">
        <h1 className="font-display text-3xl font-bold text-text-primary">Conectar IA</h1>
        <p className="mt-2 text-text-muted">
          Conecta tu IA: elige un proveedor compatible y confirma qué modelo usará el servidor para
          estudiar. Sin clave, StudyAI sigue funcionando en modo demo.
        </p>
      </header>

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

      <Card className="space-y-2 border-line-strong bg-surface-subtle text-sm text-text-muted">
        <p>Las claves necesarias se almacenan cifradas en el servidor y no vuelven a mostrarse aquí.</p>
        {providersWithoutKey && providersWithoutKey.length > 0 && (
          <p>No requieren clave: {providersWithoutKey.join(", ")}.</p>
        )}
        {providersWithDiscovery && providersWithDiscovery.length > 0 && (
          <p>Modelos disponibles en el servidor: {providersWithDiscovery.join(", ")}.</p>
        )}
      </Card>

      {isLoading ? (
        <Spinner label="Cargando proveedores…" />
      ) : catalog && catalog.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {catalog.map((entry) => (
            <ProviderSetup
              key={entry.provider}
              catalogEntry={entry}
              credential={credentials?.find((item) => item.provider === entry.provider)}
              isRuntimeActive={confirmedProvider === entry.provider}
              refreshCredentials={refreshCredentials}
              variant="advanced"
            />
          ))}
        </div>
      ) : (
        <Card className="text-sm text-text-muted">
          El catálogo de proveedores no contiene opciones configurables.
        </Card>
      )}
    </div>
  );
}
