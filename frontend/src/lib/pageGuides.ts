/**
 * "¿Cómo funciona esta página?" content, rendered by `PageGuide` as a "?" popover.
 * Tests import these constants instead of repeating the copy. Steps: at most 3, 10 words each.
 */
export type GuideId =
  | "recursos"
  | "metas"
  | "conectar-ia"
  | "plan"
  | "plan-detalle"
  | "practica"
  | "temas"
  | "preguntas"
  | "estadisticas";

export interface PageGuideContent {
  title: string;
  steps: string[];
}

export const PAGE_GUIDES: Record<GuideId, PageGuideContent> = {
  recursos: {
    title: "¿Cómo funciona Recursos?",
    steps: ["Sube PDF o Markdown (máx. 25 MB).", "Espera el ✓ verde.", "Elígelo al crear un plan."],
  },
  metas: {
    title: "¿Para qué sirve una meta?",
    steps: ["Plantilla o título propio.", "El tipo cambia la mezcla de preguntas y tarjetas."],
  },
  "conectar-ia": {
    title: "¿Necesito conectar una IA?",
    steps: ["Sin IA conectada, StudyAI usa respuestas de ejemplo.", "Guarda clave → Probar → Activar."],
  },
  plan: {
    title: "¿Cómo se crea un plan?",
    steps: ["«+ Nuevo plan» abre el asistente en Inicio.", "Tarda unos minutos; la página se actualiza sola."],
  },
  "plan-detalle": {
    title: "¿Cómo es cada sesión?",
    steps: ["Cada sesión: Estudio → Receso → Test."],
  },
  practica: {
    title: "Dos formas de practicar",
    steps: ["Preguntas: respuesta inmediata, no se guarda.", "Simulacro: cuenta en Estadísticas y repasos."],
  },
  temas: {
    title: "¿Qué son los temas clave?",
    steps: [
      "La IA estima qué temas importan más (80/20).",
      "Relevancia: peso estimado; dificultad 5 = más difícil.",
      "El plan se centra en los priorizados.",
    ],
  },
  preguntas: {
    title: "¿Cómo funciona el asistente?",
    steps: ["Pregunta al asistente durante una sesión.", "En el examen solo da pistas."],
  },
  estadisticas: {
    title: "¿Qué ves en Estadísticas?",
    steps: ["Repaso: volver a una tarjeta justo antes de olvidarla.", "Precisión media: aciertos en preguntas de opción múltiple."],
  },
};
