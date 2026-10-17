import { useEffect, useMemo, useRef, useState } from "react";

import { getApiErrorMessage } from "../api/errors";
import type { LLMCredentialDTO, ProviderCatalogEntry } from "../api/types";
import {
  useActivateLlmCredential,
  useDeactivateAllLlmCredentials,
  useDeleteLlmCredential,
  useProviderModels,
  useSaveLlmCredential,
  useTestLlmCredential,
  useUpdateLlmCredentialModel,
} from "./queries";

const CUSTOM_MODEL_VALUE = "__custom__";
// The only 409 that means "another tab changed this configuration"; other 409s reject the request.
const REMOTE_CHANGE_CODE = "LLM_CONFIGURATION_CHANGED";

export type ProviderSetupAction =
  | "save-key"
  | "configure"
  | "save-model"
  | "clear-url"
  | "test"
  | "activate"
  | "deactivate"
  | "delete";

export interface UseProviderSetupOptions {
  catalogEntry: ProviderCatalogEntry;
  credential?: LLMCredentialDTO;
  isRuntimeActive: boolean;
  refreshCredentials: () => Promise<{ data?: LLMCredentialDTO[]; error?: unknown }>;
  startAdvancedExpanded: boolean;
}

function getModelChoice(
  model: string,
  options: { id: string }[],
  allowsCustomModel: boolean,
) {
  if (!model) return "";
  if (options.some((option) => option.id === model)) return model;
  return allowsCustomModel ? CUSTOM_MODEL_VALUE : "";
}

export function useProviderSetup({
  catalogEntry,
  credential,
  isRuntimeActive,
  refreshCredentials,
  startAdvancedExpanded,
}: UseProviderSetupOptions) {
  const save = useSaveLlmCredential();
  const updateModel = useUpdateLlmCredentialModel();
  const activate = useActivateLlmCredential();
  const deactivateAll = useDeactivateAllLlmCredentials();
  const deleteCredential = useDeleteLlmCredential();
  const test = useTestLlmCredential();
  const discoveredModels = useProviderModels(
    catalogEntry.provider,
    catalogEntry.supports_model_discovery,
  );

  const modelOptions = useMemo(
    () =>
      catalogEntry.supports_model_discovery
        ? (discoveredModels.data ?? []).map((model) => ({ id: model.id, free: true }))
        : catalogEntry.common_models,
    [catalogEntry.common_models, catalogEntry.supports_model_discovery, discoveredModels.data],
  );
  const initialModel = credential?.model || catalogEntry.default_model;
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [changingKey, setChangingKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [modelChoice, setModelChoice] = useState(() =>
    getModelChoice(initialModel, modelOptions, catalogEntry.allows_custom_model),
  );
  const [customModel, setCustomModel] = useState(() =>
    modelOptions.some((model) => model.id === initialModel) ? "" : initialModel,
  );
  const [showAdvanced, setShowAdvanced] = useState(
    startAdvancedExpanded && Boolean(credential?.base_url),
  );
  const [baseUrl, setBaseUrl] = useState(credential?.base_url ?? "");
  const [syncedRevision, setSyncedRevision] = useState(credential?.config_revision);
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const [hasRemoteConflict, setHasRemoteConflict] = useState(false);
  const [activeAction, setActiveAction] = useState<ProviderSetupAction | null>(null);
  const isSavingLocalDraft = useRef(false);
  const lastSyncedRevision = useRef(credential?.config_revision);

  function syncDraft(source: LLMCredentialDTO) {
    const savedModel = source.model || catalogEntry.default_model;
    setModelChoice(getModelChoice(savedModel, modelOptions, catalogEntry.allows_custom_model));
    setCustomModel(modelOptions.some((model) => model.id === savedModel) ? "" : savedModel);
    setBaseUrl(source.base_url ?? "");
    setSyncedRevision(source.config_revision);
    lastSyncedRevision.current = source.config_revision;
    setIsDraftDirty(false);
    setHasRemoteConflict(false);
    setTestMessage(null);
  }

  useEffect(() => {
    if (!credential || isSavingLocalDraft.current) return;
    if (credential.config_revision !== lastSyncedRevision.current) {
      if (isDraftDirty) {
        setHasRemoteConflict(true);
        return;
      }
      syncDraft(credential);
      return;
    }

    // Discovery results may arrive after a keyless local credential was loaded.
    if (
      catalogEntry.supports_model_discovery &&
      !discoveredModels.isLoading &&
      !isDraftDirty &&
      credential.model
    ) {
      setModelChoice(getModelChoice(credential.model, modelOptions, catalogEntry.allows_custom_model));
      setCustomModel(
        modelOptions.some((model) => model.id === credential.model) || !catalogEntry.allows_custom_model
          ? ""
          : credential.model,
      );
    }
  }, [
    catalogEntry.supports_model_discovery,
    credential,
    credential?.config_revision,
    discoveredModels.isLoading,
    isDraftDirty,
    modelOptions,
    syncedRevision,
  ]);

  const resolvedModel = modelChoice === CUSTOM_MODEL_VALUE ? customModel.trim() : modelChoice;
  const canUseCustomModel = catalogEntry.allows_custom_model;
  const hasUnsupportedStoredModel = Boolean(
    credential?.model &&
      !modelOptions.some((model) => model.id === credential.model) &&
      !canUseCustomModel &&
      !discoveredModels.isLoading &&
      !discoveredModels.error,
  );
  const showKeyForm = catalogEntry.requires_api_key && (!credential || changingKey);
  const operationPending =
    save.isPending ||
    test.isPending ||
    updateModel.isPending ||
    activate.isPending ||
    deactivateAll.isPending ||
    deleteCredential.isPending;
  const verifying = operationPending || discoveredModels.isFetching;
  const hasUnconfirmedChanges = isDraftDirty || changingKey || Boolean(apiKey.trim());
  const isVerifiedForDraft = Boolean(credential?.is_verified && !hasUnconfirmedChanges);

  function handleMutationError(caught: unknown, fallback: string) {
    const response =
      typeof caught === "object" && caught !== null && "response" in caught
        ? (caught.response as { status?: number; data?: { code?: unknown } } | undefined)
        : undefined;
    if (response?.status === 409 && response.data?.code === REMOTE_CHANGE_CODE) {
      setHasRemoteConflict(true);
    }
    // 404: the configuration no longer exists, so earlier verification evidence is stale.
    if (response?.status === 404) setTestMessage(null);
    setError(getApiErrorMessage(caught, fallback));
  }

  function markDraftChanged() {
    setIsDraftDirty(true);
    setTestMessage(null);
  }

  function handleApiKeyChange(value: string) {
    setApiKey(value);
    setTestMessage(null);
  }

  function handleChangeKey() {
    setChangingKey(true);
    setApiKey("");
    setError(null);
    setTestMessage(null);
  }

  function handleCancelChangeKey() {
    setChangingKey(false);
    setApiKey("");
    setError(null);
    setTestMessage(null);
  }

  async function handleSaveKey() {
    setError(null);
    setTestMessage(null);
    if (!apiKey.trim()) {
      setError("Ingresa una clave de API.");
      return;
    }
    isSavingLocalDraft.current = true;
    setActiveAction("save-key");
    try {
      const savedCredential = await save.mutateAsync({
        provider: catalogEntry.provider,
        payload: { api_key: apiKey.trim() },
      });
      setApiKey("");
      setShowKey(false);
      setChangingKey(false);
      syncDraft(savedCredential);
    } catch (caught: unknown) {
      handleMutationError(caught, "No se pudo guardar la clave.");
    } finally {
      // Drop the mutation (and the plaintext key in its variables) from the client cache.
      save.reset();
      isSavingLocalDraft.current = false;
      setActiveAction(null);
    }
  }

  async function verifyDraft(expectedRevision: number) {
    const verified = await test.mutateAsync({
      provider: catalogEntry.provider,
      payload: { expected_revision: expectedRevision },
    });
    if (!isDraftDirty) {
      syncDraft(verified.credential);
    } else {
      setSyncedRevision(verified.credential.config_revision);
      lastSyncedRevision.current = verified.credential.config_revision;
    }
    setTestMessage(`Modelo ${verified.credential.model} guardado y verificado.`);
    return verified.credential;
  }

  async function handleConfigureWithoutKey() {
    setError(null);
    setTestMessage(null);
    if (catalogEntry.requires_model_selection && !resolvedModel) {
      setError("Selecciona un modelo.");
      return;
    }
    if (
      catalogEntry.supports_model_discovery &&
      !catalogEntry.allows_custom_model &&
      !modelOptions.some((model) => model.id === resolvedModel)
    ) {
      setError("Selecciona un modelo instalado y disponible en este proveedor.");
      return;
    }

    setActiveAction("configure");
    try {
      const savedCredential =
        credential ??
        (await save.mutateAsync({
          provider: catalogEntry.provider,
          payload: {},
        }));
      if (!credential) syncDraft(savedCredential);
      const expectedRevision = credential
        ? (syncedRevision ?? credential.config_revision)
        : savedCredential.config_revision;
      isSavingLocalDraft.current = true;
      const draft = await updateModel.mutateAsync({
        provider: catalogEntry.provider,
        payload: {
          model: resolvedModel,
          ...(catalogEntry.supports_custom_base_url ? { base_url: baseUrl.trim() } : {}),
          expected_revision: expectedRevision,
        },
      });
      syncDraft(draft);
      await verifyDraft(draft.config_revision);
    } catch (caught: unknown) {
      handleMutationError(caught, "No se pudo conectar con este proveedor.");
    } finally {
      isSavingLocalDraft.current = false;
      setActiveAction(null);
    }
  }

  async function handleSaveModel() {
    setError(null);
    setTestMessage(null);
    if (catalogEntry.requires_model_selection && !resolvedModel) {
      setError("Selecciona o escribe un modelo.");
      return;
    }
    if (
      catalogEntry.supports_model_discovery &&
      !catalogEntry.allows_custom_model &&
      !modelOptions.some((model) => model.id === resolvedModel)
    ) {
      setError("Selecciona un modelo instalado y disponible en este proveedor.");
      return;
    }
    if (!credential) return;

    isSavingLocalDraft.current = true;
    setActiveAction("save-model");
    try {
      const draft = await updateModel.mutateAsync({
        provider: catalogEntry.provider,
        payload: {
          model: resolvedModel,
          ...(catalogEntry.supports_custom_base_url ? { base_url: baseUrl.trim() } : {}),
          expected_revision: syncedRevision ?? credential.config_revision,
        },
      });
      syncDraft(draft);
      await verifyDraft(draft.config_revision);
    } catch (caught: unknown) {
      handleMutationError(caught, "Error al guardar el modelo.");
    } finally {
      isSavingLocalDraft.current = false;
      setActiveAction(null);
    }
  }

  async function handleClearUnsupportedBaseUrl() {
    setError(null);
    setTestMessage(null);
    if (!credential) return;

    isSavingLocalDraft.current = true;
    setActiveAction("clear-url");
    try {
      const draft = await updateModel.mutateAsync({
        provider: catalogEntry.provider,
        payload: {
          model: resolvedModel,
          base_url: "",
          expected_revision: syncedRevision ?? credential.config_revision,
        },
      });
      syncDraft(draft);
      setTestMessage("URL base personalizada eliminada. Guarda y verifica el modelo para continuar.");
    } catch (caught: unknown) {
      handleMutationError(caught, "No se pudo eliminar la URL base personalizada.");
    } finally {
      isSavingLocalDraft.current = false;
      setActiveAction(null);
    }
  }

  async function handleActivate() {
    setError(null);
    if (!credential) return;
    setActiveAction("activate");
    try {
      await activate.mutateAsync({
        provider: catalogEntry.provider,
        expectedRevision: syncedRevision ?? credential.config_revision,
      });
    } catch (caught: unknown) {
      handleMutationError(caught, "Error al activar el proveedor.");
    } finally {
      setActiveAction(null);
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
    setTestMessage(null);
    setActiveAction("delete");
    try {
      await deleteCredential.mutateAsync(catalogEntry.provider);
    } catch (caught: unknown) {
      handleMutationError(caught, "Error al eliminar la configuración.");
    } finally {
      setActiveAction(null);
    }
  }

  async function handleTest() {
    setError(null);
    setTestMessage(null);
    if (!credential) return;
    setActiveAction("test");
    try {
      const verified = await test.mutateAsync({
        provider: catalogEntry.provider,
        payload: { expected_revision: syncedRevision ?? credential.config_revision },
      });
      if (!isDraftDirty) syncDraft(verified.credential);
      else {
        setSyncedRevision(verified.credential.config_revision);
        lastSyncedRevision.current = verified.credential.config_revision;
      }
      setTestMessage(`Configuración de ${verified.credential.model} verificada.`);
    } catch (caught: unknown) {
      setTestMessage(null);
      handleMutationError(caught, "No se pudo conectar con este proveedor.");
    } finally {
      setActiveAction(null);
    }
  }

  async function handleDeactivate() {
    setError(null);
    setActiveAction("deactivate");
    try {
      await deactivateAll.mutateAsync();
    } catch (caught: unknown) {
      handleMutationError(caught, "No se pudo desactivar el proveedor.");
    } finally {
      setActiveAction(null);
    }
  }

  async function handleUseRemoteConfiguration() {
    setError(null);
    try {
      const result = await refreshCredentials();
      if (result.error) {
        handleMutationError(result.error, "No se pudo actualizar la configuración remota.");
        return;
      }
      const latest = result.data?.find((item) => item.provider === catalogEntry.provider);
      if (latest) syncDraft(latest);
      else {
        setHasRemoteConflict(false);
        setError("La configuración remota ya no está guardada.");
      }
    } catch (caught: unknown) {
      handleMutationError(caught, "No se pudo actualizar la configuración remota.");
    }
  }

  return {
    apiKey,
    handleApiKeyChange,
    showKey,
    setShowKey,
    changingKey,
    handleChangeKey,
    handleCancelChangeKey,
    error,
    testMessage,
    modelOptions,
    modelChoice,
    setModelChoice,
    customModel,
    setCustomModel,
    showAdvanced,
    setShowAdvanced,
    baseUrl,
    setBaseUrl,
    resolvedModel,
    canUseCustomModel,
    hasUnsupportedStoredModel,
    showKeyForm,
    operationPending,
    activeAction,
    verifying,
    isVerifiedForDraft,
    hasRemoteConflict,
    isActive: isRuntimeActive,
    // Stored flag: lets the user deactivate even when the runtime does not confirm the provider.
    isStoredActive: Boolean(credential?.is_active),
    isDiscoveryLoading: discoveredModels.isLoading,
    discoveryError: discoveredModels.error,
    refetchDiscoveredModels: discoveredModels.refetch,
    markDraftChanged,
    handleSaveKey,
    handleConfigureWithoutKey,
    handleSaveModel,
    handleClearUnsupportedBaseUrl,
    handleActivate,
    handleDelete,
    handleTest,
    handleDeactivate,
    handleUseRemoteConfiguration,
  };
}
