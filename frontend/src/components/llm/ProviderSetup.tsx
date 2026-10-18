import { ChevronDown } from "lucide-react";

import { getApiErrorMessage } from "../../api/errors";
import type { LLMCredentialDTO, ProviderCatalogEntry } from "../../api/types";
import { Badge, Button, Card, Input, Select } from "../ui";
import { useProviderSetup } from "../../hooks/useProviderSetup";

export type ProviderSetupVariant = "compact" | "advanced";

interface ProviderSetupProps {
  catalogEntry: ProviderCatalogEntry;
  credential?: LLMCredentialDTO;
  isRuntimeActive: boolean;
  refreshCredentials: () => Promise<{ data?: LLMCredentialDTO[]; error?: unknown }>;
  variant?: ProviderSetupVariant;
}

export function ProviderSetup({
  catalogEntry,
  credential,
  isRuntimeActive,
  refreshCredentials,
  variant = "compact",
}: ProviderSetupProps) {
  const setup = useProviderSetup({
    catalogEntry,
    credential,
    isRuntimeActive,
    refreshCredentials,
    startAdvancedExpanded: variant === "advanced",
  });
  const providerId = catalogEntry.provider.toLowerCase();
  const modelFieldVisible =
    catalogEntry.requires_model_selection && (Boolean(credential) || !catalogEntry.requires_api_key);

  // Why a button is disabled, shown under the buttons and linked with aria-describedby.
  // Transient "operation pending" states are not explained: they clear by themselves.
  const missingModel = catalogEntry.requires_model_selection && !setup.resolvedModel;
  const modelReason = missingModel
    ? "Elige un modelo de la lista o escribe su ID."
    : setup.changingKey && catalogEntry.requires_api_key
      ? "Guarda la clave nueva antes de cambiar el modelo."
      : null;
  const activateReason = setup.changingKey
    ? "Guarda la clave nueva antes de activar."
    : setup.hasUnsupportedStoredModel
      ? "Este modelo ya no está disponible: elige otro y guárdalo."
      : !setup.isVerifiedForDraft
        ? catalogEntry.requires_api_key
          ? "Primero pulsa «Probar configuración guardada»."
          : "Primero pulsa «Guardar y verificar modelo»."
        : null;
  const clearUrlReason = setup.resolvedModel
    ? null
    : "Elige un modelo primero: se guardará junto con la dirección predeterminada.";
  const showsActivate = Boolean(credential) && !setup.isActive && !setup.isStoredActive;
  const showsModelSave = !catalogEntry.requires_api_key || Boolean(credential);
  const modelReasonId = `provider-${providerId}-model-reason`;
  const activateReasonId = `provider-${providerId}-activate-reason`;
  const clearUrlReasonId = `provider-${providerId}-clear-url-reason`;

  return (
    <section
      aria-label={`Configuración de ${catalogEntry.label}`}
      data-variant={variant}
      className="min-w-0"
    >
      <Card className={variant === "compact" ? "space-y-3 !p-4" : "space-y-4"}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-text-primary">{catalogEntry.label}</h2>
            {credential ? (
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-muted">
                <span className="font-mono text-xs">
                  {catalogEntry.requires_api_key ? credential.masked_api_key : "Modelo local"}
                </span>
                <Badge color={setup.isVerifiedForDraft ? "green" : "amber"}>
                  {setup.isVerifiedForDraft ? "Verificada" : "Sin verificar"}
                </Badge>
              </div>
            ) : (
              <p className="mt-1 text-sm text-text-muted">
                {catalogEntry.requires_api_key ? "Todavía no está configurada" : "Configura un modelo local"}
              </p>
            )}
          </div>
          {setup.isActive && <Badge color="green">Activo</Badge>}
        </div>

        {setup.showKeyForm && (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
            <Input
              id={`provider-${providerId}-api-key`}
              label="Clave de API"
              hint="Se envía al servidor para almacenarse de forma cifrada; no se vuelve a mostrar."
              type={setup.showKey ? "text" : "password"}
              value={setup.apiKey}
              onChange={(event) => setup.handleApiKeyChange(event.target.value)}
              placeholder={catalogEntry.key_placeholder}
              autoComplete="new-password"
              spellCheck={false}
              disabled={setup.operationPending}
            />
            <Button
              variant="secondary"
              type="button"
              aria-pressed={setup.showKey}
              onClick={() => setup.setShowKey((visible) => !visible)}
              disabled={setup.operationPending}
              className="mb-0.5"
            >
              {setup.showKey ? "Ocultar" : "Mostrar"}
            </Button>
          </div>
        )}

        {modelFieldVisible && (
          <div className="space-y-2">
            <Select
              id={`provider-${providerId}-model`}
              label="Modelo"
              hint={
                catalogEntry.supports_model_discovery
                  ? "Elige un modelo disponible en el servidor del proveedor."
                  : "El modelo sugerido viene del catálogo del servidor."
              }
              value={setup.modelChoice}
              onChange={(event) => {
                setup.setModelChoice(event.target.value);
                setup.markDraftChanged();
              }}
              disabled={setup.operationPending || setup.isDiscoveryLoading}
            >
              <option value="">Selecciona un modelo</option>
              {setup.modelOptions.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.id}
                  {!catalogEntry.supports_model_discovery && model.free ? " — gratis" : ""}
                </option>
              ))}
              {setup.canUseCustomModel && <option value="__custom__">Personalizado…</option>}
            </Select>

            {setup.modelChoice === "__custom__" && setup.canUseCustomModel && (
              <Input
                id={`provider-${providerId}-custom-model`}
                label="ID exacto del modelo"
                hint="Escribe el identificador tal como lo espera el proveedor."
                value={setup.customModel}
                onChange={(event) => {
                  setup.setCustomModel(event.target.value);
                  setup.markDraftChanged();
                }}
                disabled={setup.operationPending}
              />
            )}

            {catalogEntry.supports_model_discovery && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-text-muted">
                <span>
                  {setup.modelOptions.length} modelos disponibles
                </span>
                <Button
                  variant="ghost"
                  type="button"
                  className="px-2 py-2 text-action"
                  onClick={() => void setup.refetchDiscoveredModels()}
                  disabled={setup.operationPending || setup.isDiscoveryLoading}
                >
                  Actualizar modelos
                </Button>
              </div>
            )}

            {catalogEntry.supports_model_discovery && setup.discoveryError && (
              <p className="text-sm text-state-error" role="alert">
                {getApiErrorMessage(setup.discoveryError, "No se pudieron descubrir los modelos disponibles.")}
              </p>
            )}

            {setup.hasUnsupportedStoredModel && (
              <p className="text-sm text-state-warning" role="status">
                El modelo guardado ya no es compatible. Selecciona un modelo validado y vuelve a verificarlo.
              </p>
            )}
          </div>
        )}

        {catalogEntry.supports_custom_base_url && (
          <div>
            <button
              type="button"
              aria-expanded={setup.showAdvanced}
              aria-controls={`provider-${providerId}-advanced-options`}
              onClick={() => setup.setShowAdvanced((visible) => !visible)}
              className="inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-sm font-medium text-text-muted hover:text-text-primary"
            >
              <ChevronDown
                aria-hidden="true"
                className={`h-4 w-4 transition-transform duration-[var(--motion-micro)] motion-reduce:transition-none ${
                  setup.showAdvanced ? "rotate-180" : ""
                }`}
              />
              Configuración avanzada
            </button>
            <div
              id={`provider-${providerId}-advanced-options`}
              className="mt-2"
              hidden={!setup.showAdvanced}
            >
              <Input
                id={`provider-${providerId}-base-url`}
                label="URL base personalizada"
                hint="Déjala vacía para usar la dirección predeterminada del catálogo."
                type="url"
                value={setup.baseUrl}
                onChange={(event) => {
                  setup.setBaseUrl(event.target.value);
                  setup.markDraftChanged();
                }}
                placeholder={catalogEntry.default_base_url ?? "https://…"}
                disabled={setup.operationPending}
                autoComplete="url"
                spellCheck={false}
              />
            </div>
          </div>
        )}

        {credential?.base_url && !catalogEntry.supports_custom_base_url && (
          <div className="space-y-2 rounded-control border border-state-warning bg-state-warning-subtle p-3 text-sm text-state-warning">
            <p>
              El catálogo actual no permite esta URL base guardada: <span className="break-all font-mono text-xs">{credential.base_url}</span>
            </p>
            <Button
              variant="secondary"
              type="button"
              onClick={setup.handleClearUnsupportedBaseUrl}
              disabled={setup.operationPending || !setup.resolvedModel}
              aria-describedby={clearUrlReason ? clearUrlReasonId : undefined}
            >
              Eliminar URL personalizada
            </Button>
            {clearUrlReason && <p id={clearUrlReasonId}>{clearUrlReason}</p>}
          </div>
        )}

        {setup.isStoredActive && !setup.isActive && (
          <p className="text-sm text-state-warning" role="status">
            Guardada como activa, pero el servidor no confirma que la esté usando.
          </p>
        )}
        {setup.error && <p className="text-sm text-state-error" role="alert">{setup.error}</p>}
        {setup.testMessage && <p className="text-sm text-state-success" role="status">{setup.testMessage}</p>}

        {setup.hasRemoteConflict && credential && (
          <div className="flex flex-col items-start gap-2 rounded-control border border-state-warning bg-state-warning-subtle p-3 text-sm text-state-warning sm:flex-row sm:items-center">
            <span>La configuración cambió en otra pestaña. Tu borrador local no se sobrescribió.</span>
            <Button
              variant="secondary"
              type="button"
              onClick={setup.handleUseRemoteConfiguration}
              disabled={setup.operationPending}
              className="px-3 py-2"
            >
              Usar configuración remota
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {setup.showKeyForm && (
            <Button type="button" onClick={setup.handleSaveKey} disabled={setup.verifying}>
              {setup.activeAction === "save-key" ? "Guardando…" : "Guardar clave"}
            </Button>
          )}

          {!catalogEntry.requires_api_key && (
            <Button
              type="button"
              onClick={setup.handleConfigureWithoutKey}
              disabled={setup.verifying || (catalogEntry.requires_model_selection && !setup.resolvedModel)}
              aria-describedby={missingModel ? modelReasonId : undefined}
            >
              {setup.activeAction === "configure"
                ? "Verificando…"
                : credential
                  ? "Guardar y verificar modelo"
                  : "Conectar y verificar modelo"}
            </Button>
          )}

          {credential && catalogEntry.requires_api_key && (
            <Button
              type="button"
              onClick={setup.handleSaveModel}
              disabled={setup.operationPending || setup.changingKey || !setup.resolvedModel && catalogEntry.requires_model_selection}
              aria-describedby={modelReason ? modelReasonId : undefined}
            >
              {setup.activeAction === "save-model" ? "Verificando…" : "Guardar y verificar modelo"}
            </Button>
          )}

          {credential && catalogEntry.requires_api_key && (
            <Button
              variant="secondary"
              type="button"
              onClick={setup.handleTest}
              disabled={setup.operationPending || setup.changingKey}
            >
              {setup.activeAction === "test" ? "Probando…" : "Probar configuración guardada"}
            </Button>
          )}

          {credential && !setup.isActive && !setup.isStoredActive && (
            <Button
              variant="secondary"
              type="button"
              onClick={setup.handleActivate}
              disabled={
                setup.operationPending ||
                !setup.isVerifiedForDraft ||
                setup.changingKey ||
                setup.hasUnsupportedStoredModel
              }
              aria-describedby={activateReason ? activateReasonId : undefined}
            >
              {setup.activeAction === "activate" ? "Activando…" : "Activar"}
            </Button>
          )}

          {credential && (setup.isActive || setup.isStoredActive) && (
            <Button
              variant="secondary"
              type="button"
              onClick={setup.handleDeactivate}
              disabled={setup.operationPending}
            >
              {setup.activeAction === "deactivate" ? "Desactivando…" : "Desactivar"}
            </Button>
          )}

          {credential && catalogEntry.requires_api_key && !setup.changingKey && (
            <Button
              variant="secondary"
              type="button"
              onClick={setup.handleChangeKey}
              disabled={setup.operationPending}
            >
              Cambiar clave
            </Button>
          )}

          {credential && setup.changingKey && (
            <Button
              variant="secondary"
              type="button"
              onClick={setup.handleCancelChangeKey}
              disabled={setup.operationPending}
            >
              Cancelar
            </Button>
          )}

          {credential && (
            <Button variant="danger" type="button" onClick={setup.handleDelete} disabled={setup.operationPending}>
              {setup.activeAction === "delete" ? "Eliminando…" : "Eliminar"}
            </Button>
          )}
        </div>

        {((showsModelSave && modelReason) || (showsActivate && activateReason)) && (
          <div className="space-y-1 text-sm text-text-muted">
            {showsModelSave && modelReason && <p id={modelReasonId}>{modelReason}</p>}
            {showsActivate && activateReason && <p id={activateReasonId}>{activateReason}</p>}
          </div>
        )}
      </Card>
    </section>
  );
}
