import { APP_HOME_PATH } from "../components/AppShell";
import { ButtonLink, Card } from "../components/ui";

export function NotFoundPage() {
  return (
    <section className="space-y-4" aria-labelledby="not-found-title">
      <p className="text-sm font-semibold text-text-muted">Error 404</p>
      <h1 id="not-found-title" className="text-2xl font-bold text-text-primary">
        No encontramos esa página
      </h1>
      <Card className="space-y-4">
        <p className="text-text-muted">
          La dirección puede haber cambiado o no existe. Vuelve al inicio para elegir una sección.
        </p>
        <ButtonLink to={APP_HOME_PATH}>Volver al inicio</ButtonLink>
      </Card>
    </section>
  );
}
