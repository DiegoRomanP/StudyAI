import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));
const api = vi.hoisted(() => ({ getAppConfig: vi.fn() }));

vi.mock("../lib/supabase", () => ({ supabase: { auth } }));
vi.mock("../api/endpoints", () => ({ api }));

import { RequireAuth } from "../components/auth/RequireAuth";
import { useAuth } from "../hooks/useAuth";
import { LoginPage } from "../pages/LoginPage";
import { RecoverPage } from "../pages/RecoverPage";
import { ResetPasswordPage } from "../pages/ResetPasswordPage";
import { SignupPage } from "../pages/SignupPage";

const SESSION = { access_token: "t1", user: { id: "u1", email: "a@b.pe" } };

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{pathname + search}</p>;
}

function renderAt(path: string, queryClient = new QueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/inicio" element={<RequireAuth><p>Contenido privado</p></RequireAuth>} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/registro" element={<SignupPage />} />
          <Route path="/recuperar" element={<RecoverPage />} />
          <Route path="/restablecer" element={<ResetPasswordPage />} />
          <Route path="/plan" element={<p>Plan</p>} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getAppConfig.mockResolvedValue({ deployment_mode: "saas", auth_mode: "supabase" });
  auth.getSession.mockResolvedValue({ data: { session: null } });
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  auth.signInWithPassword.mockResolvedValue({ error: null });
  auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
  auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  auth.updateUser.mockResolvedValue({ error: null });
  auth.signOut.mockResolvedValue({ error: null });
});

describe("RequireAuth", () => {
  it("redirects to /login?next= without a session in supabase mode", async () => {
    renderAt("/inicio?a=1");

    expect(await screen.findByRole("heading", { name: "Inicia sesión" })).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/login?next=%2Finicio%3Fa%3D1");
    expect(screen.queryByText("Contenido privado")).not.toBeInTheDocument();
  });

  it("renders the content with a session", async () => {
    auth.getSession.mockResolvedValue({ data: { session: SESSION } });
    renderAt("/inicio");

    expect(await screen.findByText("Contenido privado")).toBeInTheDocument();
  });

  it("renders the content without login in demo mode", async () => {
    api.getAppConfig.mockResolvedValue({ deployment_mode: "self_hosted", auth_mode: "demo" });
    renderAt("/inicio");

    expect(await screen.findByText("Contenido privado")).toBeInTheDocument();
  });

  it("sends /login back to /inicio when the deployment has no login", async () => {
    api.getAppConfig.mockResolvedValue({ deployment_mode: "self_hosted", auth_mode: "demo" });
    renderAt("/login");

    expect(await screen.findByText("Contenido privado")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/inicio");
  });
});

describe("useAuth", () => {
  function setup() {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return { queryClient, ...renderHook(() => useAuth(), { wrapper }) };
  }

  it("signOut closes the session and clears the query cache", async () => {
    const { queryClient, result } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));
    queryClient.setQueryData(["plans"], [{ id: 1 }]);

    await result.current.signOut();

    expect(auth.signOut).toHaveBeenCalled();
    expect(queryClient.getQueryData(["plans"])).toBeUndefined();
  });

  it("clears the cache on SIGNED_OUT and when the user changes, not on a token refresh", async () => {
    auth.getSession.mockResolvedValue({ data: { session: SESSION } });
    const { queryClient, result } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));
    const emit = auth.onAuthStateChange.mock.calls[0][0] as (event: string, session: unknown) => void;

    queryClient.setQueryData(["plans"], [1]);
    emit("TOKEN_REFRESHED", { ...SESSION, access_token: "t2" });
    expect(queryClient.getQueryData(["plans"])).toEqual([1]);

    emit("SIGNED_IN", { access_token: "t3", user: { id: "u2" } });
    expect(queryClient.getQueryData(["plans"])).toBeUndefined();

    queryClient.setQueryData(["plans"], [2]);
    emit("SIGNED_OUT", null);
    expect(queryClient.getQueryData(["plans"])).toBeUndefined();
  });
});

describe("LoginPage", () => {
  it("signs in with email and password", async () => {
    renderAt("/login?next=%2Fplan");

    fireEvent.change(await screen.findByLabelText("Correo electrónico"), { target: { value: "a@b.pe" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "secreto123" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() =>
      expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.pe", password: "secreto123" }),
    );
  });

  it("explains wrong credentials in Spanish", async () => {
    auth.signInWithPassword.mockResolvedValue({
      error: { code: "invalid_credentials", message: "Invalid login credentials" },
    });
    renderAt("/login");

    fireEvent.change(await screen.findByLabelText("Correo electrónico"), { target: { value: "a@b.pe" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "mala" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Correo o contraseña incorrectos.");
  });

  it("continues with Google and keeps the destination", async () => {
    auth.signInWithOAuth.mockResolvedValue({ error: null });
    renderAt("/login?next=%2Fplan");

    fireEvent.click(await screen.findByRole("button", { name: "Continuar con Google" }));

    await waitFor(() =>
      expect(auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/plan` },
      }),
    );
  });

  it("ignores an external next destination", async () => {
    auth.getSession.mockResolvedValue({ data: { session: SESSION } });
    renderAt("/login?next=https%3A%2F%2Fevil.example");

    expect(await screen.findByText("Contenido privado")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/inicio");
  });
});

describe("SignupPage", () => {
  it("requires accepting the terms and links to them", async () => {
    renderAt("/registro");

    const submit = await screen.findByRole("button", { name: "Crear cuenta" });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAccessibleDescription(/acepta los términos/i);
    expect(screen.getByRole("link", { name: "términos de uso" })).toHaveAttribute("href", "/terminos");
    expect(screen.getByRole("link", { name: "política de privacidad" })).toHaveAttribute("href", "/privacidad");

    fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: "a@b.pe" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "secreto123" } });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    expect(await screen.findByRole("heading", { name: "Revisa tu correo" })).toBeInTheDocument();
    expect(auth.signUp).toHaveBeenCalledWith({
      email: "a@b.pe",
      password: "secreto123",
      options: { emailRedirectTo: `${window.location.origin}/inicio` },
    });
  });

  it("rejects a short password before calling Supabase", async () => {
    renderAt("/registro");

    fireEvent.change(await screen.findByLabelText("Correo electrónico"), { target: { value: "a@b.pe" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "corta" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(await screen.findByText("Usa al menos 8 caracteres.")).toBeInTheDocument();
    expect(auth.signUp).not.toHaveBeenCalled();
  });
});

describe("RecoverPage and ResetPasswordPage", () => {
  it("asks for the reset email and always confirms", async () => {
    renderAt("/recuperar");

    fireEvent.change(await screen.findByLabelText("Correo electrónico"), { target: { value: "a@b.pe" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar enlace" }));

    expect(await screen.findByRole("heading", { name: "Revisa tu correo" })).toBeInTheDocument();
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("a@b.pe", {
      redirectTo: `${window.location.origin}/restablecer`,
    });
  });

  it("sets the new password from the recovery session", async () => {
    auth.getSession.mockResolvedValue({ data: { session: SESSION } });
    renderAt("/restablecer");

    fireEvent.change(await screen.findByLabelText("Nueva contraseña"), { target: { value: "nueva-clave-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));

    await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({ password: "nueva-clave-1" }));
    expect(await screen.findByText("Contenido privado")).toBeInTheDocument();
  });

  it("explains an expired recovery link", async () => {
    renderAt("/restablecer");

    expect(await screen.findByText(/el enlace caducó/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pedir otro enlace" })).toHaveAttribute("href", "/recuperar");
  });
});
