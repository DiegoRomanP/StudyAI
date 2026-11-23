import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { AuthLayout } from "../components/auth/AuthLayout";
import { Alert, Button, Input } from "../components/ui";
import { authErrorMessage } from "../lib/authErrors";
import { supabase } from "../lib/supabase";

export function RecoverPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: failure } = await supabase!.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/restablecer`,
    });
    setBusy(false);
    if (failure) setError(authErrorMessage(failure));
    else setSent(true);
  }

  if (sent) {
    return (
      <AuthLayout title="Revisa tu correo" intro="Si hay una cuenta con ese correo, te enviamos un enlace para elegir una contraseña nueva.">
        <Link to="/login" className="text-sm font-semibold text-action hover:text-action-hover">Volver a iniciar sesión</Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Recupera tu contraseña" intro="Escribe tu correo y te enviaremos un enlace para crear una nueva.">
      <form onSubmit={submit} className="space-y-4">
        <Input id="recover-email" label="Correo electrónico" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" className="w-full" disabled={busy}>Enviar enlace</Button>
      </form>
      <Link to="/login" className="text-sm font-semibold text-action hover:text-action-hover">Volver a iniciar sesión</Link>
    </AuthLayout>
  );
}
