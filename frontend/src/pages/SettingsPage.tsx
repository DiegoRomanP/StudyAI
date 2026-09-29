import { useEffect, useRef, useState } from "react";

import { getApiErrorMessage } from "../api/errors";
import type { LLMCredentialDTO, ProviderCatalogEntry } from "../api/types";
import { Badge, Button, Card, Spinner } from "../components/ui";
import {
  useActivateLlmCredential,
  useDeactivateAllLlmCredentials,
  useDeleteLlmCredential,
  useLlmCredentials,
  useLlmRuntime,
  useProviderCatalog,
  useSaveLlmCredential,
  useTestLlmCredential,
  useUpdateLlmCredentialModel,
  useOllamaModels,
} from "../hooks/queries";

const CUSTOM_MODEL_VALUE = "__custom__";

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
    error: runtimeError,
    refetch: refreshRuntime,
  } = useLlmRuntime();
  const deactivateAll = useDeactivateAllLlmCredentials();
  const [deactivationError, setDeactivationError] = useState<string | null>(null);

  const isLoading = catalogLoading || credentialsLoading || runtimeLoading;
  const loadingError = catalogError
    ? getApiErrorMessage(catalogError, "No se pudo cargar el catálogo de proveedores.")
    : credentialsError
      ? getApiErrorMessage(credentialsError, "No se pudieron cargar las configuraciones guardadas.")
      : runtimeError
        ? getApiErrorMessage(runtimeError, "No se pudo consultar el proveedor efectivo.")
        : null;
  const runtimeProviderLabel = runtime?.provider
    ? catalog?.find((entry) => entry.provider === runtime.provider)?.label ?? runtime.provider
    : null;
  const hasRuntimeModels = Boolean(
    runtime?.models?.topic_analysis?.trim() &&
      runtime?.models?.session_plan?.trim() &&
      runtime?.models?.session_content?.trim(),
  );
  const isValidMockRuntime =
    runtime?.source === "MOCK" &&
    runtime.provider === null &&
    runtime.models.topic_analysis === "simulado" &&
    runtime.models.session_plan === "simulado" &&
    runtime.models.session_content === "simulado";
  const isValidEnvRuntime = runtime?.source === "ENV" && runtime.provider === "ANTHROPIC";
  const isValidUserRuntime = runtime?.source === "USER" && Boolean(runtime.provider);
  const hasValidRuntime = hasRuntimeModels && (isValidMockRuntime || isValidEnvRuntime || isValidUserRuntime);

  async function handleDeactivateAll() {
    setDeactivationError(null);
    try {
      await deactivateAll.mutateAsync();
    } catch (error: unknown) {
      setDeactivationError(getApiErrorMessage(error, "No se pudo desactivar el proveedor activo."));
    }
  }

  async function handleRefreshSettings() {
    setDeactivationError(null);
    const [catalogResult, credentialsResult, runtimeResult] = await Promise.all([
      refreshCatalog(),
      refreshCredentials(),
      refreshRuntime(),
    ]);
    const refreshError = catalogResult.error ?? credentialsResult.error ?? runtimeResult.error;
    if (refreshError) {
      setDeactivationError(getApiErrorMessage(refreshError, "No se pudo actualizar la configuración."));
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-slate-500">
          Administra tus proveedores y consulta qué configuración usará el servidor.
        </p>
      </header>

      <Card className="flex items-center justify-between">
        {runtimeError || (runtime && !hasValidRuntime) ? (
          <div>
            <p className="text-sm text-slate-500">Proveedor efectivo desconocido</p>
            <p className="font-medium text-slate-800">No se pudo consultar la configuración del servidor.</p>
          </div>
        ) : runtimeLoading || !runtime ? (
          <div>
            <p className="text-sm text-slate-500">Proveedor efectivo</p>
            <p className="font-medium text-slate-800">Consultando la configuración del servidor...</p>
          </div>
        ) : runtime.source === "USER" ? (
          <div>
            <p className="text-sm text-slate-500">Configuración de usuario activa</p>
            <p className="font-medium text-slate-800">
              {runtimeProviderLabel} ·{" "}
              <span className="font-mono text-sm">{runtime.models.session_content}</span>
            </p>
          </div>
        ) : runtime.source === "ENV" ? (
          <div>
            <p className="text-sm text-slate-500">Configuración del servidor</p>
            <p className="font-medium text-slate-800">
              {runtimeProviderLabel} ·{" "}
              <span className="font-mono text-sm">{runtime.models.session_content}</span>
            </p>
          </div>
        ) : runtime.source === "MOCK" ? (
          <div>
            <p className="text-sm text-slate-500">Proveedor efectivo</p>
            <p className="font-medium text-slate-800">Modo demo (LLM simulado, sin costo)</p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-slate-500">Proveedor efectivo desconocido</p>
            <p className="font-medium text-slate-800">La respuesta del servidor no es compatible.</p>
          </div>
        )}
        {isValidUserRuntime && (
          <Button
            variant="secondary"
            onClick={handleDeactivateAll}
            disabled={deactivateAll.isPending}
          >
            {deactivateAll.isPending ? "..." : "Usar configuración del servidor"}
          </Button>
        )}
      </Card>

      {!runtimeError && hasValidRuntime && runtime?.fallback_reason && (
        <p className="text-xs text-amber-700">{runtime.fallback_reason}</p>
      )}

      {(loadingError || deactivationError) && (
        <Card className="flex items-center justify-between gap-3 border border-red-200 text-sm text-red-700">
          <span>{loadingError ?? deactivationError}</span>
          <Button variant="secondary" onClick={handleRefreshSettings} disabled={isLoading}>
            Reintentar
          </Button>
        </Card>
      )}

      <p className="text-xs text-slate-400">
        Las claves de API se guardan cifradas en el servidor. Ollama usa los modelos instalados en
        la misma máquina que ejecuta el backend y no requiere una clave.
      </p>

      {isLoading ? (
        <Spinner label="Cargando..." />
      ) : (
        <div className="grid gap-4">
          {catalog?.map((entry) => (
            <ProviderCard
              key={entry.provider}
              catalogEntry={entry}
              credential={credentials?.find((c) => c.provider === entry.provider)}
              refreshCredentials={refreshCredentials}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderCard({
  catalogEntry,
  credential,
  refreshCredentials,
}: {
  catalogEntry: ProviderCatalogEntry;
  credential: LLMCredentialDTO | undefined;
  refreshCredentials: () => Promise<{ data?: LLMCredentialDTO[]; error?: unknown }>;
}) {
  const save = useSaveLlmCredential();
  const updateModel = useUpdateLlmCredentialModel();
  const activate = useActivateLlmCredential();
  const deactivateAll = useDeactivateAllLlmCredentials();
  const deleteCredential = useDeleteLlmCredential();
  const test = useTestLlmCredential();
  const isOllama = catalogEntry.provider === "OLLAMA";
  const supportsCustomBaseUrl = catalogEntry.supports_custom_base_url;
  const allowsCustomModel = catalogEntry.allows_custom_model;
  const ollamaModels = useOllamaModels(isOllama);

  const isVerified = credential?.is_verified ?? false;

  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [changingKey, setChangingKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const modelOptions = isOllama
    ? (ollamaModels.data ?? []).map((model) => ({ id: model.id, free: true }))
    : catalogEntry.common_models;
  const initialModel = credential?.model || catalogEntry.default_model;
  const initialIsCommon = modelOptions.some((m) => m.id === initialModel);
  const [modelChoice, setModelChoice] = useState(
    initialIsCommon
      ? initialModel
      : !allowsCustomModel
        ? catalogEntry.default_model
        : CUSTOM_MODEL_VALUE,
  );
  const [customModel, setCustomModel] = useState(initialIsCommon ? "" : initialModel);
  const [showAdvanced, setShowAdvanced] = useState(Boolean(credential?.base_url));
  const [baseUrl, setBaseUrl] = useState(credential?.base_url ?? "");
  const [syncedRevision, setSyncedRevision] = useState(credential?.config_revision);
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const [hasRemoteConflict, setHasRemoteConflict] = useState(false);
  const isSavingLocalDraft = useRef(false);

  function syncDraft(source: LLMCredentialDTO) {
    const savedModel = source.model || catalogEntry.default_model;
    const savedIsCommon = modelOptions.some((model) => model.id === savedModel);
    setModelChoice(
      savedIsCommon ? savedModel : !allowsCustomModel ? catalogEntry.default_model : CUSTOM_MODEL_VALUE,
    );
    setCustomModel(savedIsCommon ? "" : savedModel);
    setBaseUrl(source.base_url);
    setSyncedRevision(source.config_revision);
    setIsDraftDirty(false);
    setHasRemoteConflict(false);
  }

  useEffect(() => {
    if (!credential) return;
    if (credential.config_revision === syncedRevision) return;
    if (isSavingLocalDraft.current) return;
    if (isDraftDirty) {
      setHasRemoteConflict(true);
      return;
    }
    syncDraft(credential);
  }, [credential?.config_revision, isDraftDirty, syncedRevision]);
  const resolvedModel = modelChoice === CUSTOM_MODEL_VALUE ? customModel.trim() : modelChoice;
  const hasUnsupportedStoredModel = Boolean(
    credential?.model && !modelOptions.some((model) => model.id === credential.model) && !allowsCustomModel,
  );
  const showKeyForm = catalogEntry.requires_api_key && (!credential || changingKey);
  const operationPending =
    save.isPending ||
    test.isPending ||
    updateModel.isPending ||
    activate.isPending ||
    deactivateAll.isPending ||
    deleteCredential.isPending;
  const verifying = operationPending || ollamaModels.isFetching;

  function handleMutationError(error: unknown, fallback: string) {
    const status =
      typeof error === "object" && error !== null && "response" in error
        ? (error.response as { status?: number } | undefined)?.status
        : undefined;
    if (status === 409) setHasRemoteConflict(true);
    setError(getApiErrorMessage(error, fallback));
  }

  async function handleSaveKey() {
    setError(null);
    setTestMessage(null);
    if (!apiKey.trim()) {
      setError("Ingresa una clave de API.");
      return;
    }
    try {
      await save.mutateAsync({
        provider: catalogEntry.provider,
        payload: { api_key: apiKey.trim() },
      });
      setApiKey("");
      setChangingKey(false);
    } catch (e: unknown) {
      handleMutationError(e, "No se pudo guardar la clave.");
    }
  }

  async function handleConfigureOllama() {
    setError(null);
    setTestMessage(null);
    if (!resolvedModel) {
      setError("Selecciona un modelo local instalado.");
      return;
    }
    if (!modelOptions.some((model) => model.id === resolvedModel)) {
      setError("El modelo seleccionado no está instalado localmente en Ollama.");
      return;
    }
    try {
      const savedCredential =
        credential ??
        (await save.mutateAsync({
          provider: catalogEntry.provider,
          payload: {},
        }));
      const expectedRevision = credential
        ? (syncedRevision ?? credential.config_revision)
        : savedCredential.config_revision;
      isSavingLocalDraft.current = true;
      const draft = await updateModel.mutateAsync({
        provider: catalogEntry.provider,
        payload: { model: resolvedModel, expected_revision: expectedRevision },
      });
      syncDraft(draft);
      isSavingLocalDraft.current = false;
      const verified = await test.mutateAsync({
        provider: catalogEntry.provider,
        payload: { expected_revision: draft.config_revision },
      });
      setTestMessage(`Modelo local ${verified.credential.model} verificado.`);
    } catch (e: unknown) {
      handleMutationError(e, "No se pudo conectar con Ollama.");
    } finally {
      isSavingLocalDraft.current = false;
    }
  }

  async function handleSaveModel() {
    setError(null);
    setTestMessage(null);
    if (catalogEntry.requires_model_selection && !resolvedModel) {
      setError("Selecciona o escribe un modelo.");
      return;
    }
    if (!credential) return;
    const expectedRevision = syncedRevision ?? credential.config_revision;
    isSavingLocalDraft.current = true;
    try {
      const draft = await updateModel.mutateAsync({
        provider: catalogEntry.provider,
        payload: {
          model: resolvedModel,
          base_url: baseUrl.trim(),
          expected_revision: expectedRevision,
        },
      });
      syncDraft(draft);
      isSavingLocalDraft.current = false;
      const verified = await test.mutateAsync({
        provider: catalogEntry.provider,
        payload: { expected_revision: draft.config_revision },
      });
      setTestMessage(`Modelo ${verified.credential.model} guardado y verificado.`);
    } catch (e: unknown) {
      handleMutationError(e, "Error al guardar el modelo.");
    } finally {
      isSavingLocalDraft.current = false;
    }
  }

  async function handleClearUnsupportedBaseUrl() {
    setError(null);
    setTestMessage(null);
    if (!credential) return;
    const expectedRevision = syncedRevision ?? credential.config_revision;
    isSavingLocalDraft.current = true;
    try {
      const draft = await updateModel.mutateAsync({
        provider: catalogEntry.provider,
        payload: {
          model: resolvedModel,
          base_url: "",
          expected_revision: expectedRevision,
        },
      });
      syncDraft(draft);
      isSavingLocalDraft.current = false;
      setTestMessage("URL base personalizada eliminada. Guarda y verifica el modelo para continuar.");
    } catch (e: unknown) {
      handleMutationError(e, "No se pudo eliminar la URL base personalizada.");
    } finally {
      isSavingLocalDraft.current = false;
    }
  }

  async function handleActivate() {
    setError(null);
    try {
      if (!credential) return;
      await activate.mutateAsync({
        provider: catalogEntry.provider,
        expectedRevision: credential.config_revision,
      });
    } catch (e: unknown) {
      handleMutationError(e, "Error al activar el proveedor.");
    }
  }

  async function handleDelete() {
    const resource = catalogEntry.requires_api_key ? "clave" : "configuración";
    if (
      !window.confirm(
        `¿Eliminar la ${resource} de ${catalogEntry.label}? Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }
    setError(null);
    try {
      await deleteCredential.mutateAsync(catalogEntry.provider);
    } catch (e: unknown) {
      handleMutationError(e, "Error al eliminar la clave.");
    }
  }

  async function handleTest() {
    setError(null);
    setTestMessage(null);
    try {
      if (!credential) return;
      const verified = await test.mutateAsync({
        provider: catalogEntry.provider,
        payload: { expected_revision: credential.config_revision },
      });
      setTestMessage(`Configuración de ${verified.credential.model} verificada.`);
    } catch (e: unknown) {
      setTestMessage(null);
      handleMutationError(e, "No se pudo conectar con este proveedor.");
    }
  }

  async function handleDeactivate() {
    setError(null);
    try {
      await deactivateAll.mutateAsync();
    } catch (e: unknown) {
      handleMutationError(e, "No se pudo desactivar el proveedor.");
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium text-slate-800">{catalogEntry.label}</p>
          {credential ? (
            <p className="font-mono text-xs text-slate-400">
              {catalogEntry.requires_api_key ? credential.masked_api_key : "Modelo local"}
              {!isVerified && " · sin verificar"}
            </p>
          ) : (
            <p className="text-xs text-slate-400">No configurada</p>
          )}
        </div>
        {credential?.is_active && <Badge color="green">Activo</Badge>}
      </div>

      {showKeyForm && (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Clave de API</label>
          <div className="flex gap-2">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={catalogEntry.key_placeholder}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              autoComplete="off"
            />
            <Button variant="secondary" onClick={() => setShowKey((v) => !v)} type="button">
              {showKey ? "Ocultar" : "Mostrar"}
            </Button>
          </div>
        </div>
      )}

      {credential && catalogEntry.requires_model_selection && (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Modelo</label>
          <select
            value={modelChoice}
            onChange={(e) => {
              setModelChoice(e.target.value);
              setIsDraftDirty(true);
            }}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          >
            <option value="">Selecciona un modelo</option>
            {modelOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
                {!isOllama && m.free ? " — gratis" : ""}
              </option>
            ))}
            {!isOllama && allowsCustomModel && <option value={CUSTOM_MODEL_VALUE}>Personalizado…</option>}
          </select>
          {modelChoice === CUSTOM_MODEL_VALUE && !isOllama && allowsCustomModel && (
            <input
              value={customModel}
              onChange={(e) => {
                setCustomModel(e.target.value);
                setIsDraftDirty(true);
              }}
              placeholder="ID exacto del modelo"
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          )}
          {isOllama && (
           <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
              <span>{ollamaModels.data?.length ?? 0} modelos locales disponibles</span>
              <button
                type="button"
                onClick={() => ollamaModels.refetch()}
                className="font-medium text-brand-600 hover:text-brand-700"
              >
                Actualizar modelos
              </button>
            </div>
          )}
          {isOllama && ollamaModels.error && (
            <p className="mt-2 text-xs text-red-600">
              {getApiErrorMessage(ollamaModels.error, "No se pudieron descubrir los modelos de Ollama.")}
            </p>
          )}
          {hasUnsupportedStoredModel && (
            <p className="mt-2 text-xs text-amber-700">
              El modelo guardado ya no es compatible. Selecciona un modelo validado y vuelve a verificarlo.
            </p>
          )}
        </div>
      )}

      {!isOllama && supportsCustomBaseUrl && (
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            {showAdvanced ? "▾" : "▸"} Configuración avanzada
          </button>
          {showAdvanced && (
            <input
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value);
                setIsDraftDirty(true);
              }}
              placeholder={catalogEntry.default_base_url ?? "URL base personalizada"}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          )}
        </div>
      )}

      {credential?.base_url && !supportsCustomBaseUrl && (
        <div className="space-y-2 text-sm text-amber-700">
          <p>
            Esta configuración conserva una URL base personalizada no compatible: {" "}
            <span className="font-mono text-xs">{credential.base_url}</span>
          </p>
          <Button variant="secondary" onClick={handleClearUnsupportedBaseUrl} disabled={operationPending}>
            Eliminar URL personalizada
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {testMessage && <p className="text-sm text-green-600">{testMessage}</p>}
      {hasRemoteConflict && credential && (
        <div className="flex items-center gap-2 text-sm text-amber-700">
          <span>La configuración cambió en otra pestaña. Tu borrador local no se sobrescribió.</span>
          <button
            type="button"
              onClick={async () => {
                try {
                  const result = await refreshCredentials();
                  if (result.error) {
                    handleMutationError(result.error, "No se pudo actualizar la configuración remota.");
                    return;
                  }
                  const latest = result.data?.find((item) => item.provider === catalogEntry.provider);
                  if (latest) syncDraft(latest);
                } catch (e: unknown) {
                  handleMutationError(e, "No se pudo actualizar la configuración remota.");
                }
              }}
            className="font-medium underline"
          >
            Usar configuración remota
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {isOllama ? (
          <>
            <Button onClick={handleConfigureOllama} disabled={verifying}>
              {verifying
                ? "Verificando..."
                : credential
                  ? "Guardar y verificar modelo"
                  : "Conectar y verificar modelo"}
            </Button>
            {credential && !credential.is_active && (
              <Button
                variant="secondary"
                onClick={handleActivate}
                disabled={operationPending || !isVerified}
              >
                {activate.isPending ? "..." : "Activar"}
              </Button>
            )}
            {credential?.is_active && (
              <Button
                variant="secondary"
                onClick={handleDeactivate}
                disabled={operationPending}
              >
                Desactivar
              </Button>
            )}
          </>
        ) : (
          <>
            {showKeyForm && (
              <Button onClick={handleSaveKey} disabled={verifying}>
                {verifying ? "Guardando..." : "Guardar clave"}
              </Button>
            )}
            {credential && (
              <>
                <Button onClick={handleSaveModel} disabled={operationPending || changingKey}>
                  {verifying ? "Verificando..." : "Guardar y verificar modelo"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleTest}
                  disabled={operationPending || changingKey}
                >
                  {test.isPending ? "Probando..." : "Probar configuración guardada"}
                </Button>
                {!credential.is_active ? (
                  <Button
                    variant="secondary"
                    onClick={handleActivate}
                    disabled={operationPending || !isVerified || changingKey}
                  >
                    {activate.isPending ? "..." : "Activar"}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={handleDeactivate}
                    disabled={operationPending}
                  >
                    Desactivar
                  </Button>
                )}
                {!changingKey && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setChangingKey(true);
                      setApiKey("");
                      setError(null);
                    }}
                  >
                    Cambiar clave
                  </Button>
                )}
              </>
            )}
            {changingKey && credential && (
              <Button
                variant="secondary"
                onClick={() => {
                  setChangingKey(false);
                  setApiKey("");
                  setError(null);
                }}
              >
                Cancelar
              </Button>
            )}
          </>
        )}
        {credential && (
          <Button variant="danger" onClick={handleDelete} disabled={operationPending}>
            Eliminar
          </Button>
        )}
      </div>
    </Card>
  );
}
