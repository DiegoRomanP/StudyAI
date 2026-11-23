import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { AuthLayout } from "../components/auth/AuthLayout";
import { Alert, Button, ButtonLink, Input } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { authErrorMessage } from "../lib/authErrors";
import { supabase } from "../lib/supabase";

const MIN_PASSWORD = 8;

export function ResetPasswordPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) {
      setPasswordError(`Usa al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    setPasswordError(null);
    setBusy(true);
    const { error: failure } = await supabase!.auth.updateUser({ password });
    setBusy(false);
    if (failure) setError(authErrorMessage(failure));
    else navigate("/inicio", { replace: true });
  }

  // The recovery link signs the user in; without a session the link expired or was already used.
  return (
    <AuthLayout title="Elige una contraseña nueva" keepSession>
      {session ? (
        <form onSubmit={submit} className="space-y-4">
          <Input
            id="reset-password"
            label="Nueva contraseña"
            type="password"
            autoComplete="new-password"
            required
            hint={`Al menos ${MIN_PASSWORD} caracteres.`}
            error={passwordError}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="w-full" disabled={busy}>Guardar contraseña</Button>
        </form>
      ) : (
        <>
          <Alert tone="warning">El enlace caducó o ya se usó.</Alert>
          <ButtonLink to="/recuperar" variant="secondary" className="w-full">Pedir otro enlace</ButtonLink>
        </>
      )}
    </AuthLayout>
  );
}
