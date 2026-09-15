import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LLMCredentialDTO, ProviderCatalogEntry } from "../api/types";

const api = vi.hoisted(() => ({
  listProviderCatalog: vi.fn(),
  listLlmCredentials: vi.fn(),
  getLlmRuntime: vi.fn(),
  saveLlmCredential: vi.fn(),
  listOllamaModels: vi.fn(),
  updateLlmCredentialModel: vi.fn(),
  testLlmCredential: vi.fn(),
  activateLlmCredential: vi.fn(),
  deactivateAllLlmCredentials: vi.fn(),
  deleteLlmCredential: vi.fn(),
}));

vi.mock("../api/endpoints", () => ({ api }));

import { SettingsPage } from "../pages/SettingsPage";

const catalog: ProviderCatalogEntry = {
  provider: "OPENAI",
  label: "OpenAI",
  requires_model_selection: true,
  default_model: "gpt-4o-mini",
  default_base_url: "https://api.openai.com/v1",
  common_models: [{ id: "gpt-4o-mini", free: false }],
  key_placeholder: "sk-...",
  requires_api_key: true,
  supports_model_discovery: false,
};

const credential: LLMCredentialDTO = {
  provider: "OPENAI",
  label: "OpenAI",
  masked_api_key: "sk-...abcd",
  model: "gpt-4o-mini",
  base_url: "https://proxy-a.example/v1",
  is_active: false,
  config_revision: 7,
  is_verified: true,
  verified_at: "2026-09-13T00:00:00Z",
  requires_model_selection: true,
  requires_api_key: true,
  supports_model_discovery: false,
  created_at: "2026-09-13T00:00:00Z",
};

function renderSettings() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsPage />
    </QueryClientProvider>,
  );
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listProviderCatalog.mockResolvedValue([catalog]);
    api.listLlmCredentials.mockResolvedValue([credential]);
    api.deactivateAllLlmCredentials.mockResolvedValue(undefined);
    api.saveLlmCredential.mockResolvedValue(credential);
    api.activateLlmCredential.mockResolvedValue(credential);
    api.deleteLlmCredential.mockResolvedValue(undefined);
    api.getLlmRuntime.mockResolvedValue({
      source: "MOCK",
      provider: null,
      models: {
        topic_analysis: "simulado",
        session_plan: "simulado",
        session_content: "simulado",
      },
      fallback_reason: null,
    });
    api.updateLlmCredentialModel.mockResolvedValue({
      ...credential,
      base_url: "https://proxy-b.example/v1",
      config_revision: 8,
      is_verified: false,
    });
    api.testLlmCredential.mockResolvedValue({
      ok: true,
      credential: {
        ...credential,
        base_url: "https://proxy-b.example/v1",
        config_revision: 8,
      },
    });
  });

  it("persists URL B before testing the returned revision", async () => {
    renderSettings();

    await screen.findByText("OpenAI");
    fireEvent.change(screen.getByPlaceholderText("https://api.openai.com/v1"), {
      target: { value: "https://proxy-b.example/v1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar y verificar modelo" }));

    await waitFor(() => {
      expect(api.updateLlmCredentialModel).toHaveBeenCalledWith("OPENAI", {
        model: "gpt-4o-mini",
        base_url: "https://proxy-b.example/v1",
        expected_revision: 7,
      });
      expect(api.testLlmCredential).toHaveBeenCalledWith("OPENAI", {
        expected_revision: 8,
      });
      expect(api.getLlmRuntime.mock.calls.length).toBeGreaterThan(1);
    });
  });

  it("invalidates runtime after saving a model draft before its test completes", async () => {
    api.testLlmCredential.mockRejectedValue({
      isAxiosError: true,
      response: { data: { detail: "No se pudo verificar el borrador." } },
    });
    renderSettings();

    await screen.findByText("OpenAI");
    fireEvent.click(screen.getByRole("button", { name: "Guardar y verificar modelo" }));

    await waitFor(() => {
      expect(api.updateLlmCredentialModel).toHaveBeenCalledTimes(1);
      expect(api.testLlmCredential).toHaveBeenCalledTimes(1);
      expect(api.getLlmRuntime).toHaveBeenCalledTimes(2);
    });
  });

  it("invalidates runtime after saving a credential", async () => {
    api.listLlmCredentials.mockResolvedValue([]);
    renderSettings();

    await screen.findByText("OpenAI");
    fireEvent.change(screen.getByPlaceholderText("sk-..."), { target: { value: "sk-test-1234567890" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar clave" }));

    await waitFor(() => {
      expect(api.saveLlmCredential).toHaveBeenCalledWith("OPENAI", {
        api_key: "sk-test-1234567890",
      });
      expect(api.getLlmRuntime).toHaveBeenCalledTimes(2);
    });
  });

  it("invalidates runtime after verifying the saved configuration", async () => {
    renderSettings();

    await screen.findByText("OpenAI");
    fireEvent.click(screen.getByRole("button", { name: "Probar configuración guardada" }));

    await waitFor(() => {
      expect(api.testLlmCredential).toHaveBeenCalledWith("OPENAI", { expected_revision: 7 });
      expect(api.getLlmRuntime).toHaveBeenCalledTimes(2);
    });
  });

  it("invalidates runtime after activating a credential", async () => {
    renderSettings();

    await screen.findByText("OpenAI");
    fireEvent.click(screen.getByRole("button", { name: "Activar" }));

    await waitFor(() => {
      expect(api.activateLlmCredential).toHaveBeenCalledWith("OPENAI", 7);
      expect(api.getLlmRuntime).toHaveBeenCalledTimes(2);
    });
  });

  it("invalidates runtime after deleting a credential", async () => {
    const confirmation = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderSettings();

    await screen.findByText("OpenAI");
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() => {
      expect(api.deleteLlmCredential).toHaveBeenCalledWith("OPENAI");
      expect(api.getLlmRuntime).toHaveBeenCalledTimes(2);
    });
    confirmation.mockRestore();
  });

  it("refreshes credentials after authentication failure revokes the saved configuration", async () => {
    api.listLlmCredentials
      .mockResolvedValueOnce([{ ...credential, is_active: true }])
      .mockResolvedValueOnce([{ ...credential, is_active: false, is_verified: false }]);
    api.testLlmCredential.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 502,
        data: {
          detail: "El proveedor de IA rechazó la autenticación. Revisa o reemplaza la clave.",
          code: "LLM_AUTHENTICATION_FAILED",
        },
      },
    });
    renderSettings();

    await screen.findByText("OpenAI");
    fireEvent.click(screen.getByRole("button", { name: "Probar configuración guardada" }));

    await waitFor(() => {
      expect(api.listLlmCredentials).toHaveBeenCalledTimes(2);
      expect(api.getLlmRuntime).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Modo demo (LLM simulado, sin costo)")).toBeInTheDocument();
    });
  });

  it.each([
    ["LLM_OUTPUT_LIMIT", "El proveedor agotó el presupuesto de salida."],
    ["LLM_REFUSED", "El proveedor rechazó generar la respuesta."],
  ])("renders the safe %s diagnostic", async (code, detail) => {
    api.testLlmCredential.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 502,
        data: {
          detail,
          code,
          provider: "OPENAI",
          upstream_status: null,
          retryable: false,
          retry_after_seconds: null,
        },
      },
    });
    renderSettings();

    await screen.findByText("OpenAI");
    fireEvent.click(screen.getByRole("button", { name: "Probar configuración guardada" }));

    expect(await screen.findByText(detail)).toBeInTheDocument();
  });

  it("shows an actionable error when the settings queries fail", async () => {
    api.listProviderCatalog.mockRejectedValue({
      isAxiosError: true,
      response: { data: { detail: "No se pudo cargar el catálogo." } },
    });
    renderSettings();

    expect(await screen.findByText("No se pudo cargar el catálogo.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("shows an error when deactivating the active credential fails", async () => {
    api.listLlmCredentials.mockResolvedValue([{ ...credential, is_active: true }]);
    api.getLlmRuntime.mockResolvedValue({
      source: "USER",
      provider: "OPENAI",
      models: {
        topic_analysis: "gpt-4o-mini",
        session_plan: "gpt-4o-mini",
        session_content: "gpt-4o-mini",
      },
      fallback_reason: null,
    });
    api.deactivateAllLlmCredentials.mockRejectedValue({
      isAxiosError: true,
      response: { data: { detail: "No se pudo desactivar el proveedor." } },
    });
    renderSettings();

    await screen.findByText("OpenAI");
    fireEvent.click(screen.getByRole("button", { name: "Usar configuración del servidor" }));

    expect(await screen.findByText("No se pudo desactivar el proveedor.")).toBeInTheDocument();
  });

  it("refreshes the runtime source after deactivating a user credential", async () => {
    api.getLlmRuntime
      .mockResolvedValueOnce({
        source: "USER",
        provider: "OPENAI",
        models: {
          topic_analysis: "gpt-4o-mini",
          session_plan: "gpt-4o-mini",
          session_content: "gpt-4o-mini",
        },
        fallback_reason: null,
      })
      .mockResolvedValueOnce({
        source: "ENV",
        provider: "ANTHROPIC",
        models: {
          topic_analysis: "claude-plan",
          session_plan: "claude-plan",
          session_content: "claude-plan",
        },
        fallback_reason: null,
      });
    renderSettings();

    await screen.findByRole("button", { name: "Usar configuración del servidor" });
    fireEvent.click(screen.getByRole("button", { name: "Usar configuración del servidor" }));

    expect(await screen.findByText("Configuración del servidor")).toBeInTheDocument();
    expect(api.getLlmRuntime).toHaveBeenCalledTimes(2);
  });

  it("shows demo mode after deactivation when no server provider is available", async () => {
    api.getLlmRuntime
      .mockResolvedValueOnce({
        source: "USER",
        provider: "OPENAI",
        models: {
          topic_analysis: "gpt-4o-mini",
          session_plan: "gpt-4o-mini",
          session_content: "gpt-4o-mini",
        },
        fallback_reason: null,
      })
      .mockResolvedValueOnce({
        source: "MOCK",
        provider: null,
        models: {
          topic_analysis: "simulado",
          session_plan: "simulado",
          session_content: "simulado",
        },
        fallback_reason: null,
      });
    renderSettings();

    await screen.findByRole("button", { name: "Usar configuración del servidor" });
    fireEvent.click(screen.getByRole("button", { name: "Usar configuración del servidor" }));

    expect(await screen.findByText("Modo demo (LLM simulado, sin costo)")).toBeInTheDocument();
    expect(api.getLlmRuntime).toHaveBeenCalledTimes(2);
  });

  it("shows the Anthropic server configuration instead of demo mode", async () => {
    api.getLlmRuntime.mockResolvedValue({
      source: "ENV",
      provider: "ANTHROPIC",
      models: {
        topic_analysis: "claude-plan",
        session_plan: "claude-plan",
        session_content: "claude-plan",
      },
      fallback_reason: null,
    });
    renderSettings();

    expect(await screen.findByText("Configuración del servidor")).toBeInTheDocument();
    expect(screen.getByText(/ANTHROPIC/)).toBeInTheDocument();
    expect(screen.queryByText("Modo demo (LLM simulado, sin costo)")).not.toBeInTheDocument();
  });

  it("renders the safe runtime fallback reason", async () => {
    api.getLlmRuntime.mockResolvedValue({
      source: "ENV",
      provider: "ANTHROPIC",
      models: {
        topic_analysis: "claude-plan",
        session_plan: "claude-plan",
        session_content: "claude-plan",
      },
      fallback_reason: "La configuración activa no está disponible; se aplicó la configuración del servidor.",
    });
    renderSettings();

    expect(
      await screen.findByText(
        "La configuración activa no está disponible; se aplicó la configuración del servidor.",
      ),
    ).toBeInTheDocument();
  });

  it("does not render demo mode for an incompatible runtime source", async () => {
    api.getLlmRuntime.mockResolvedValue({
      source: "FUTURE_PROVIDER",
      provider: null,
      models: {
        topic_analysis: "unknown",
        session_plan: "unknown",
        session_content: "unknown",
      },
      fallback_reason: null,
    });
    renderSettings();

    expect(await screen.findByText("Proveedor efectivo desconocido")).toBeInTheDocument();
    expect(screen.queryByText("Modo demo (LLM simulado, sin costo)")).not.toBeInTheDocument();
  });

  it("shows an unknown state for incomplete runtime models", async () => {
    api.getLlmRuntime.mockResolvedValue({
      source: "MOCK",
      provider: null,
      models: {
        topic_analysis: "simulado",
        session_plan: "simulado",
        session_content: "",
      },
      fallback_reason: null,
    });
    renderSettings();

    expect(await screen.findByText("Proveedor efectivo desconocido")).toBeInTheDocument();
    expect(screen.queryByText("Modo demo (LLM simulado, sin costo)")).not.toBeInTheDocument();
  });

  it("shows an unknown state for a mock source with inconsistent provider metadata", async () => {
    api.getLlmRuntime.mockResolvedValue({
      source: "MOCK",
      provider: "OPENAI",
      models: {
        topic_analysis: "simulado",
        session_plan: "simulado",
        session_content: "simulado",
      },
      fallback_reason: null,
    });
    renderSettings();

    expect(await screen.findByText("Proveedor efectivo desconocido")).toBeInTheDocument();
    expect(screen.queryByText("Modo demo (LLM simulado, sin costo)")).not.toBeInTheDocument();
  });

  it("hides cached fallback information after a runtime refetch fails", async () => {
    api.getLlmRuntime.mockReset();
    api.getLlmRuntime
      .mockResolvedValueOnce({
        source: "USER",
        provider: "OPENAI",
        models: {
          topic_analysis: "gpt-4o-mini",
          session_plan: "gpt-4o-mini",
          session_content: "gpt-4o-mini",
        },
        fallback_reason: "Información de fallback anterior.",
      })
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { data: { detail: "No se pudo consultar el proveedor efectivo." } },
      });
    renderSettings();

    await screen.findByRole("button", { name: "Usar configuración del servidor" });
    fireEvent.click(screen.getByRole("button", { name: "Usar configuración del servidor" }));

    expect(await screen.findByText("Proveedor efectivo desconocido")).toBeInTheDocument();
    expect(screen.queryByText("Información de fallback anterior.")).not.toBeInTheDocument();
  });

  it("marks the effective provider as unknown when the runtime query fails", async () => {
    api.getLlmRuntime.mockRejectedValue({
      isAxiosError: true,
      response: { data: { detail: "No se pudo consultar el proveedor efectivo." } },
    });
    renderSettings();

    expect(await screen.findByText("Proveedor efectivo desconocido")).toBeInTheDocument();
    expect(screen.queryByText("Modo demo (LLM simulado, sin costo)")).not.toBeInTheDocument();
  });
});
