/**
 * Short, friendly definitions for the jargon the app can't avoid. `HelpTerm` shows
 * them on demand; the visible UI text uses the plain `label`.
 */
export type TermId =
  | "temasClave"
  | "repaso"
  | "preparando"
  | "sesion"
  | "simulacro"
  | "flashcard"
  | "metaExamen"
  | "metaAprender"
  | "metaMemorizar"
  | "proveedorIA"
  | "modoDemo"
  | "relevancia"
  | "dificultad"
  | "precision";

export interface GlossaryEntry {
  label: string;
  definition: string;
}

export const GLOSSARY: Record<TermId, GlossaryEntry> = {
  temasClave: {
    label: "temas clave",
    definition:
      "Siguiendo la regla 80/20 (Pareto), la IA elige el 20 % de temas que más pesan en tu material para que estudies menos y mejor.",
  },
  repaso: {
    label: "repaso espaciado",
    definition:
      "Repasas justo antes de olvidar: primero a los pocos días y luego cada vez más espaciado según cómo valores cada tarjeta (algoritmo SM-2).",
  },
  preparando: {
    label: "preparando",
    definition:
      "Tras subir un archivo lo leemos y lo dividimos en fragmentos (indexar) para que la IA encuentre lo importante. Tarda unos segundos.",
  },
  sesion: {
    label: "sesión",
    definition: "Un bloque corto de estudio: lees el material, haces un receso de 5 minutos y terminas con un test.",
  },
  simulacro: {
    label: "simulacro",
    definition:
      "Haces el test de una sesión como si fuera de verdad: tu resultado cuenta en Estadísticas y en tus repasos.",
  },
  flashcard: {
    label: "tarjeta",
    definition:
      "Una tarjeta de memoria (flashcard): ves la pregunta, piensas la respuesta y luego valoras cuánto la recordabas. No puntúa.",
  },
  metaExamen: {
    label: "Examen",
    definition: "Cada test trae 7 preguntas de opción múltiple y 3 tarjetas, para practicar como en el examen.",
  },
  metaAprender: {
    label: "Aprender",
    definition: "Cada test trae 5 preguntas y 5 tarjetas: equilibrio entre entender y recordar.",
  },
  metaMemorizar: {
    label: "Memorizar",
    definition: "Cada test trae 8 tarjetas y 2 preguntas de opción múltiple, para fijar datos.",
  },
  proveedorIA: {
    label: "proveedor de IA",
    definition:
      "El servicio cuyo modelo genera tus planes (OpenAI, Anthropic, OpenRouter…). Usas tu propia clave y pagas a ese servicio, no a StudyAI.",
  },
  modoDemo: {
    label: "modo demo",
    definition:
      "Sin clave de IA, StudyAI genera planes con respuestas de ejemplo. Sirve para probar todo el recorrido sin coste.",
  },
  relevancia: {
    label: "relevancia",
    definition: "Una estimación de la IA de cuánto pesa cada tema en tu material. Es orientativa, no una garantía.",
  },
  dificultad: {
    label: "dificultad",
    definition: "Escala de 1 a 5 estimada por la IA, donde 5 es lo más difícil.",
  },
  precision: {
    label: "precisión",
    definition: "Porcentaje de aciertos en las preguntas de opción múltiple. Las tarjetas no cuentan.",
  },
};
