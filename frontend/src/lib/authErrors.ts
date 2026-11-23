const MESSAGES: Record<string, string> = {
  invalid_credentials: "Correo o contraseña incorrectos.",
  email_not_confirmed: "Confirma tu correo antes de entrar. Revisa tu bandeja de entrada.",
  user_already_exists: "Ya existe una cuenta con ese correo. Prueba a iniciar sesión.",
  weak_password: "La contraseña es demasiado débil. Usa al menos 8 caracteres.",
  same_password: "La nueva contraseña debe ser distinta de la anterior.",
  over_request_rate_limit: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
  over_email_send_rate_limit: "Demasiados correos enviados. Espera unos minutos e inténtalo de nuevo.",
};

/** Spanish message for a Supabase auth error; never shows the raw English text. */
export function authErrorMessage(error: { code?: string } | null | undefined): string {
  return (error?.code && MESSAGES[error.code]) || "No pudimos completar la acción. Inténtalo de nuevo.";
}

/** Only in-app paths: an external `next` would turn the login into an open redirect. */
export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/inicio";
}
