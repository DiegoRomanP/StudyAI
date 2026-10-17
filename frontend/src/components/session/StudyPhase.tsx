import { useMemo } from "react";

import { formatTime, useTimer } from "../../hooks/useTimer";
import { youtubeSearchUrl } from "../../lib/youtube";
import { Button, Card } from "../ui";
import { SafeMarkdown } from "./SafeMarkdown";

const BREAK_ACTIVITIES = [
  "🚶 Camina 5 minutos y estírate.",
  "💧 Bebe un vaso de agua y respira profundo 10 veces.",
  "👀 Mira por la ventana a un punto lejano para descansar la vista.",
  "🤸 Haz 10 sentadillas o saltos para activar la circulación.",
  "🧘 Cierra los ojos y haz una pausa de respiración consciente.",
];

export function StudyPhase({
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
      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-3xl font-semibold text-action-hover">
            {formatTime(remaining)}
          </span>
          <span className="text-sm text-text-muted">tiempo de estudio</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {!running && remaining > 0 && <Button onClick={start}>▶ Iniciar</Button>}
          <Button variant="secondary" onClick={finish}>
            Saltar al receso →
          </Button>
        </div>
      </Card>

      <Card>
        <div className="prose-study max-w-none">
          <SafeMarkdown>{markdown || "_Sin material._"}</SafeMarkdown>
        </div>
      </Card>

      {keywords.length > 0 && (
        <Card>
          <h3 className="mb-2 font-semibold">🔎 Buscar videos relacionados</h3>
          <div className="flex flex-wrap gap-2">
            {keywords.map((keyword, index) => (
              <a
                key={`${index}-${keyword}`}
                href={youtubeSearchUrl(keyword)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-control border border-line px-3 py-1.5 text-sm text-text-primary hover:border-action-hover hover:text-action-hover"
              >
                ▶ {keyword}
              </a>
            ))}
          </div>
          <p className="mt-2 text-xs text-text-muted">
            Son búsquedas seguras en YouTube (nunca enlaces generados por la IA).
          </p>
        </Card>
      )}
    </div>
  );
}

export function BreakPhase({ onDone }: { onDone: () => void }) {
  const activity = useMemo(
    () => BREAK_ACTIVITIES[Math.floor(Math.random() * BREAK_ACTIVITIES.length)],
    [],
  );
  const { remaining, running, start, finish } = useTimer(5 * 60, onDone);

  return (
    <Card className="space-y-4 text-center">
      <h2 className="text-lg font-semibold">Receso activo (5 min)</h2>
      <p className="text-xl">{activity}</p>
      <div className="font-mono text-3xl font-semibold text-action-hover">{formatTime(remaining)}</div>
      <div className="flex justify-center gap-2">
        {!running && remaining > 0 && <Button onClick={start}>▶ Iniciar receso</Button>}
        <Button variant="secondary" onClick={finish}>
          Ir al test →
        </Button>
      </div>
    </Card>
  );
}
