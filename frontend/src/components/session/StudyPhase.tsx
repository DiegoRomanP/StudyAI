import { useMemo } from "react";
import {
  ArrowRight,
  Droplets,
  Dumbbell,
  Eye,
  Footprints,
  Play,
  Video,
  Wind,
  type LucideIcon,
} from "lucide-react";

import { formatTime, useTimer } from "../../hooks/useTimer";
import { youtubeSearchUrl } from "../../lib/youtube";
import { Button, Card } from "../ui";
import { SafeMarkdown } from "./SafeMarkdown";

const BREAK_ACTIVITIES: { icon: LucideIcon; text: string }[] = [
  { icon: Footprints, text: "Camina 5 minutos y estírate." },
  { icon: Droplets, text: "Bebe un vaso de agua y respira profundo 10 veces." },
  { icon: Eye, text: "Mira por la ventana a un punto lejano para descansar la vista." },
  { icon: Dumbbell, text: "Haz 10 sentadillas o saltos para activar la circulación." },
  { icon: Wind, text: "Cierra los ojos y haz una pausa de respiración consciente." },
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
          {!running && remaining > 0 && (
            <Button onClick={start}>
              <Play aria-hidden="true" className="h-4 w-4" />
              Iniciar
            </Button>
          )}
          <Button variant="secondary" onClick={finish}>
            Saltar al receso
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      <Card>
        <div className="prose-study mx-auto max-w-reading">
          <SafeMarkdown>{markdown || "_Sin material._"}</SafeMarkdown>
        </div>
      </Card>

      {keywords.length > 0 && (
        <Card>
          <h3 className="mb-2 flex items-center gap-2 font-semibold">
            <Video aria-hidden="true" className="h-5 w-5 text-action-hover" />
            Buscar videos relacionados
          </h3>
          <div className="flex flex-wrap gap-2">
            {keywords.map((keyword, index) => (
              <a
                key={`${index}-${keyword}`}
                href={youtubeSearchUrl(keyword)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm text-text-primary hover:border-action-hover hover:text-action-hover"
              >
                <Play aria-hidden="true" className="h-3.5 w-3.5" />
                {keyword}
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
  const ActivityIcon = activity.icon;
  const { remaining, running, start, finish } = useTimer(5 * 60, onDone);

  return (
    <Card className="space-y-4 text-center">
      <h2 className="text-lg font-semibold">Receso activo (5 min)</h2>
      <p className="flex items-center justify-center gap-3 text-xl">
        <ActivityIcon aria-hidden="true" className="h-6 w-6 shrink-0 text-action-hover" />
        {activity.text}
      </p>
      <div className="font-mono text-3xl font-semibold text-action-hover">{formatTime(remaining)}</div>
      <div className="flex justify-center gap-2">
        {!running && remaining > 0 && (
          <Button onClick={start}>
            <Play aria-hidden="true" className="h-4 w-4" />
            Iniciar receso
          </Button>
        )}
        <Button variant="secondary" onClick={finish}>
          Ir al test
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
