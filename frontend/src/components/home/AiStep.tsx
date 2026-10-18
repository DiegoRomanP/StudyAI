import { useState } from "react";
import { Bot, ExternalLink, KeyRound, Server, TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";

import type { ProviderCatalogEntry } from "../../api/types";
import { useLlmCredentials, useLlmRuntime, useProviderCatalog } from "../../hooks/queries";
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
import { Button, IconTile, SegmentedControl, Spinner } from "../ui";
import { CopyableCommand } from "./CopyableCommand";

export type AiReadiness =
  | { status: "pending" }
  | { status: "unknown" }
  | { status: "needs-setup" }
  | { status: "ready"; title: string; detail: string; bundled: boolean };

/**
 * Whether the AI step is complete. A real provider (the learner's key, a local model or the
 * server's own key) counts; the demo mode counts only after the learner chose it on purpose,
 * so nobody lands on example content without knowing it.
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
    return { status: "ready", title: "IA incluida", detail: "Gratis, con uso limitado.", bundled: true };
  }
  return {
    status: "ready",
    title: resolved.kind === "env" ? `Usando ${resolved.label} del servidor` : `Usando ${resolved.label}`,
    detail: `Modelo: ${resolved.model}`,
    bundled: false,
  };
}

type Path = "have-key" | "get-key" | "ollama";

/**
 * Step "Conecta tu IA" of the setup wizard. With nothing configured it offers three ways to
 * get one (paste a key, learn how to get a key, install Ollama) and, as a deliberate last
 * option, the demo mode. The save → test → activate flow is the same as in Conectar IA.
 */
export function AiStep({ startChanging = false }: { startChanging?: boolean }) {
  const catalogQuery = useProviderCatalog();
  const credentialsQuery = useLlmCredentials();
  const runtimeQuery = useLlmRuntime();
  const readiness = useAiReadiness();
  const { accept: acceptDemo } = useDemoAccepted();
  const [path, setPath] = useState<Path>("have-key");
  const [changing, setChanging] = useState(startChanging);
  const [selectedProvider, setSelectedProvider] = useState<ProviderCatalogEntry["provider"] | null>(null);

  const catalog = catalogQuery.data;
  const runtimeRefreshing = runtimeQuery.isPending || runtimeQuery.isFetching || catalogQuery.isPending;
  const confirmedProvider = getConfirmedRuntimeProvider(runtimeQuery.data, catalog, {
    isRefreshing: runtimeRefreshing,
    error: runtimeQuery.error ?? catalogQuery.error,
  });
  const resolved = resolveLlmRuntime(runtimeQuery.data, catalog);
  const keyProviders = (catalog ?? []).filter((entry) => entry.requires_api_key);
  const selectedEntry = keyProviders.find((entry) => entry.provider === selectedProvider);
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

  if (readiness.status === "ready" && !changing) {
    const Icon = resolved.kind === "env" ? Server : resolved.kind === "mock" ? Bot : KeyRound;
    return (
      <div className="space-y-3">
        <div aria-live="polite" className="flex items-center gap-3">
          <IconTile icon={Icon} className="h-9 w-9" />
          <div className="min-w-0">
            <p className="font-medium text-text-primary">{readiness.title}</p>
            <p className="text-sm text-text-muted">{readiness.detail}</p>
          </div>
        </div>
        {resolved.kind !== "unknown" && "fallbackReason" in resolved && resolved.fallbackReason && (
          <p className="text-sm text-state-warning">{resolved.fallbackReason}</p>
        )}
        <Button type="button" variant="ghost" className="!min-h-10" onClick={() => setChanging(true)}>
          Usar otra IA
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SegmentedControl
        appearance="chips"
        label="Cómo conectar tu IA"
        value={path}
        onChange={setPath}
        options={[
          { value: "have-key", label: "Ya tengo una API key" },
          { value: "get-key", label: "Aún no tengo API key" },
          { value: "ollama", label: "Usar Ollama (gratis)" },
        ]}
      />

      {path === "have-key" && (
        <div className="space-y-3 rounded-surface border border-line bg-surface-subtle/50 p-3">
          <SegmentedControl
            appearance="chips"
            label="Proveedores disponibles"
            value={selectedProvider ?? ""}
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
          <Link to="/settings" className="inline-flex min-h-11 items-center text-sm text-action hover:underline">
            Más opciones
          </Link>
        </div>
      )}

      {path === "get-key" && (
        <div className="space-y-4 rounded-surface border border-line bg-surface-subtle/50 p-3">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-text-primary">
            {KEY_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <ul aria-label="Dónde conseguir una API key" className="space-y-2">
            {KEY_SOURCES.map((source) => {
              const label = catalog?.find((entry) => entry.provider === source.provider)?.label ?? source.provider;
              return (
                <li key={source.provider} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
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
          <Button type="button" variant="secondary" onClick={() => setPath("have-key")}>
            Ya tengo mi clave
          </Button>
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

      {(readiness.status === "needs-setup" || changing) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-sm text-text-muted">
          {readiness.status === "needs-setup" && (
            <>
              <span>¿Solo probar?</span>
              <Button type="button" variant="ghost" className="!min-h-10" onClick={acceptDemo}>
                Seguir en modo demo
              </Button>
              <span className="basis-full text-xs">
                Contenido de ejemplo, sin IA real.
              </span>
            </>
          )}
          {changing && (
            <Button type="button" variant="ghost" className="!min-h-10" onClick={() => setChanging(false)}>
              Cancelar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
