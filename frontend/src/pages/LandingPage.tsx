import { useEffect } from "react";
import {
  ArrowRight,
  CalendarDays,
  ChartColumn,
  ChartNoAxesColumnDecreasing,
  ClipboardCheck,
  FileUp,
  KeyRound,
  MessageCircleQuestion,
  Repeat,
  Target,
  type LucideIcon,
} from "lucide-react";
import * as m from "motion/react-m";
import { Link } from "react-router-dom";

import { FlowRiver } from "../components/brand/FlowRiver";
import { Logo } from "../components/brand/Logo";
import { APP_HOME_PATH } from "../components/AppShell";
import { ButtonLink, IconTile } from "../components/ui";

const FEATURES: { icon: LucideIcon; title: string; detail: string }[] = [
  {
    icon: CalendarDays,
    title: "Plan de estudio con IA",
    detail: "Sesiones con material propio, ordenadas y con repasos espaciados.",
  },
  {
    icon: MessageCircleQuestion,
    title: "Preguntas inteligentes",
    detail: "Flashcards y opción múltiple generadas a partir de tus documentos.",
  },
  {
    icon: ClipboardCheck,
    title: "Práctica tipo examen",
    detail: "Responde, recibe tu resultado confirmado y repasa lo que falló.",
  },
  {
    icon: ChartNoAxesColumnDecreasing,
    title: "Método Pareto (80/20)",
    detail: "La IA estima qué temas tienen más relevancia y los prioriza.",
  },
  {
    icon: ChartColumn,
    title: "Tu progreso en un solo lugar",
    detail: "Puntajes, temas débiles y próximos repasos (SM-2).",
  },
];

const STEPS: { icon: LucideIcon; title: string; detail: string }[] = [
  { icon: FileUp, title: "Sube tu material", detail: "Apuntes en PDF o Markdown." },
  { icon: Target, title: "Elige tu meta", detail: "Examen, aprendizaje o memorización." },
  {
    icon: KeyRound,
    title: "Conecta tu IA (opcional)",
    detail: "Sin clave funciona en modo demo con un LLM simulado.",
  },
  {
    icon: Repeat,
    title: "Estudia por sesiones",
    detail: "Estudio, receso y quiz; tus repasos se reprograman solos.",
  },
];

const FAQ = [
  {
    question: "¿Necesito una API key?",
    answer:
      "No. Sin clave, StudyAI funciona en modo demo con un LLM simulado. Si quieres resultados reales, conecta tu propia clave de un proveedor como OpenAI, Anthropic, Google Gemini u OpenRouter, o un modelo local con Ollama.",
  },
  {
    question: "¿Dónde se guarda mi clave?",
    answer:
      "Se envía al servidor de StudyAI, que la guarda cifrada. Nunca vuelve a mostrarse en el navegador.",
  },
  {
    question: "¿El método Pareto garantiza el 80/20?",
    answer:
      "No. La IA estima la relevancia de cada tema de tu material y prioriza los más importantes. Es una heurística para enfocar tu tiempo, no una garantía de resultados.",
  },
  {
    question: "¿Qué archivos puedo subir?",
    answer: "Documentos PDF y Markdown (.md) de hasta 25 MB cada uno.",
  },
];

export function LandingPage() {
  useEffect(() => {
    document.title = "StudyAI · Estudia de forma más inteligente";
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden">
      <a
        href="#landing-content"
        className="absolute left-4 top-2 z-50 -translate-y-20 rounded-control bg-action-fill px-4 py-3 font-medium text-text-on-action focus:translate-y-0"
      >
        Saltar al contenido
      </a>
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 md:px-8">
        <Link to="/" aria-label="StudyAI, inicio" className="rounded-control">
          <Logo />
        </Link>
        <nav aria-label="Secciones" className="hidden items-center gap-6 text-sm text-text-muted md:flex">
          <a href="#caracteristicas" className="hover:text-text-primary">
            Características
          </a>
          <a href="#como-funciona" className="hover:text-text-primary">
            Cómo funciona
          </a>
          <a href="#faq" className="hover:text-text-primary">
            FAQ
          </a>
        </nav>
        <ButtonLink to={APP_HOME_PATH} className="shrink-0">
          Comenzar
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </ButtonLink>
      </header>

      <main id="landing-content" tabIndex={-1}>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-12 pt-6 md:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:pt-12">
          <m.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-6"
          >
            <p className="inline-flex rounded-full border border-glass-line bg-glass px-3 py-1 text-xs font-medium text-text-muted">
              Un mejor método. Menos tiempo. Más resultados.
            </p>
            <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight text-text-primary sm:text-5xl">
              Estudia de forma más <span className="text-flow">inteligente</span>, no más difícil.
            </h1>
            <p className="max-w-reading text-lg leading-reading text-text-muted">
              Tu aprendizaje tiene un camino. StudyAI te ayuda a descubrirlo, enfocarte en lo esencial
              y dominar lo que realmente importa.
            </p>
            <p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-action-hover">
              Find your flow. Master what matters.
            </p>
            <div className="flex flex-wrap gap-3">
              <ButtonLink to={APP_HOME_PATH} className="px-6">
                Comenzar gratis
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </ButtonLink>
            </div>
          </m.div>

          <div className="relative overflow-hidden rounded-feature border border-glass-line shadow-flow">
            <FlowRiver className="block aspect-[16/11] h-auto w-full" />
          </div>
        </section>

        <section
          id="caracteristicas"
          aria-labelledby="features-title"
          className="mx-auto max-w-6xl scroll-mt-6 px-4 py-10 md:px-8"
        >
          <h2 id="features-title" className="sr-only">
            Características
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {FEATURES.map((feature) => (
              <li
                key={feature.title}
                className="flex gap-3 rounded-surface border border-line bg-surface-paper/70 p-4 lg:flex-col"
              >
                <IconTile icon={feature.icon} />
                <div className="min-w-0">
                  <h3 className="font-display text-base font-semibold text-text-primary">{feature.title}</h3>
                  <p className="mt-1 text-sm text-text-muted">{feature.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section
          id="como-funciona"
          aria-labelledby="how-title"
          className="mx-auto max-w-6xl scroll-mt-6 px-4 py-10 md:px-8"
        >
          <h2 id="how-title" className="font-display text-2xl font-bold text-text-primary">
            Cómo funciona
          </h2>
          <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="rounded-surface border border-line bg-surface-paper/70 p-4">
                <div className="flex items-center gap-3">
                  <IconTile icon={step.icon} />
                  <span className="font-display text-sm font-semibold text-text-muted">Paso {index + 1}</span>
                </div>
                <h3 className="mt-3 font-display text-base font-semibold text-text-primary">{step.title}</h3>
                <p className="mt-1 text-sm text-text-muted">{step.detail}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="faq" aria-labelledby="faq-title" className="mx-auto max-w-3xl scroll-mt-6 px-4 py-10 md:px-8">
          <h2 id="faq-title" className="font-display text-2xl font-bold text-text-primary">
            Preguntas frecuentes
          </h2>
          <div className="mt-6 space-y-3">
            {FAQ.map((item) => (
              <details key={item.question} className="rounded-surface border border-line bg-surface-paper/70 p-4">
                <summary className="min-h-11 cursor-pointer font-medium text-text-primary">{item.question}</summary>
                <p className="mt-2 text-sm leading-reading text-text-muted">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 pt-6 md:px-8">
          <div className="flex flex-col items-start gap-4 rounded-feature border border-glass-line bg-flow-soft p-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-display text-xl font-semibold text-text-primary">
              Empieza con tu propio material en minutos.
            </p>
            <ButtonLink to={APP_HOME_PATH}>
              Comenzar gratis
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </ButtonLink>
          </div>
        </section>
      </main>

      <footer className="border-t border-line px-4 py-6 text-center text-xs text-text-muted">
        StudyAI · Find your flow. Master what matters.
      </footer>
    </div>
  );
}
