import { useEffect, useState } from "react";

import type { LLMCredentialDTO, ProviderCatalogEntry } from "../api/types";
import { Badge, Button, Card, Spinner } from "../components/ui";
import {
  useActivateLlmCredential,
  useDeactivateAllLlmCredentials,
  useDeleteLlmCredential,
  useLlmCredentials,
  useProviderCatalog,
  useSaveLlmCredential,
  useTestLlmCredential,
  useUpdateLlmCredentialModel,
  useOllamaModels,
} from "../hooks/queries";

const CUSTOM_MODEL_VALUE = "__custom__";

export function SettingsPage() {
  const { data: catalog, isLoading: catalogLoading } = useProviderCatalog();
  const { data: credentials, isLoading: credentialsLoading } = useLlmCredentials();
  const deactivateAll = useDeactivateAllLlmCredentials();

  const activeCredential = credentials?.find((c) => c.is_active);
  const isLoading = catalogLoading || credentialsLoading;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-slate-500">
          Conecta una clave de API o un modelo local para usar un modelo real en vez del modo demo.
        </p>
      </header>

      <Card className="flex items-center justify-between">
        {activeCredential ? (
          <div>
            <p className="text-sm text-slate-500">Proveedor activo</p>
            <p className="font-medium text-slate-800">
              {activeCredential.label} ·{" "}
              <span className="font-mono text-sm">{activeCredential.model}</span>
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-slate-500">Sin proveedor activo</p>
            <p className="font-medium text-slate-800">Modo demo (LLM simulado, sin costo)</p>
          </div>
        )}
        {activeCredential && (
          <Button
            variant="secondary"
            onClick={() => deactivateAll.mutate()}
            disabled={deactivateAll.isPending}
          >
            {deactivateAll.isPending ? "..." : "Volver a modo demo"}
          </Button>
        )}
      </Card>

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
}: {
  catalogEntry: ProviderCatalogEntry;
  credential: LLMCredentialDTO | undefined;
}) {
  const save = useSaveLlmCredential();
  const updateModel = useUpdateLlmCredentialModel();
  const activate = useActivateLlmCredential();
  const deactivateAll = useDeactivateAllLlmCredentials();
  const deleteCredential = useDeleteLlmCredential();
  const test = useTestLlmCredential();
  const isOllama = catalogEntry.provider === "OLLAMA";
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
    initialIsCommon ? initialModel : CUSTOM_MODEL_VALUE,
  );
  const [customModel, setCustomModel] = useState(initialIsCommon ? "" : initialModel);
  const [showAdvanced, setShowAdvanced] = useState(Boolean(credential?.base_url));
  const [baseUrl, setBaseUrl] = useState(credential?.base_url ?? "");

  useEffect(() => {
    if (!credential) return;
    const savedModel = credential.model || catalogEntry.default_model;
    const savedIsCommon = modelOptions.some((model) => model.id === savedModel);
    setModelChoice(savedIsCommon ? savedModel : CUSTOM_MODEL_VALUE);
    setCustomModel(savedIsCommon ? "" : savedModel);
    setBaseUrl(credential.base_url);
  }, [credential?.config_revision]);

  const resolvedModel = modelChoice === CUSTOM_MODEL_VALUE ? customModel.trim() : modelChoice;
  const showKeyForm = catalogEntry.requires_api_key && (!credential || changingKey);
  const verifying =
    save.isPending || test.isPending || updateModel.isPending || ollamaModels.isFetching;

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
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "No se pudo verificar la clave.");
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
      const savedCredential = credential ?? await save.mutateAsync({
        provider: catalogEntry.provider,
        payload: {},
      });
      const draft = await updateModel.mutateAsync({
        provider: catalogEntry.provider,
        payload: { model: resolvedModel, expected_revision: savedCredential.config_revision },
      });
      const verified = await test.mutateAsync({
        provider: catalogEntry.provider,
        payload: { expected_revision: draft.config_revision },
      });
      setTestMessage(`Modelo local ${verified.credential.model} verificado.`);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "No se pudo conectar con Ollama.");
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
    try {
      const draft = await updateModel.mutateAsync({
        provider: catalogEntry.provider,
        payload: {
          model: resolvedModel,
          base_url: baseUrl.trim(),
          expected_revision: credential.config_revision,
        },
      });
      const verified = await test.mutateAsync({
        provider: catalogEntry.provider,
        payload: { expected_revision: draft.config_revision },
      });
      setTestMessage(`Modelo ${verified.credential.model} guardado y verificado.`);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Error al guardar el modelo.");
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
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Error al activar el proveedor.");
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
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Error al eliminar la clave.");
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
    } catch (e: any) {
      setTestMessage(null);
      setError(e?.response?.data?.detail ?? "No se pudo conectar con este proveedor.");
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
              onChange={(e) => setModelChoice(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            >
              <option value="">Selecciona un modelo</option>
              {modelOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                  {!isOllama && m.free ? " — gratis" : ""}
                </option>
              ))}
              {!isOllama && <option value={CUSTOM_MODEL_VALUE}>Personalizado…</option>}
            </select>
            {modelChoice === CUSTOM_MODEL_VALUE && !isOllama && (
              <input
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
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
          </div>
      )}

      {!isOllama && (
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
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={catalogEntry.default_base_url ?? "URL base personalizada"}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {testMessage && <p className="text-sm text-green-600">{testMessage}</p>}

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
                disabled={activate.isPending || !isVerified}
              >
                {activate.isPending ? "..." : "Activar"}
              </Button>
            )}
            {credential?.is_active && (
              <Button
                variant="secondary"
                onClick={() => deactivateAll.mutate()}
                disabled={deactivateAll.isPending}
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
                <Button onClick={handleSaveModel} disabled={verifying || changingKey}>
                  {verifying ? "Verificando..." : "Guardar y verificar modelo"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleTest}
                  disabled={test.isPending || changingKey}
                >
                  {test.isPending ? "Probando..." : "Probar configuración guardada"}
                </Button>
                {!credential.is_active ? (
                  <Button
                    variant="secondary"
                    onClick={handleActivate}
                    disabled={activate.isPending || !isVerified || changingKey}
                  >
                    {activate.isPending ? "..." : "Activar"}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => deactivateAll.mutate()}
                    disabled={deactivateAll.isPending}
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
          <Button variant="danger" onClick={handleDelete} disabled={deleteCredential.isPending}>
            Eliminar
          </Button>
        )}
      </div>
    </Card>
  );
}
