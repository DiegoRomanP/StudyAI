import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { AuthLayout } from "../components/auth/AuthLayout";
import { Alert, Button, Input } from "../components/ui";
import { authErrorMessage, safeNext } from "../lib/authErrors";
import { supabase } from "../lib/supabase";

export function LoginPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const nextQuery = params.get("next") ? `?next=${encodeURIComponent(next)}` : "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: failure } = await supabase!.auth.signInWithPassword({ email, password });
    // On success the session event moves the page; only a failure needs to stop here.
    if (failure) setError(authErrorMessage(failure));
    setBusy(false);
  }

  async function google() {
    setError(null);
    const { error: failure } = await supabase!.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}${next}` },
    });
    if (failure) setError(authErrorMessage(failure));
  }

  return (
    <AuthLayout title="Inicia sesión" intro="Entra para retomar tu plan de estudio.">
      <form onSubmit={submit} className="space-y-4">
        <Input id="login-email" label="Correo electrónico" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input id="login-password" label="Contraseña" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" className="w-full" disabled={busy}>Entrar</Button>
        <Link to="/recuperar" className="block text-sm font-semibold text-action hover:text-action-hover">¿Olvidaste tu contraseña?</Link>
      </form>
      <Button type="button" variant="secondary" className="w-full" onClick={google}>Continuar con Google</Button>
      <p className="text-sm text-text-muted">
        ¿Aún no tienes cuenta?{" "}
        <Link to={`/registro${nextQuery}`} className="font-semibold text-action hover:text-action-hover">Regístrate</Link>
      </p>
    </AuthLayout>
  );
}
