import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LLMCredentialDTO, ProviderCatalogEntry } from "../api/types";

const api = vi.hoisted(() => ({
  listProviderCatalog: vi.fn(),
  listLlmCredentials: vi.fn(),
  listOllamaModels: vi.fn(),
  updateLlmCredentialModel: vi.fn(),
  testLlmCredential: vi.fn(),
  deactivateAllLlmCredentials: vi.fn(),
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
    });
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
      expect(screen.getByText("Sin proveedor activo")).toBeInTheDocument();
    });
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
    api.deactivateAllLlmCredentials.mockRejectedValue({
      isAxiosError: true,
      response: { data: { detail: "No se pudo desactivar el proveedor." } },
    });
    renderSettings();

    await screen.findByText("OpenAI");
    fireEvent.click(screen.getByRole("button", { name: "Volver a modo demo" }));

    expect(await screen.findByText("No se pudo desactivar el proveedor.")).toBeInTheDocument();
  });
});
