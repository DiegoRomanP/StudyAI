# Frontend: comandos de desarrollo y tests

Desde `frontend/`:

```bash
npm install               # o npm ci
cp .env.example .env      # VITE_API_URL, defaults to http://localhost:8001
npm run dev               # http://localhost:5173
npm run lint              # tsc --noEmit (no hay ESLint)
npm test                  # Vitest (vitest run)
npm run build             # tsc --noEmit && vite build
```

QA aislado con Playwright y runner propio: [qa/qa-aislado.md](qa/qa-aislado.md).
