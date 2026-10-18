import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../api/client";
import { DemoPage } from "../pages/DemoPage";

afterEach(() => {
  vi.restoreAllMocks();
});

function renderDemo() {
  // No QueryClientProvider on purpose: the demo must not depend on server state.
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <DemoPage />
    </MemoryRouter>,
  );
}

describe("DemoPage", () => {
  it("keeps a simulated-data banner on every section and never calls the API", () => {
    const request = vi.spyOn(apiClient, "request");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderDemo();

    const sections = screen.getByRole("group", { name: "Secciones de la demostración" });
    for (const name of ["Inicio", "Plan", "Práctica", "Estadísticas", "Tu IA"]) {
      fireEvent.click(within(sections).getByRole("button", { name }));
      expect(screen.getByRole("region", { name: "Aviso de demostración" })).toHaveTextContent(
        "Demostración simulada",
      );
    }
    expect(request).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.title).toBe("Demostración simulada | StudyAI");
  });

  it("tracks wrong answers locally and explains them", () => {
    renderDemo();
    fireEvent.click(screen.getByRole("button", { name: "Práctica" }));

    fireEvent.click(screen.getByRole("button", { name: "O(n)" }));
    expect(screen.getByText("Incorrecto. La respuesta es: O(n²)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver explicación" }));
    expect(screen.getByText(/n\(n\+1\)\/2 iteraciones/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Incorrectas (1)" }));
    expect(screen.getByText(/Pregunta 1 de 1/)).toBeInTheDocument();
  });

  it("never asks for an API key", () => {
    renderDemo();
    fireEvent.click(screen.getByRole("button", { name: "Tu IA" }));
    fireEvent.click(screen.getByRole("button", { name: /Anthropic/ }));
    expect(screen.queryByLabelText(/clave/i)).not.toBeInTheDocument();
    expect(document.querySelector("input")).toBeNull();
    expect(screen.getByRole("link", { name: "Ir a Conectar IA" })).toHaveAttribute("href", "/settings");
  });
});
