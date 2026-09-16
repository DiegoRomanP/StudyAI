import { describe, expect, it } from "vitest";

import { getApiErrorMessage } from "./errors";

describe("getApiErrorMessage", () => {
  it("uses the safe typed detail from an LLM provider error", () => {
    expect(
      getApiErrorMessage(
        {
          isAxiosError: true,
          response: {
            status: 502,
            data: {
              detail: "El proveedor rechazó el acceso.",
              code: "LLM_ACCESS_DENIED",
              provider: "NVIDIA",
              upstream_status: 403,
              retryable: false,
              retry_after_seconds: null,
            },
          },
        },
        "No se pudo verificar la clave.",
      ),
    ).toBe("El proveedor rechazó el acceso.");
  });

  it.each(["LLM_OUTPUT_LIMIT", "LLM_REFUSED", "LLM_UNSUPPORTED_CONFIGURATION"])("renders the safe %s detail", (code) => {
    expect(
      getApiErrorMessage(
        {
          isAxiosError: true,
          response: {
            status: 502,
            data: {
              detail: "Diagnóstico seguro.",
              code,
              provider: "OPENAI",
              upstream_status: null,
              retryable: false,
              retry_after_seconds: null,
            },
          },
        },
        "No se pudo verificar la clave.",
      ),
    ).toBe("Diagnóstico seguro.");
  });

  it("renders FastAPI validation arrays and never falls back to an arbitrary error message", () => {
    expect(
      getApiErrorMessage(
        { isAxiosError: true, response: { data: { detail: [{ msg: "Campo requerido" }] } } },
        "No se pudo verificar la clave.",
      ),
    ).toBe("Campo requerido");
    expect(
      getApiErrorMessage({ message: "upstream secret response" }, "Error seguro."),
    ).toBe("Error seguro.");
  });

  it("does not render an untyped 502 detail", () => {
    expect(
      getApiErrorMessage(
        { isAxiosError: true, response: { status: 502, data: { detail: "upstream secret response" } } },
        "Error seguro.",
      ),
    ).toBe("Error seguro.");
  });

  it("does not trust typed-looking errors from another status or provider", () => {
    const typedLookingPayload = {
      detail: "Detalle no confiable.",
      code: "LLM_OUTPUT_LIMIT",
      provider: "UNKNOWN_PROXY",
      upstream_status: null,
      retryable: false,
      retry_after_seconds: null,
    };
    expect(
      getApiErrorMessage(
        { isAxiosError: true, response: { status: 502, data: typedLookingPayload } },
        "Error seguro.",
      ),
    ).toBe("Error seguro.");
    expect(
      getApiErrorMessage(
        {
          isAxiosError: true,
          response: { status: 500, data: { ...typedLookingPayload, provider: "OPENAI" } },
        },
        "Error seguro.",
      ),
    ).toBe("Error seguro.");
  });
});
