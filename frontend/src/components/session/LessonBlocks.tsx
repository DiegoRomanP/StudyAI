import type {
  BloomLevel,
  DiagramStimulus,
  FigureStimulus,
  GraphStimulus,
  LearningResponseV2,
  LessonStimulus,
  PedagogySnapshot,
  SvgStimulus,
} from "../../api/adaptiveLearning";
import { apiClient } from "../../api/client";
import { Badge, Card } from "../ui";
import { SafeMarkdown } from "./SafeMarkdown";

const BLOOM_LABELS: Record<BloomLevel, string> = {
  remember: "Recordar",
  understand: "Comprender",
  apply: "Aplicar",
  analyze: "Analizar",
  evaluate: "Evaluar",
  create: "Crear",
};

const LEGACY_PROFILE_LABELS: Record<"history" | "mathematics" | "general", string> = {
  history: "Crítico-Argumentativo (compatibilidad histórica)",
  mathematics: "Lógico-Deductivo (compatibilidad histórica)",
  general: "General (fallback técnico)",
};
const UNTRACEABLE_SOURCE_LABEL = "Fragmento del material de estudio; sin procedencia trazable";

function profileLabel(snapshot: PedagogySnapshot): string {
  if (snapshot.profile_id === "general") return "General (perfil de respaldo)";
  return "name" in snapshot ? snapshot.name : LEGACY_PROFILE_LABELS[snapshot.profile_id];
}

function provenanceLabel(stimulus: LessonStimulus): string {
  if (stimulus.origin === "generated_example") {
    return "Ejemplo generado; no es evidencia del material fuente.";
  }
  return UNTRACEABLE_SOURCE_LABEL;
}

function unitLabel(label: string, unit: string | null | undefined) {
  return unit ? `${label} (${unit})` : label;
}

function GraphTable({ stimulus }: { stimulus: GraphStimulus }) {
  return (
    <>
      <div className="overflow-x-auto rounded-control border border-line">
        <table className="min-w-full border-collapse text-left text-sm" aria-label={`Datos de ${stimulus.title}`}>
          <caption className="px-3 py-2 text-left font-medium text-text-primary">
            Datos de {stimulus.title}
          </caption>
          <thead className="bg-surface-subtle text-text-primary">
            <tr>
              <th scope="col" className="border-t border-line px-3 py-2 font-semibold">
                {unitLabel(stimulus.x_label, stimulus.x_unit)}
              </th>
              <th scope="col" className="border-t border-line px-3 py-2 font-semibold">Serie</th>
              <th scope="col" className="border-t border-line px-3 py-2 font-semibold">
                {unitLabel(stimulus.y_label, stimulus.y_unit)}
              </th>
            </tr>
          </thead>
          <tbody>
            {stimulus.series.flatMap((series, seriesIndex) =>
              series.points.map((point, pointIndex) => (
                <tr key={`${seriesIndex}:${pointIndex}`}>
                  <th scope="row" className="border-t border-line px-3 py-2 font-medium text-text-primary">
                    {point.x}
                  </th>
                  <td className="border-t border-line px-3 py-2 text-text-primary">{series.name}</td>
                  <td className="border-t border-line px-3 py-2 text-text-primary">{point.y}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
      <details className="rounded-control border border-line p-3">
        <summary className="min-h-11 cursor-pointer py-2 font-medium text-text-primary">
          Alternativa textual
        </summary>
        <p className="pt-2 text-sm text-text-muted">{stimulus.text_alternative}</p>
      </details>
    </>
  );
}

function DiagramDescription({ stimulus }: { stimulus: DiagramStimulus }) {
  const labelById = new Map(stimulus.nodes.map((node) => [node.id, node.label]));

  return (
    <div className="space-y-3">
      <p className="font-medium text-text-primary">Descripción textual del diagrama</p>
      <p>{stimulus.text_alternative}</p>
      <ul aria-label={`Relaciones de ${stimulus.title}`} className="list-disc space-y-1 pl-5">
        {stimulus.edges.map((edge) => (
          <li key={`${edge.from_id}:${edge.to_id}:${edge.label}`}>
            {labelById.get(edge.from_id) ?? edge.from_id} — {edge.label} → {labelById.get(edge.to_id) ?? edge.to_id}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** UTF-8 safe base64 for a data: URI. */
function toBase64(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// Inside <img> an SVG never runs scripts or loads anything: a second line of defence
// behind the server-side allowlist. Never inject it as markup.
export function SvgFigure({ stimulus }: { stimulus: SvgStimulus }) {
  return (
    <figure className="space-y-2">
      <img
        src={`data:image/svg+xml;base64,${toBase64(stimulus.svg)}`}
        alt={stimulus.text_alternative}
        className="mx-auto max-h-[28rem] w-full rounded-control bg-white object-contain p-2"
      />
      <figcaption className="text-sm text-text-muted">{stimulus.text_alternative}</figcaption>
    </figure>
  );
}

// The URL is built here from a numeric ID, never taken from the LLM.
export function DocumentFigure({ stimulus }: { stimulus: FigureStimulus }) {
  const src = `${apiClient.defaults.baseURL ?? ""}/documents/figures/${Number(stimulus.asset_id)}`;
  return (
    <figure className="space-y-2">
      <img
        src={src}
        alt={stimulus.text_alternative}
        loading="lazy"
        className="mx-auto max-h-[28rem] w-full rounded-control bg-white object-contain"
      />
      <figcaption className="text-sm text-text-muted">{stimulus.text_alternative}</figcaption>
    </figure>
  );
}

export function StimulusCard({ stimulus }: { stimulus: LessonStimulus }) {
  return (
    <Card className="space-y-3 bg-surface-subtle" aria-label={`Estímulo: ${stimulus.title}`}>
      <h4 className="font-semibold text-text-primary">{stimulus.title}</h4>
      <p className="text-sm text-text-muted">{provenanceLabel(stimulus)}</p>
      {stimulus.kind === "graph" ? (
        <GraphTable stimulus={stimulus} />
      ) : stimulus.kind === "diagram" ? (
        <DiagramDescription stimulus={stimulus} />
      ) : stimulus.kind === "svg" ? (
        <SvgFigure stimulus={stimulus} />
      ) : stimulus.kind === "figure" ? (
        <DocumentFigure stimulus={stimulus} />
      ) : (
        <div className="prose-study max-w-none">
          <SafeMarkdown>{stimulus.body_markdown}</SafeMarkdown>
        </div>
      )}
    </Card>
  );
}

export function LessonBlocks({ lesson }: { lesson: LearningResponseV2 }) {
  const objectives = lesson.snapshot.objectives;
  const objectiveById = new Map(objectives.map((objective) => [objective.id, objective]));
  const stimulusById = new Map((lesson.stimuli ?? []).map((stimulus) => [stimulus.id, stimulus]));

  return (
    <section aria-label="Lección adaptativa" className="space-y-6 not-prose">
      <div className="rounded-surface border border-line bg-surface-paper p-4">
        <p className="font-semibold text-text-primary">Perfil efectivo: {profileLabel(lesson.snapshot)}</p>
        <p className="mt-1 text-sm text-text-muted">
          {"profile_version" in lesson.snapshot ? `Versión ${lesson.snapshot.profile_version}` : "Perfil histórico"}
        </p>
      </div>

      {objectives.length > 0 && (
        <section aria-labelledby="adaptive-objectives-title" className="space-y-3">
          <h2 id="adaptive-objectives-title" className="font-display text-lg font-semibold text-text-primary">
            Objetivos de aprendizaje
          </h2>
          <ul className="space-y-3">
            {objectives.map((objective) => (
              <li key={objective.id} className="rounded-surface border border-line bg-surface-paper p-4">
                <p className="font-medium text-text-primary">{objective.skill}</p>
                <p className="mt-1 text-sm text-text-muted">{objective.description}</p>
                {objective.bloom_target && (
                  <span className="mt-2 inline-block">
                    <Badge color="brand">Bloom: {BLOOM_LABELS[objective.bloom_target]}</Badge>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {lesson.lesson_blocks.length > 0 ? (
        <div className="space-y-5">
          {lesson.lesson_blocks.map((block, index) => {
            const linkedObjectives = block.objective_ids
              .map((objectiveId) => objectiveById.get(objectiveId))
              .filter((objective) => objective !== undefined);
            const stimulus = block.stimulus_id ? stimulusById.get(block.stimulus_id) : undefined;
            return (
              <article key={block.id} className="space-y-3">
                {block.source_refs && block.source_refs.length > 0 && (
                  <p className="text-sm text-text-muted">{UNTRACEABLE_SOURCE_LABEL}</p>
                )}
                {linkedObjectives.length > 0 && (
                  <p className="text-sm text-action-hover">
                    {linkedObjectives.map((objective) => objective.skill).join(" · ")}
                  </p>
                )}
                <div className="prose-study max-w-none">
                  <SafeMarkdown>{block.content_markdown}</SafeMarkdown>
                </div>
                {stimulus && <StimulusCard key={stimulus.id} stimulus={stimulus} />}
                {index < lesson.lesson_blocks.length - 1 && <hr className="border-line" />}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="prose-study max-w-none">
          <SafeMarkdown>{lesson.content_markdown || "_Sin material adaptativo._"}</SafeMarkdown>
        </div>
      )}
    </section>
  );
}
