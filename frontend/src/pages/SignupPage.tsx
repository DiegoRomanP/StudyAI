import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { AuthLayout } from "../components/auth/AuthLayout";
import { Alert, Button, ButtonLink, Input } from "../components/ui";
import { authErrorMessage } from "../lib/authErrors";
import { supabase } from "../lib/supabase";

const MIN_PASSWORD = 8;
const LINK = "font-semibold text-action hover:text-action-hover";

export function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) {
      setPasswordError(`Usa al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    setPasswordError(null);
    setBusy(true);
    const { error: failure } = await supabase!.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/inicio` },
    });
    setBusy(false);
    if (failure) setError(authErrorMessage(failure));
    else setSent(true);
  }

  if (sent) {
    return (
      <AuthLayout title="Revisa tu correo" intro={`Te enviamos un enlace de confirmación a ${email}. Ábrelo para activar tu cuenta.`}>
        <ButtonLink to="/login" variant="secondary" className="w-full">Ir a iniciar sesión</ButtonLink>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Crea tu cuenta" intro="Empieza con créditos gratis para generar tus primeros planes.">
      <form onSubmit={submit} className="space-y-4">
        <Input id="signup-email" label="Correo electrónico" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input
          id="signup-password"
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          required
          hint={`Al menos ${MIN_PASSWORD} caracteres.`}
          error={passwordError}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <label className="flex min-h-11 items-start gap-3 text-sm text-text-muted">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1 h-5 w-5 shrink-0" />
          <span>
            Acepto los <Link to="/terminos" className={LINK}>términos de uso</Link> y la{" "}
            <Link to="/privacidad" className={LINK}>política de privacidad</Link>.
          </span>
        </label>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" className="w-full" disabled={busy || !accepted} aria-describedby={accepted ? undefined : "signup-terms-reason"}>
          Crear cuenta
        </Button>
        {!accepted && <p id="signup-terms-reason" className="text-sm text-text-muted">Acepta los términos y la política de privacidad para continuar.</p>}
      </form>
      <p className="text-sm text-text-muted">
        ¿Ya tienes cuenta? <Link to="/login" className={LINK}>Inicia sesión</Link>
      </p>
    </AuthLayout>
  );
}
