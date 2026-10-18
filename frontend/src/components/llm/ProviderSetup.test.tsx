import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LLMCredentialDTO, ProviderCatalogEntry } from "../../api/types";

const api = vi.hoisted(() => ({
  saveLlmCredential: vi.fn(),
  listProviderModels: vi.fn(),
  updateLlmCredentialModel: vi.fn(),
  testLlmCredential: vi.fn(),
  activateLlmCredential: vi.fn(),
  deactivateAllLlmCredentials: vi.fn(),
  deleteLlmCredential: vi.fn(),
}));

vi.mock("../../api/endpoints", () => ({ api }));

import { ProviderSetup } from "./ProviderSetup";

const openAiCatalog: ProviderCatalogEntry = {
  provider: "OPENAI",
  label: "OpenAI",
  requires_model_selection: true,
  default_model: "gpt-4o-mini",
  default_base_url: "https://api.openai.com/v1",
  common_models: [{ id: "gpt-4o-mini", free: false }],
  key_placeholder: "sk-...",
  requires_api_key: true,
  supports_model_discovery: false,
  supports_custom_base_url: true,
  allows_custom_model: true,
};

const openAiCredential: LLMCredentialDTO = {
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
  supports_custom_base_url: true,
  allows_custom_model: true,
  created_at: "2026-09-13T00:00:00Z",
};

function renderSetup(options: {
  catalogEntry?: ProviderCatalogEntry;
  credential?: LLMCredentialDTO;
  variant?: "compact" | "advanced";
  isRuntimeActive?: boolean;
} = {}) {
  const catalogEntry = options.catalogEntry ?? openAiCatalog;
  const credential = Object.prototype.hasOwnProperty.call(options, "credential")
    ? options.credential
    : openAiCredential;
  const variant = options.variant ?? "advanced";
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ProviderSetup
          catalogEntry={catalogEntry}
          credential={credential}
          isRuntimeActive={options.isRuntimeActive ?? false}
          refreshCredentials={async () => ({ data: credential ? [credential] : [] })}
          variant={variant}
        />
      </QueryClientProvider>,
    ),
  };
}

describe("ProviderSetup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.saveLlmCredential.mockResolvedValue(openAiCredential);
    api.updateLlmCredentialModel.mockResolvedValue({
      ...openAiCredential,
      config_revision: 8,
      is_verified: false,
    });
    // A test verifies the saved revision without changing it.
    api.testLlmCredential.mockResolvedValue({
      ok: true,
      credential: { ...openAiCredential, is_verified: true },
    });
    api.activateLlmCredential.mockResolvedValue(openAiCredential);
    api.deactivateAllLlmCredentials.mockResolvedValue(undefined);
    api.deleteLlmCredential.mockResolvedValue(undefined);
  });

  it.each(["compact", "advanced"] as const)("renders the %s presentation variant", async (variant) => {
    renderSetup({ variant });

    const region = await screen.findByRole("region", { name: "Configuración de OpenAI" });
    expect(region).toHaveAttribute("data-variant", variant);
    expect(screen.getByLabelText("Modelo")).toBeInTheDocument();
    const baseUrlField = screen.getByLabelText("URL base personalizada");
    const advancedPanel = baseUrlField.closest("#provider-openai-advanced-options");
    expect(advancedPanel).toBeInTheDocument();
    if (variant === "compact") {
      expect(advancedPanel).toHaveAttribute("hidden");
    } else {
      expect(advancedPanel).not.toHaveAttribute("hidden");
    }
  });

  it("uses the last confirmed revision for draft, test, and activation", async () => {
    const savedDraft = {
      ...openAiCredential,
      base_url: "https://proxy-b.example/v1",
      config_revision: 8,
      is_verified: false,
    };
    api.updateLlmCredentialModel.mockResolvedValue(savedDraft);
    // The server's mark_verified keeps the tested revision.
    api.testLlmCredential.mockResolvedValue({
      ok: true,
      credential: { ...savedDraft, is_verified: true },
    });
    renderSetup();

    fireEvent.change(screen.getByLabelText("URL base personalizada"), {
      target: { value: "https://proxy-b.example/v1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar y verificar modelo" }));

    await waitFor(() => {
      expect(api.updateLlmCredentialModel).toHaveBeenCalledWith("OPENAI", {
        model: "gpt-4o-mini",
        base_url: "https://proxy-b.example/v1",
        expected_revision: 7,
      });
      expect(api.testLlmCredential).toHaveBeenCalledWith("OPENAI", { expected_revision: 8 });
    });

    fireEvent.click(await screen.findByRole("button", { name: "Activar" }));
    await waitFor(() => expect(api.activateLlmCredential).toHaveBeenCalledWith("OPENAI", 8));
    expect(api.updateLlmCredentialModel.mock.invocationCallOrder[0]).toBeLessThan(
      api.testLlmCredential.mock.invocationCallOrder[0],
    );
    expect(api.testLlmCredential.mock.invocationCallOrder[0]).toBeLessThan(
      api.activateLlmCredential.mock.invocationCallOrder[0],
    );
  });

  it("configures a discovered-model provider without requesting an API key", async () => {
    const ollamaCatalog: ProviderCatalogEntry = {
      ...openAiCatalog,
      provider: "OLLAMA",
      label: "Ollama local",
      default_model: "",
      default_base_url: null,
      common_models: [],
      requires_api_key: false,
      supports_model_discovery: true,
      supports_custom_base_url: false,
      allows_custom_model: false,
    };
    const savedCredential: LLMCredentialDTO = {
      ...openAiCredential,
      provider: "OLLAMA",
      label: "Ollama local",
      masked_api_key: "",
      model: "qwen3.5:9b",
      base_url: "",
      config_revision: 1,
      is_verified: false,
      requires_api_key: false,
      supports_model_discovery: true,
      supports_custom_base_url: false,
      allows_custom_model: false,
    };
    api.listProviderModels.mockResolvedValue([
      { id: "qwen3.5:9b", size_bytes: null, parameter_size: null, context_length: null },
    ]);
    api.saveLlmCredential.mockResolvedValue(savedCredential);
    api.updateLlmCredentialModel.mockResolvedValue({ ...savedCredential, config_revision: 2 });
    api.testLlmCredential.mockResolvedValue({
      ok: true,
      credential: { ...savedCredential, config_revision: 2, is_verified: true },
    });
    renderSetup({ catalogEntry: ollamaCatalog, credential: undefined, variant: "compact" });

    await screen.findByRole("option", { name: "qwen3.5:9b" });
    expect(screen.queryByLabelText("Clave de API")).not.toBeInTheDocument();
    // An empty catalog default must not preselect the free-text custom model field.
    expect(screen.getByLabelText("Modelo")).toHaveValue("");
    expect(screen.queryByLabelText("ID exacto del modelo")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Modelo"), { target: { value: "qwen3.5:9b" } });
    fireEvent.click(screen.getByRole("button", { name: "Conectar y verificar modelo" }));

    expect(api.listProviderModels).toHaveBeenCalledWith("OLLAMA");
    expect(screen.queryByRole("option", { name: "Personalizado…" })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(api.saveLlmCredential).toHaveBeenCalledWith("OLLAMA", {});
      expect(api.updateLlmCredentialModel).toHaveBeenCalledWith("OLLAMA", {
        model: "qwen3.5:9b",
        expected_revision: 1,
      });
      expect(api.testLlmCredential).toHaveBeenCalledWith("OLLAMA", { expected_revision: 2 });
    });
  });

  it("omits the base URL when saving Gemini without custom URL support", async () => {
    const geminiCatalog: ProviderCatalogEntry = {
      ...openAiCatalog,
      provider: "GEMINI",
      label: "Google Gemini",
      default_model: "gemini-3.8-flash",
      default_base_url: "https://generativelanguage.googleapis.com/v1beta",
      common_models: [{ id: "gemini-3.8-flash", free: false }],
      supports_custom_base_url: false,
    };
    const geminiCredential: LLMCredentialDTO = {
      ...openAiCredential,
      provider: "GEMINI",
      label: "Google Gemini",
      model: "gemini-3.8-flash",
      base_url: "",
      supports_custom_base_url: false,
    };
    api.updateLlmCredentialModel.mockResolvedValue({
      ...geminiCredential,
      config_revision: 8,
      is_verified: false,
    });
    api.testLlmCredential.mockResolvedValue({
      ok: true,
      credential: { ...geminiCredential, config_revision: 8, is_verified: true },
    });
    renderSetup({ catalogEntry: geminiCatalog, credential: geminiCredential });

    fireEvent.click(screen.getByRole("button", { name: "Guardar y verificar modelo" }));

    await waitFor(() => {
      expect(api.updateLlmCredentialModel).toHaveBeenCalledWith("GEMINI", {
        model: "gemini-3.8-flash",
        expected_revision: 7,
      });
    });
  });

  it("requires a supported model before clearing an unsupported base URL", async () => {
    const supportedModel = "meta/llama-3.3-70b-instruct";
    const nvidiaCatalog: ProviderCatalogEntry = {
      ...openAiCatalog,
      provider: "NVIDIA",
      label: "NVIDIA NIM",
      default_model: supportedModel,
      common_models: [{ id: supportedModel, free: false }],
      supports_custom_base_url: false,
      allows_custom_model: false,
    };
    const historicalCredential: LLMCredentialDTO = {
      ...openAiCredential,
      provider: "NVIDIA",
      label: "NVIDIA NIM",
      model: "nvidia/retired-model",
      base_url: "https://legacy-proxy.example/v1",
      supports_custom_base_url: false,
      allows_custom_model: false,
    };
    api.updateLlmCredentialModel.mockResolvedValue({
      ...historicalCredential,
      model: supportedModel,
      base_url: "",
      config_revision: 8,
      is_verified: false,
    });
    renderSetup({ catalogEntry: nvidiaCatalog, credential: historicalCredential });

    const clearButton = await screen.findByRole("button", { name: "Eliminar URL personalizada" });
    expect(clearButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Modelo"), { target: { value: supportedModel } });
    expect(clearButton).toBeEnabled();
    fireEvent.click(clearButton);

    await waitFor(() => {
      expect(api.updateLlmCredentialModel).toHaveBeenCalledWith("NVIDIA", {
        model: supportedModel,
        base_url: "",
        expected_revision: 7,
      });
    });
  });

  it("does not offer custom models or URLs when the catalog disallows them", async () => {
    const nvidiaCatalog: ProviderCatalogEntry = {
      ...openAiCatalog,
      provider: "NVIDIA",
      label: "NVIDIA NIM",
      default_model: "meta/llama-3.3-70b-instruct",
      common_models: [{ id: "meta/llama-3.3-70b-instruct", free: false }],
      supports_custom_base_url: false,
      allows_custom_model: false,
    };
    renderSetup({ catalogEntry: nvidiaCatalog });

    await screen.findByRole("region", { name: "Configuración de NVIDIA NIM" });

    expect(screen.queryByRole("option", { name: "Personalizado…" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Configuración avanzada" })).not.toBeInTheDocument();
  });

  it("does not keep the submitted API key in the mutation cache after saving", async () => {
    const { queryClient } = renderSetup({ credential: undefined });

    fireEvent.change(screen.getByLabelText("Clave de API"), { target: { value: "sk-secret-value-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar clave" }));

    await waitFor(() => expect(api.saveLlmCredential).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const serialized = JSON.stringify(
        queryClient.getMutationCache().getAll().map((mutation) => mutation.state.variables),
      );
      expect(serialized).not.toContain("sk-secret-value-123");
    });
  });

  it("shows a non-conflict 409 as an error without the remote-change banner", async () => {
    api.activateLlmCredential.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { detail: "Verifica esta configuración antes de activarla.", code: "LLM_NOT_VERIFIED" },
      },
    });
    renderSetup();

    fireEvent.click(await screen.findByRole("button", { name: "Activar" }));

    expect(await screen.findByText("Verifica esta configuración antes de activarla.")).toBeInTheDocument();
    expect(
      screen.queryByText("La configuración cambió en otra pestaña. Tu borrador local no se sobrescribió."),
    ).not.toBeInTheDocument();
  });

  it("labels the pending activation instead of a verification", async () => {
    let resolveActivation: (value: LLMCredentialDTO) => void = () => undefined;
    api.activateLlmCredential.mockReturnValue(
      new Promise<LLMCredentialDTO>((resolve) => {
        resolveActivation = resolve;
      }),
    );
    renderSetup();

    fireEvent.click(await screen.findByRole("button", { name: "Activar" }));

    expect(await screen.findByRole("button", { name: "Activando…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Guardar y verificar modelo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Probar configuración guardada" })).toBeDisabled();
    resolveActivation(openAiCredential);
  });

  it("reconciles credentials when the server no longer has the configuration", async () => {
    api.testLlmCredential.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: { detail: "No hay una configuración guardada para este proveedor." } },
    });
    const { queryClient } = renderSetup();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    fireEvent.click(await screen.findByRole("button", { name: "Probar configuración guardada" }));

    expect(
      await screen.findByText("No hay una configuración guardada para este proveedor."),
    ).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["llm-credentials"] });
  });

  it("offers deactivation for a stored active credential the runtime does not confirm", async () => {
    renderSetup({ credential: { ...openAiCredential, is_active: true }, isRuntimeActive: false });

    expect(await screen.findByRole("button", { name: "Desactivar" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Activar" })).not.toBeInTheDocument();
    expect(screen.queryByText("Activo")).not.toBeInTheDocument();
    expect(
      screen.getByText("Guardada como activa, pero el servidor no confirma que la esté usando."),
    ).toBeInTheDocument();
  });

  it("clears a stale verification message after deleting the configuration", async () => {
    const confirmation = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderSetup();
    fireEvent.click(screen.getByRole("button", { name: "Probar configuración guardada" }));
    expect(await screen.findByText(/verificada\./)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(api.deleteLlmCredential).toHaveBeenCalledWith("OPENAI"));
    await waitFor(() => expect(screen.queryByText(/verificada\./)).not.toBeInTheDocument());
    confirmation.mockRestore();
  });

  it("shows the remote-change banner only for configuration-changed conflicts", async () => {
    api.updateLlmCredentialModel.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { detail: "Conflicto desconocido." } },
    });
    renderSetup();

    fireEvent.click(screen.getByRole("button", { name: "Guardar y verificar modelo" }));

    expect(await screen.findByText("Conflicto desconocido.")).toBeInTheDocument();
    expect(
      screen.queryByText("La configuración cambió en otra pestaña. Tu borrador local no se sobrescribió."),
    ).not.toBeInTheDocument();
  });
  it("explains why Activar is disabled until the saved configuration is tested", () => {
    renderSetup({ credential: { ...openAiCredential, is_verified: false, verified_at: null } });

    const activate = screen.getByRole("button", { name: "Activar" });
    expect(activate).toBeDisabled();
    expect(activate).toHaveAccessibleDescription("Primero pulsa «Probar configuración guardada».");
    expect(screen.getByText("Primero pulsa «Probar configuración guardada».")).toBeVisible();
  });
});
