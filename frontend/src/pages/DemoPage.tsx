import { useEffect, useReducer, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChartColumn,
  ClipboardCheck,
  Flame,
  House,
  KeyRound,
  Lightbulb,
  ListChecks,
  Play,
  Sparkles,
  Target,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Logo } from "../components/brand/Logo";
import { ChoiceOptions } from "../components/session/ChoiceOptions";
import { SafeMarkdown } from "../components/session/SafeMarkdown";
import {
  Button,
  ButtonLink,
  Card,
  IconTile,
  OptionCard,
  ProgressRing,
  SegmentedControl,
  StatTile,
  StepChain,
} from "../components/ui";
import {
  DEMO_MONTH,
  DEMO_PROGRESS,
  DEMO_PROVIDERS,
  DEMO_QUESTIONS,
  DEMO_STATS,
  DEMO_TODAY,
  DEMO_TOPICS,
  DEMO_WEEK,
  type DemoRange,
} from "../demo/demoData";

type Section = "inicio" | "plan" | "practica" | "estadisticas" | "ia";

const SECTIONS: { value: Section; label: string; icon: LucideIcon }[] = [
  { value: "inicio", label: "Inicio", icon: House },
  { value: "plan", label: "Plan", icon: CalendarDays },
  { value: "practica", label: "Práctica", icon: ClipboardCheck },
  { value: "estadisticas", label: "Estadísticas", icon: ChartColumn },
  { value: "ia", label: "Tu IA", icon: KeyRound },
];

/**
 * "Ver demo": a simulated walkthrough of the mockup with sample data. Pure local
 * state; it never imports the API client and never asks for keys or documents.
 */
export function DemoPage() {
  const [section, setSection] = useState<Section>("inicio");

  useEffect(() => {
    document.title = "Demostración simulada | StudyAI";
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden">
      <div
        role="region"
        aria-label="Aviso de demostración"
        className="sticky top-0 z-40 border-b border-state-warning/40 bg-state-warning-subtle/95 backdrop-blur"
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm md:px-8">
          <p className="flex items-center gap-2 font-medium text-text-primary">
            <Sparkles aria-hidden="true" className="h-4 w-4 shrink-0 text-state-warning" />
            Demostración simulada: datos de ejemplo, nada se guarda.
          </p>
          <Link to="/inicio" className="inline-flex min-h-11 items-center gap-1 font-medium text-action hover:underline">
            Crear mi plan real
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-8">
        <Link to="/" aria-label="StudyAI, volver a la portada" className="rounded-control">
          <Logo />
        </Link>
        <Link to="/" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-text-muted hover:text-text-primary">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Volver
        </Link>
      </header>

      <main id="demo-content" className="mx-auto max-w-6xl space-y-6 px-4 pb-16 md:px-8">
        <div className="overflow-x-auto pb-1">
          <SegmentedControl
            label="Secciones de la demostración"
            value={section}
            onChange={setSection}
            options={SECTIONS.map(({ value, label, icon: Icon }) => ({
              value,
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  {label}
                </span>
              ),
            }))}
          />
        </div>

        {section === "inicio" && <DemoHome onNavigate={setSection} />}
        {section === "plan" && <DemoPlan />}
        {section === "practica" && <DemoPractice />}
        {section === "estadisticas" && <DemoStats />}
        {section === "ia" && <DemoProvider />}
      </main>
    </div>
  );
}

function DemoHome({ onNavigate }: { onNavigate: (section: Section) => void }) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="font-medium text-action-hover">¡Hola, Alex!</p>
        <h1 className="font-display text-3xl font-bold text-text-primary">Tu camino de estudio de hoy</h1>
        <p className="max-w-reading text-text-muted">
          Enfócate en lo que realmente importa. La IA analiza tu temario y te guía con el método Pareto.
        </p>
      </div>

      <Card variant="glass" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-text-primary">Sesión de hoy</h2>
            <p className="text-sm text-text-muted">
              {DEMO_TODAY.minutes} min · Enfocado en {DEMO_TODAY.topic}
            </p>
          </div>
          <Button type="button" onClick={() => onNavigate("practica")}>
            <Play aria-hidden="true" className="h-4 w-4" />
            Comenzar sesión
          </Button>
        </div>
        <StepChain label="Pasos de la sesión de ejemplo" steps={DEMO_TODAY.steps} />
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-text-primary">Progreso general</h2>
          <div className="flex flex-wrap items-center gap-6">
            <ProgressRing value={DEMO_PROGRESS.percent} label="Temas dominados" caption="Temas dominados" />
            <dl className="grid gap-2 text-sm">
              <DemoFigure label="Temas completados" value={DEMO_PROGRESS.mastered} />
              <DemoFigure label="En progreso" value={DEMO_PROGRESS.inProgress} />
              <DemoFigure label="Por revisar" value={DEMO_PROGRESS.toReview} />
            </dl>
          </div>
        </Card>
        <Card className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-text-primary">Enfoque Pareto (80/20)</h2>
          <p className="text-sm text-text-muted">Temas que la IA priorizó en este ejemplo.</p>
          <TopicBars />
        </Card>
      </div>
    </div>
  );
}

function DemoFigure({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="order-2 text-text-muted">{label}</dt>
      <dd className="order-1 font-display text-xl font-bold text-text-primary">{value}</dd>
    </div>
  );
}

function TopicBars() {
  return (
    <ul className="space-y-2">
      {DEMO_TOPICS.map((topic) => (
        <li key={topic.name} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_3rem] items-center gap-3 text-sm">
          <span className="truncate text-text-primary">{topic.name}</span>
          <span className="h-2 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
            <span className="block h-full rounded-full bg-flow" style={{ width: `${topic.relevance}%` }} />
          </span>
          <span className="text-right text-text-muted">{topic.relevance}%</span>
        </li>
      ))}
    </ul>
  );
}

function DemoPlan() {
  const [view, setView] = useState<"week" | "month">("week");
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <IconTile icon={CalendarDays} className="h-11 w-11" />
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">Plan de estudio</h1>
          <p className="max-w-reading text-text-muted">
            La IA analizó tu temario y creó un plan enfocado en el 20 % más importante.
          </p>
        </div>
      </div>
      <SegmentedControl
        label="Vista del plan"
        value={view}
        onChange={setView}
        options={[
          { value: "week", label: "Semana" },
          { value: "month", label: "Mes" },
        ]}
      />
      {view === "week" ? (
        <ul className="grid grid-cols-1 gap-2">
          {DEMO_WEEK.map((day) => (
            <li key={day.day}>
              <Card className="grid grid-cols-[3rem_minmax(0,1fr)_auto_3rem] items-center gap-3 !p-4 text-sm">
                <span className="text-text-muted">{day.day}</span>
                <span className="truncate font-medium text-text-primary">{day.topic}</span>
                <span className="text-text-muted">{day.hours}</span>
                <span className="text-right text-text-muted">{day.progress}%</span>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {DEMO_MONTH.map((week) => (
            <li key={week.week}>
              <Card className="space-y-1">
                <p className="text-sm text-text-muted">{week.week}</p>
                <p className="font-medium text-text-primary">{week.focus}</p>
                <p className="text-sm text-text-muted">
                  {week.done} de {week.sessions} sesiones completadas
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type PracticeFilter = "all" | "hard" | "wrong";

interface PracticeState {
  filter: PracticeFilter;
  index: number;
  picked: Record<number, string>;
  explained: Record<number, boolean>;
  /** Questions answered wrong in this demo visit ("Incorrectas"). */
  wrong: number[];
}

type PracticeAction =
  | { type: "filter"; filter: PracticeFilter }
  | { type: "pick"; id: number; option: string; correct: boolean }
  | { type: "explain"; id: number }
  | { type: "next" };

function practiceReducer(state: PracticeState, action: PracticeAction): PracticeState {
  switch (action.type) {
    case "filter":
      return { ...state, filter: action.filter, index: 0, picked: {}, explained: {} };
    case "pick":
      return {
        ...state,
        picked: { ...state.picked, [action.id]: action.option },
        wrong: action.correct
          ? state.wrong.filter((id) => id !== action.id)
          : [...new Set([...state.wrong, action.id])],
      };
    case "explain":
      return { ...state, explained: { ...state.explained, [action.id]: true } };
    case "next":
      return { ...state, index: state.index + 1 };
  }
}

function DemoPractice() {
  const [mode, setMode] = useState<"questions" | "exam">("questions");
  const [state, dispatch] = useReducer(practiceReducer, {
    filter: "all",
    index: 0,
    picked: {},
    explained: {},
    wrong: [],
  });
  const questions = DEMO_QUESTIONS.filter((question) =>
    state.filter === "hard" ? question.hard : state.filter === "wrong" ? state.wrong.includes(question.id) : true,
  );
  const question = questions[state.index % Math.max(questions.length, 1)];
  const choice = question ? state.picked[question.id] ?? null : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <IconTile icon={ClipboardCheck} className="h-11 w-11" />
        <h1 className="font-display text-2xl font-bold text-text-primary">Práctica</h1>
      </div>
      <SegmentedControl
        label="Modo de práctica"
        value={mode}
        onChange={setMode}
        options={[
          { value: "questions", label: "Preguntas" },
          { value: "exam", label: "Simulacro" },
        ]}
      />
      {mode === "exam" ? (
        <Card className="space-y-2">
          <p className="flex items-center gap-2 font-medium text-text-primary">
            <Timer aria-hidden="true" className="h-4 w-4 text-action-hover" />
            Simulacro de 20 preguntas · 30 min
          </p>
          <p className="text-sm text-text-muted">
            En la app, el simulacro es el test real de cada sesión y tu resultado se guarda en
            Estadísticas.
          </p>
        </Card>
      ) : (
        <>
          <SegmentedControl
            label="Filtrar preguntas"
            appearance="chips"
            value={state.filter}
            onChange={(filter) => dispatch({ type: "filter", filter })}
            options={[
              { value: "all", label: "Todas" },
              { value: "hard", label: "Difíciles" },
              { value: "wrong", label: `Incorrectas (${state.wrong.length})` },
            ]}
          />
          {!question ? (
            <Card className="text-text-muted">
              Aún no fallaste ninguna pregunta en esta demostración. Responde algunas en «Todas».
            </Card>
          ) : (
            <Card className="space-y-4">
              <p className="text-sm text-text-muted">
                {question.topic} · Pregunta {(state.index % questions.length) + 1} de {questions.length}
              </p>
              <div className="prose-study max-w-none font-medium text-text-primary">
                <SafeMarkdown>{question.prompt}</SafeMarkdown>
              </div>
              <ChoiceOptions
                key={`${state.filter}-${question.id}-${state.index}`}
                options={question.options}
                selected={choice}
                expected={choice !== null ? question.answer : undefined}
                onSelect={(option) =>
                  dispatch({ type: "pick", id: question.id, option, correct: option === question.answer })
                }
              />
              <p role="status" className={`text-sm font-medium ${choice === question.answer ? "text-state-success" : "text-state-error"}`}>
                {choice === null ? "" : choice === question.answer ? "¡Correcto!" : `Incorrecto. La respuesta es: ${question.answer}`}
              </p>
              {state.explained[question.id] && (
                <p className="flex items-start gap-2 rounded-control border border-line bg-surface-subtle p-3 text-sm text-text-primary">
                  <Lightbulb aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-action-hover" />
                  {question.explanation}
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                {choice !== null && !state.explained[question.id] && (
                  <Button type="button" variant="secondary" onClick={() => dispatch({ type: "explain", id: question.id })}>
                    Ver explicación
                  </Button>
                )}
                <Button type="button" onClick={() => dispatch({ type: "next" })} disabled={choice === null}>
                  Siguiente
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function DemoStats() {
  const [range, setRange] = useState<DemoRange>("7d");
  const stats = DEMO_STATS[range];
  const trend = (value: number) => (value > 0 ? `↑ ${value} % vs. periodo anterior` : "histórico");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-text-primary">Estadísticas</h1>
        <SegmentedControl
          label="Periodo"
          value={range}
          onChange={setRange}
          options={[
            { value: "7d", label: "7 días" },
            { value: "30d", label: "30 días" },
            { value: "all", label: "Todo" },
          ]}
        />
      </div>
      <Card>
        <Sparkline points={stats.points} />
      </Card>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={ListChecks} label="Preguntas resueltas" value={stats.answered.toLocaleString("es")} hint={trend(stats.answeredTrend)} />
        <StatTile icon={Target} label="Precisión" value={`${stats.accuracy}%`} hint={trend(stats.accuracyTrend)} />
        <StatTile icon={Timer} label="Tiempo de estudio" value={`${stats.studyHours} h`} hint={trend(stats.studyTrend)} />
        <StatTile icon={Flame} tone="warning" label="Racha actual" value={`${DEMO_PROGRESS.streakDays} días`} />
      </div>
    </div>
  );
}

/** Lightweight SVG area chart for sample data; the values are listed for screen readers. */
function Sparkline({ points }: { points: number[] }) {
  const width = 320;
  const height = 120;
  const step = width / Math.max(points.length - 1, 1);
  const coords = points.map((value, index) => [index * step, height - (value / 100) * height] as const);
  const line = coords.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <figure className="space-y-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="demo-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--color-action-primary))" stopOpacity="0.45" />
            <stop offset="100%" stopColor="rgb(var(--color-action-primary))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L${width},${height} L0,${height} Z`} fill="url(#demo-area)" />
        <path d={line} fill="none" stroke="rgb(var(--color-action-primary))" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="text-xs text-text-muted">Precisión de ejemplo: {points.join(" %, ")} %.</figcaption>
    </figure>
  );
}

function DemoProvider() {
  const [provider, setProvider] = useState<string>("openai");
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="space-y-1 text-center">
        <h1 className="font-display text-2xl font-bold text-text-primary">Conecta tu IA</h1>
        <p className="text-text-muted">Usa tu propia API key para personalizar tu experiencia.</p>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {DEMO_PROVIDERS.map((item) => (
          <OptionCard
            key={item.id}
            title={item.label}
            selected={provider === item.id}
            onSelect={() => setProvider(item.id)}
          />
        ))}
      </div>
      <Card variant="glass" className="space-y-3 text-sm text-text-muted">
        <p>
          En la demostración no se piden claves. En la app, tu clave se guarda cifrada en el servidor y
          nunca vuelve al navegador; sin clave, StudyAI funciona en modo demo con un LLM simulado.
        </p>
        <ButtonLink to="/settings" variant="secondary">
          Configurar en API Keys
        </ButtonLink>
      </Card>
    </div>
  );
}
