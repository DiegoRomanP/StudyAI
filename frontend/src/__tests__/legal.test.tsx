import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ getAppConfig: vi.fn(), submitComplaint: vi.fn(), listProducts: vi.fn() }));

vi.mock("../api/endpoints", () => ({ api }));

import App from "../App";

function renderAt(path: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getAppConfig.mockResolvedValue({ deployment_mode: "saas", auth_mode: "supabase" });
  api.listProducts.mockResolvedValue([]);
});

describe("legal pages", () => {
  it.each([
    ["/terminos", "Términos y condiciones"],
    ["/privacidad", "Política de privacidad"],
    ["/reclamaciones", "Libro de Reclamaciones"],
  ])("%s renders without a session, with the draft notice", (path, title) => {
    renderAt(path);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByText("Borrador pendiente de revisión legal")).toBeInTheDocument();
  });

  it("privacy names the AI provider and where it processes data", () => {
    renderAt("/privacidad");
    expect(screen.getByText(/Anthropic, que lo procesa en Estados Unidos/)).toBeInTheDocument();
  });

  it("the complaints form sends the fields and shows the returned code", async () => {
    api.submitComplaint.mockResolvedValue({ code: "R-2026-000001", created_at: "2026-11-27T15:30:00" });
    renderAt("/reclamaciones");
    const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fill("Nombre completo", "Ana Pérez");
    fill("DNI, CE o pasaporte", "12345678");
    fill("Correo electrónico", "ana@example.pe");
    fill("Teléfono", "999888777");
    fill("Domicilio", "Av. Siempre Viva 123, Lima");
    fill("Tipo", "reclamo");
    fill("Monto reclamado (S/, opcional)", "19,90");
    fill("Detalle", "Pagué y no recibí los créditos.");
    fill("Pedido", "Que acrediten mi compra.");
    fireEvent.click(screen.getByRole("button", { name: "Enviar hoja de reclamación" }));

    expect(await screen.findByText("R-2026-000001")).toBeInTheDocument();
    expect(api.submitComplaint.mock.calls[0][0]).toEqual({
      name: "Ana Pérez",
      document_id: "12345678",
      address: "Av. Siempre Viva 123, Lima",
      phone: "999888777",
      email: "ana@example.pe",
      kind: "reclamo",
      amount_cents: 1990,
      detail: "Pagué y no recibí los créditos.",
      request: "Que acrediten mi compra.",
    });
  });

  it("rejects an amount that is not money", () => {
    renderAt("/reclamaciones");
    fireEvent.change(screen.getByLabelText("Monto reclamado (S/, opcional)"), { target: { value: "mucho" } });
    fireEvent.submit(screen.getByRole("button", { name: "Enviar hoja de reclamación" }).closest("form")!);
    expect(screen.getByText("Escribe el monto en soles, por ejemplo 19.90.")).toBeInTheDocument();
    expect(api.submitComplaint).not.toHaveBeenCalled();
  });

  it("the landing footer links to the legal pages", async () => {
    renderAt("/");
    expect(screen.getByRole("link", { name: "Libro de Reclamaciones" })).toHaveAttribute("href", "/reclamaciones");
    expect(screen.getByRole("link", { name: "Términos" })).toHaveAttribute("href", "/terminos");
    expect(await screen.findByRole("link", { name: "Precios" })).toHaveAttribute("href", "/precios");
  });

  it("billing pages are a 404 in self-hosted", async () => {
    api.getAppConfig.mockResolvedValue({ deployment_mode: "self_hosted", auth_mode: "demo" });
    renderAt("/precios");
    await waitFor(() => expect(screen.getByText("No encontramos esa página")).toBeInTheDocument());
    expect(api.listProducts).not.toHaveBeenCalled();
  });
});
