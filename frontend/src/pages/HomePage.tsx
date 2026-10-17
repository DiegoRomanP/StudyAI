import { Link } from "react-router-dom";

import { ButtonLink, Card } from "../components/ui";

const SECTIONS = [
  { to: "/documents", label: "Recursos", detail: "Consulta y administra tus apuntes." },
  { to: "/goals", label: "Metas", detail: "Define qué quieres aprender o preparar." },
  { to: "/plan", label: "Plan de estudio", detail: "Genera planes y revisa los que ya existen." },
  { to: "/dashboard", label: "Estadísticas", detail: "Consulta tus sesiones completadas y progreso." },
  { to: "/settings", label: "API Keys", detail: "Revisa el proveedor de IA y sus opciones." },
];

export function HomePage() {
  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <h1 className="max-w-reading text-3xl font-bold text-text-primary">
          StudyAI organiza tus materiales para estudiar
        </h1>
        <p className="max-w-reading text-text-muted">
          Reúne tus documentos, define una meta y consulta los planes, sesiones y repasos
          disponibles. Puedes explorar cada sección sin iniciar una generación desde esta página.
        </p>
      </header>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">Explora StudyAI</h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {SECTIONS.map((section) => (
            <li key={section.to} className="min-w-0">
              <h3 className="font-medium">
                <Link to={section.to} className="text-action underline underline-offset-2">
                  {section.label}
                </Link>
              </h3>
              <p className="mt-1 text-sm text-text-muted">{section.detail}</p>
            </li>
          ))}
        </ul>
        <p className="text-sm text-text-muted">
          Tus planes y sesiones existentes siguen disponibles desde Plan de estudio y cada enlace
          directo.
        </p>
        <div>
          <ButtonLink to="/documents">Explorar recursos</ButtonLink>
        </div>
      </Card>
    </div>
  );
}
