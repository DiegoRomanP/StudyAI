# Despliegue en la VM (Lightsail, Docker + Caddy)

Pasos que se hacen **una sola vez** en la VM. Después, cada despliegue es `deploy/deploy.sh usuario@host`.

1. **DNS** (Cloudflare): registro `A` `api` -> IP estática de la VM, en modo **DNS only** (nube gris).
   Con el proxy naranja Caddy no puede emitir el certificado. El frontend (`studyinflow.app`) va en Pages.
2. **Firewall de Lightsail**: abrir 22, 80 y 443.
3. **Docker**:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER   # volver a entrar por ssh
   sudo mkdir -p /opt/studyai && sudo chown $USER /opt/studyai
   ```
4. **`/opt/studyai/.env`** (permisos `chmod 600`; nunca está en el repo, `deploy.sh` no lo toca):
   ```bash
   DOMAIN=studyinflow.app
   DEPLOYMENT_MODE=saas
   APP_ENV=production
   SECRET_KEY=<cadena aleatoria larga: openssl rand -hex 32>
   CORS_ORIGINS=https://studyinflow.app
   DATABASE_URL=<Supabase session pooler, postgresql+psycopg://...>
   VECTOR_BACKEND=pgvector
   AUTH_MODE=supabase
   STORAGE_BACKEND=s3
   PAYMENT_GATEWAY=mercadopago        # en sandbox hasta el lanzamiento
   ANTHROPIC_API_KEY=<clave>
   # SUPABASE_*, S3/R2_* y MP_* según backend/.env.example (los añade la fase P0)
   ```
5. **Desplegar** desde tu máquina: `deploy/deploy.sh ubuntu@<ip-o-host>`.
6. **Comprobar**: `curl https://api.studyinflow.app/health` devuelve `{"status":"ok"}`.

Notas: `deploy.sh` no sube `frontend/` (va por Cloudflare Pages). El contenedor ejecuta
`alembic upgrade head` al arrancar solo si `DEPLOYMENT_MODE=saas`. Ver
`docs/backend/despliegue/operacion.md`.
