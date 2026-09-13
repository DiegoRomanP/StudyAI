import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";

import type { QuizAnswer, QuizQuestionDTO } from "../api/types";
import { Badge, Button, Card, ProgressBar, Spinner } from "../components/ui";
import { useQuiz, useSession, useSubmitQuiz } from "../hooks/queries";
import { formatTime, useTimer } from "../hooks/useTimer";
import { youtubeSearchUrl } from "../lib/youtube";

type Phase = "study" | "break" | "test" | "done";

const BREAK_ACTIVITIES = [
  "🚶 Camina 5 minutos y estírate.",
  "💧 Bebe un vaso de agua y respira profundo 10 veces.",
  "👀 Mira por la ventana a un punto lejano para descansar la vista.",
  "🤸 Haz 10 sentadillas o saltos para activar la circulación.",
  "🧘 Cierra los ojos y haz una pausa de respiración consciente.",
];

export function SessionPage() {
  const { sessionId } = useParams();
  const id = sessionId ? Number(sessionId) : null;
  const { data: session, isLoading } = useSession(id);
  const [phase, setPhase] = useState<Phase>("study");

  if (isLoading || !session) return <Spinner label="Cargando sesión…" />;

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/plan/${session.plan_id}`} className="text-sm text-brand-600 hover:underline">
          ← Volver al plan
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{session.topic_name}</h1>
        <PhaseIndicator phase={phase} />
      </div>

      {phase === "study" && (
        <StudyPhase
          durationMinutes={session.duration_minutes}
          markdown={session.material?.content_markdown ?? ""}
          keywords={session.material?.youtube_keywords ?? []}
          onDone={() => setPhase("break")}
        />
      )}
      {phase === "break" && <BreakPhase onDone={() => setPhase("test")} />}
      {phase === "test" && id != null && (
        <TestPhase sessionId={id} onDone={() => setPhase("done")} />
      )}
      {phase === "done" && (
        <Card className="text-center">
          <div className="text-4xl">🎉</div>
          <h2 className="mt-2 text-lg font-semibold">¡Sesión completada!</h2>
          <p className="text-sm text-slate-500">
            Tus flashcards se reprogramaron con SM-2. Revisa tu progreso en el Dashboard.
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <Link to="/dashboard">
              <Button>Ver Dashboard</Button>
            </Link>
            <Link to={`/plan/${session.plan_id}`}>
              <Button variant="secondary">Volver al plan</Button>
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}

function PhaseIndicator({ phase }: { phase: Phase }) {
  const steps: { key: Phase; label: string }[] = [
    { key: "study", label: "Estudio" },
    { key: "break", label: "Receso" },
    { key: "test", label: "Test" },
  ];
  const order: Phase[] = ["study", "break", "test", "done"];
  return (
    <div className="mt-2 flex gap-2">
      {steps.map((s) => (
        <Badge key={s.key} color={order.indexOf(phase) >= order.indexOf(s.key) ? "brand" : "slate"}>
          {s.label}
        </Badge>
      ))}
    </div>
  );
}

// --- Study -----------------------------------------------------------------
function StudyPhase({
  durationMinutes,
  markdown,
  keywords,
  onDone,
}: {
  durationMinutes: number;
  markdown: string;
  keywords: string[];
  onDone: () => void;
}) {
  const { remaining, running, start, finish } = useTimer(durationMinutes * 60, onDone);

  return (
    <div className="space-y-4">
      <Card className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl font-mono font-semibold text-brand-700">
            {formatTime(remaining)}
          </span>
          <span className="text-sm text-slate-500">tiempo de estudio</span>
        </div>
        <div className="flex gap-2">
          {!running && remaining > 0 && <Button onClick={start}>▶ Iniciar</Button>}
          <Button variant="secondary" onClick={finish}>
            Saltar al receso →
          </Button>
        </div>
      </Card>

      <Card>
        {" "}
        <div className="prose-study max-w-none">
          <ReactMarkdown>{markdown || "_Sin material._"}</ReactMarkdown>
        </div>
      </Card>

      {keywords.length > 0 && (
        <Card>
          <h3 className="mb-2 font-semibold">🔎 Buscar videos relacionados</h3>
          <div className="flex flex-wrap gap-2">
            {keywords.map((kw) => (
              <a
                key={kw}
                href={youtubeSearchUrl(kw)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:border-red-300 hover:text-red-600"
              >
                ▶ {kw}
              </a>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Son búsquedas seguras en YouTube (nunca enlaces generados por la IA).
          </p>
        </Card>
      )}
    </div>
  );
}

// --- Break -----------------------------------------------------------------
function BreakPhase({ onDone }: { onDone: () => void }) {
  const activity = useMemo(
    () => BREAK_ACTIVITIES[Math.floor(Math.random() * BREAK_ACTIVITIES.length)],
    [],
  );
  const { remaining, running, start, finish } = useTimer(5 * 60, onDone);

  return (
    <Card className="space-y-4 text-center">
      <h2 className="text-lg font-semibold">Receso activo (5 min)</h2>
      <p className="text-xl">{activity}</p>
      <div className="text-3xl font-mono font-semibold text-brand-700">{formatTime(remaining)}</div>
      <div className="flex justify-center gap-2">
        {!running && remaining > 0 && <Button onClick={start}>▶ Iniciar receso</Button>}
        <Button variant="secondary" onClick={finish}>
          Ir al test →
        </Button>
      </div>
    </Card>
  );
}

// --- Test ------------------------------------------------------------------
function TestPhase({ sessionId, onDone }: { sessionId: number; onDone: () => void }) {
  const { data: quiz, isLoading } = useQuiz(sessionId);
  const submit = useSubmitQuiz();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, QuizAnswer>>({});
  const [result, setResult] = useState<{ score: number; correct: number; total: number } | null>(
    null,
  );

  if (isLoading || !quiz) return <Spinner label="Cargando quiz…" />;
  if (quiz.questions.length === 0) {
    return <Card>No hay preguntas para esta sesión.</Card>;
  }

  const question = quiz.questions[index];
  const isLast = index === quiz.questions.length - 1;
  const currentAnswered = answers[question.id] !== undefined;

  function record(answer: QuizAnswer) {
    setAnswers((prev) => ({ ...prev, [answer.question_id]: answer }));
  }

  async function next() {
    if (isLast) {
      const payload = Object.values(answers);
      const res = await submit.mutateAsync({ quizId: quiz!.id, answers: payload });
      setResult(res);
      onDone();
    } else {
      setIndex((i) => i + 1);
    }
  }

  if (result) {
    return (
      <Card className="text-center">
        <h2 className="text-lg font-semibold">Resultado del test</h2>
        <div className="my-3 text-5xl font-bold text-brand-700">{result.score}%</div>
        <p className="text-sm text-slate-500">
          {result.correct} / {result.total} preguntas de opción múltiple correctas
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <ProgressBar value={((index + 1) / quiz.questions.length) * 100} />
      <p className="text-sm text-slate-400">
        Pregunta {index + 1} de {quiz.questions.length}
      </p>

      {question.question_type === "FLASHCARD" ? (
        <FlashCard
          question={question}
          onRate={(quality) => record({ question_id: question.id, quality })}
          rated={answers[question.id]?.quality}
        />
      ) : (
        <MultipleChoice
          question={question}
          selected={answers[question.id]?.selected_option ?? null}
          onSelect={(opt) => record({ question_id: question.id, selected_option: opt })}
        />
      )}

      <div className="flex justify-end">
        <Button onClick={next} disabled={!currentAnswered || submit.isPending}>
          {submit.isPending ? "Enviando…" : isLast ? "Finalizar" : "Siguiente →"}
        </Button>
      </div>
    </div>
  );
}

function FlashCard({
  question,
  onRate,
  rated,
}: {
  question: QuizQuestionDTO;
  onRate: (quality: number) => void;
  rated?: number | null;
}) {
  const [flipped, setFlipped] = useState(false);

  return (
    <Card className="space-y-4">
      <Badge>Flashcard</Badge>
      <div
        onClick={() => setFlipped((f) => !f)}
        className="flex min-h-[120px] cursor-pointer items-center justify-center rounded-lg bg-slate-50 p-6 text-center text-lg"
      >
        {flipped ? (
          <span className="text-slate-800">{question.answer}</span>
        ) : (
          <span className="text-slate-700">{question.prompt}</span>
        )}
      </div>
      <p className="text-center text-xs text-slate-400">
        {flipped ? "Respuesta" : "Toca la tarjeta para ver la respuesta"}
      </p>

      {flipped && (
        <div>
          <p className="mb-2 text-center text-sm font-medium text-slate-600">
            ¿Qué tan bien la recordaste? (SM-2)
          </p>
          <div className="flex justify-center gap-2">
            {[0, 1, 2, 3, 4, 5].map((q) => (
              <button
                key={q}
                onClick={() => onRate(q)}
                className={`h-10 w-10 rounded-full text-sm font-semibold transition ${
                  rated === q
                    ? "bg-brand-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-brand-100"
                }`}
              >
                {q}
              </button>
            ))}
          </div>
          <div className="mt-1 flex justify-between px-1 text-[10px] text-slate-400">
            <span>0 · nada</span>
            <span>5 · perfecto</span>
          </div>
        </div>
      )}
    </Card>
  );
}

function MultipleChoice({
  question,
  selected,
  onSelect,
}: {
  question: QuizQuestionDTO;
  selected: string | null;
  onSelect: (option: string) => void;
}) {
  return (
    <Card className="space-y-3">
      <Badge color="brand">Opción múltiple</Badge>
      <p className="font-medium text-slate-800">{question.prompt}</p>
      <div className="grid gap-2">
        {question.options.map((opt) => (
          <button
            key={opt}
            onClick={() => onSelect(opt)}
            className={`rounded-lg border px-4 py-2 text-left text-sm transition ${
              selected === opt
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-slate-200 hover:bg-slate-50"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </Card>
  );
}
