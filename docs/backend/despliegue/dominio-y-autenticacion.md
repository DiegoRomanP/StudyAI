# Dominio, correo y login (Supabase + Google + Resend)

**Leer antes de** tocar el login, el SMTP, las URLs de redirección, el DNS o cualquier URL pública del
despliegue SaaS. Complementa [saas-produccion.md](saas-produccion.md) y `plans/SaaS_SinCredenciales.md`.

> **Secretos**: nada de lo que se menciona como «clave», «secret» o «contraseña» se guarda en el repo ni en
> `docs/`. Viven en los paneles de cada servicio y en el `.env` del servidor.

## Decisiones

| Decisión | Motivo |
|---|---|
| Dominio propio `studyinflow.app` (Cloudflare Registrar) | Cuesta ~8,20 USD el primer año y 14,20 USD al renovar (precios vistos al comprar). Evita parches con dominios gratis y habilita Resend, Google y webhooks de pago. Tope de presupuesto: 15 USD/año. |
| `.app` fuerza HTTPS (lista HSTS de los navegadores) | Conviene para un producto con login y cobros; el backend siempre debe servirse por HTTPS. |
| Resend solo como **SMTP de Supabase Auth** | Se usa para el correo de verificación y la recuperación de contraseña. **No interviene en los cobros.** |
| Login con Google + correo y contraseña | Google ya verifica el email. El registro por correo exige SMTP propio porque el de Supabase por defecto está muy limitado. |
| No desactivar la verificación de correo | El bono de registro se puede abusar con cuentas falsas (ver plan SaaS). |

## Valores de configuración (no secretos)

- Dominio: `studyinflow.app` · DNS en Cloudflare. Renovación automática activada (comprobar).
- Supabase: proyecto `StudyAI` (`main`, plan Free), ref `jodjtsgfsnugzpnmddff`.
- Callback de Google en Supabase: `https://jodjtsgfsnugzpnmddff.supabase.co/auth/v1/callback`.
- Supabase → Authentication → **URL Configuration**: *Site URL* `https://studyinflow.app`; *Redirect URLs*
  `https://studyinflow.app/**` y `http://localhost:5173/**`.
- Supabase → Authentication → **Emails → SMTP Settings** (custom SMTP activado):
  host `smtp.resend.com`, puerto `465`, usuario `resend`, contraseña = API key de Resend,
  remitente `no-reply@studyinflow.app`, nombre `StudyInFlow`.
- Subdominio del backend previsto: `api.studyinflow.app` (registro A a la IP del servidor; empezar en
  «DNS only» para que el HTTPS se emita sin conflictos).

## Procedimiento (orden)

1. **Cloudflare**: activar renovación automática y comprobar privacidad WHOIS.
2. **Resend**: añadir el dominio, copiar los registros DNS (SPF, DKIM, MX) a Cloudflare en **«DNS only»**
   (nube gris), esperar *Verified*, crear la API key.
3. **Supabase → Emails → SMTP Settings**: rellenar con los valores de arriba y guardar.
4. **Google Cloud → Google Auth Platform** (nombre actual de la pantalla de consentimiento OAuth), con un
   proyecto seleccionado (recomendado uno dedicado `StudyInFlow`):
   - *Comenzar*: nombre de app, correo de soporte, público **Externo**.
   - *Información de la marca*: dominio autorizado `studyinflow.app`.
   - *Clientes → Crear cliente*: tipo **Aplicación web**; origen `https://studyinflow.app`; URI de
     redireccionamiento = Callback URL de Supabase.
   - *Público*: pasar de «Testing» a **«En producción»** (con permisos básicos no exige revisión de Google).
5. **Supabase → Sign In / Providers → Google**: pegar Client ID y Client Secret y guardar.
6. Probar «Continuar con Google» en local y el registro con un correo ajeno al equipo antes de seguir.
7. Despliegue: frontend en Cloudflare Pages/Workers con dominio `studyinflow.app`; backend en
   `api.studyinflow.app`; la URL del webhook de Mercado Pago apunta a `https://api.studyinflow.app/...` (al final).

## Gotchas vistos

- **Supabase → Users: «password authentication failed for user "postgres"» (28P01).** Problema de la
  contraseña de la base de datos, no del login. Esperar unos minutos; si persiste, *Project Settings →
  Database → Reset database password* y actualizar `DATABASE_URL` en el `.env` si el backend la usa.
- Los formularios de Google (Client IDs) y SMTP (remitente) salen en rojo mientras tengan campos obligatorios
  vacíos; no es un fallo. El interruptor de Google no se puede guardar sin Client ID.
- Los nombres de menús de las consolas de Google y Supabase cambian con frecuencia: usar el buscador de la
  consola («Google Auth Platform») si no aparece una ruta.

## Estado (2026-11-22)

- [x] Dominio `studyinflow.app` comprado en Cloudflare.
- [ ] Dominio verificado en Resend y API key creada.
- [ ] SMTP personalizado guardado en Supabase.
- [ ] Cliente OAuth de Google creado y pegado en Supabase.
- [x] Error 28P01 de Supabase resuelto (reset de la contraseña de la base, 2026-11-27). Esquema `public` vaciado: el primer deploy aplica `alembic upgrade head` sin `stamp`.
- [ ] `api.studyinflow.app` y frontend desplegados.

El código del login (backend y frontend) está hecho y verificado en `feat/deploy-ola1` (Ola 6,
2026-11-27); lo que queda arriba son pasos de consola (track M) y el despliegue (Ola 7).

Actualizar esta lista al avanzar. Si algo de aquí contradice el código, manda el código.
