import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OrderDTO, ProductDTO } from "../api/types";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
}));
const api = vi.hoisted(() => ({
  getAppConfig: vi.fn(),
  listProducts: vi.fn(),
  createCheckout: vi.fn(),
  getOrder: vi.fn(),
  fakeCompleteOrder: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({ supabase: { auth } }));
vi.mock("../api/endpoints", () => ({ api }));

import { CREDITS_QUERY_KEY } from "../hooks/useCredits";
import { formatPrice, isSafeCheckoutUrl, ORDER_POLL_MS } from "../hooks/useBilling";
import { PaymentResultPage } from "../pages/PaymentResultPage";
import { PricingPage } from "../pages/PricingPage";

const PRODUCTS: ProductDTO[] = [
  { code: "pack_10", name: "Paquete chico", kind: "pack", credits: 10, pass_days: null, price_cents: 490, currency: "PEN" },
  { code: "pass_30", name: "Pase mensual", kind: "pass", credits: 150, pass_days: 30, price_cents: 3490, currency: "PEN" },
];

const order = (status: OrderDTO["status"]): OrderDTO => ({
  id: 5,
  product_code: "pack_10",
  status,
  amount_cents: 490,
  currency: "PEN",
  created_at: "2026-11-27T10:00:00",
  paid_at: status === "paid" ? "2026-11-27T10:01:00" : null,
});

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{pathname + search}</p>;
}

function renderAt(path: string, queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/precios" element={<PricingPage />} />
          <Route path="/pago/resultado" element={<PaymentResultPage />} />
          <Route path="/login" element={<p>Login</p>} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return queryClient;
}

function withSession(session: object | null) {
  auth.getSession.mockResolvedValue({ data: { session } });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  withSession(null);
  api.getAppConfig.mockResolvedValue({ deployment_mode: "saas", auth_mode: "supabase" });
  api.listProducts.mockResolvedValue(PRODUCTS);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("PricingPage", () => {
  it("formats prices in soles", async () => {
    expect(formatPrice(490)).toMatch(/S\/\s?4\.90/);
    renderAt("/precios");
    // Intl separates the symbol with a non-breaking space; the DOM matcher normalizes it.
    expect(await screen.findByText(/^S\/\s4\.90$/)).toBeInTheDocument();
    expect(screen.getByText(/^S\/\s34\.90$/)).toBeInTheDocument();
  });

  it("sends a visitor without a session to login and back to pricing", async () => {
    renderAt("/precios");
    const [buy] = await screen.findAllByRole("button", { name: "Comprar" });
    await waitFor(() => expect(auth.getSession).toHaveBeenCalled());
    fireEvent.click(buy);
    expect(screen.getByTestId("where")).toHaveTextContent("/login?next=/precios");
    expect(api.createCheckout).not.toHaveBeenCalled();
  });

  it("with a session creates the checkout with an idempotency key and opens the gateway", async () => {
    withSession({ access_token: "t", user: { id: "u1" } });
    api.createCheckout.mockResolvedValue({ order_id: 5, checkout_url: "https://pago.example/abc" });
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    renderAt("/precios");
    await waitFor(() => expect(auth.getSession).toHaveBeenCalled());
    const [buy] = await screen.findAllByRole("button", { name: "Comprar" });
    await act(async () => {});
    fireEvent.click(buy);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://pago.example/abc"));
    expect(api.createCheckout).toHaveBeenCalledWith("pack_10", expect.any(String));
    vi.unstubAllGlobals();
  });

  it("never navigates to a checkout URL that is not https or this app", async () => {
    withSession({ access_token: "t", user: { id: "u1" } });
    api.createCheckout.mockResolvedValue({ order_id: 5, checkout_url: "javascript:alert(1)" });
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    renderAt("/precios");
    await waitFor(() => expect(auth.getSession).toHaveBeenCalled());
    const [buy] = await screen.findAllByRole("button", { name: "Comprar" });
    await act(async () => {});
    fireEvent.click(buy);
    expect(await screen.findByText("No se pudo iniciar el pago. Inténtalo de nuevo.")).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("accepts https gateway URLs and same-origin fake URLs only", () => {
    expect(isSafeCheckoutUrl("https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=1")).toBe(true);
    expect(isSafeCheckoutUrl(`${window.location.origin}/pago/resultado?order=1`)).toBe(true);
    expect(isSafeCheckoutUrl("http://evil.example/pay")).toBe(false);
    expect(isSafeCheckoutUrl("data:text/html,hi")).toBe(false);
  });
});

describe("PaymentResultPage", () => {
  it("polls while pending, stops at paid and refreshes the credit balance", async () => {
    vi.useFakeTimers();
    api.getOrder.mockResolvedValueOnce(order("pending")).mockResolvedValue(order("paid"));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderAt("/pago/resultado?order=5", client);

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(api.getOrder).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Confirmando tu pago…")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(ORDER_POLL_MS));
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(api.getOrder).toHaveBeenCalledTimes(2);
    expect(screen.getByText("¡Pago aprobado!")).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: CREDITS_QUERY_KEY });

    await act(() => vi.advanceTimersByTimeAsync(ORDER_POLL_MS * 5));
    expect(api.getOrder).toHaveBeenCalledTimes(2);
  });

  it("says it keeps waiting after 5 minutes pending", async () => {
    vi.useFakeTimers();
    api.getOrder.mockResolvedValue(order("pending"));
    renderAt("/pago/resultado?order=5");
    await act(() => vi.advanceTimersByTimeAsync(5 * 60 * 1000));
    expect(screen.getByText("Seguimos esperando la confirmación…")).toBeInTheDocument();
    const calls = api.getOrder.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(ORDER_POLL_MS * 3));
    expect(api.getOrder).toHaveBeenCalledTimes(calls);
  });

  it("offers the simulated payment only in development", async () => {
    api.getOrder.mockResolvedValue(order("pending"));
    api.fakeCompleteOrder.mockResolvedValue(order("paid"));
    renderAt("/pago/resultado?order=5");
    fireEvent.click(await screen.findByRole("button", { name: "Simular pago aprobado" }));
    expect(await screen.findByText("¡Pago aprobado!")).toBeInTheDocument();
    expect(api.fakeCompleteOrder.mock.calls[0][0]).toBe(5);
  });

  it("hides the simulated payment outside development", async () => {
    vi.stubEnv("DEV", false);
    api.getOrder.mockResolvedValue(order("pending"));
    renderAt("/pago/resultado?order=5");
    expect(await screen.findByText("Confirmando tu pago…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Simular pago aprobado" })).not.toBeInTheDocument();
  });
});
