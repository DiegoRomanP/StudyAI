/**
 * "¿Cómo funciona esta página?" content, rendered by `PageGuide`. Tests import these
 * constants instead of repeating the copy.
 */
export type GuideId = "recursos" | "metas" | "conectar-ia" | "plan" | "practica" | "temas";

export interface PageGuideContent {
  title: string;
  steps: string[];
  next?: { to: string; label: string };
}

export const PAGE_GUIDES: Record<GuideId, PageGuideContent> = {
  recursos: {
    title: "¿Cómo funciona Recursos?",
    steps: [
      "Sube un PDF o Markdown (apuntes, temario, libro).",
      "Espera a que aparezca «Listo para usar» (unos segundos).",
      "Elígelo al preparar tu plan.",
    ],
    next: { to: "/goals", label: "Elegir mi meta" },
  },
  metas: {
    title: "¿Para qué sirve una meta?",
    steps: [
      "Elige una plantilla o escribe tu objetivo.",
      "Elige el tipo de estudio: cambia la mezcla de preguntas y tarjetas.",
      "Úsala para generar tu plan.",
    ],
    next: { to: "/plan", label: "Generar mi plan" },
  },
  "conectar-ia": {
    title: "¿Necesito conectar una IA?",
    steps: [
      "No es obligatorio: sin clave, StudyAI usa el modo demo con respuestas de ejemplo.",
      "Para planes reales, pega tu clave en un proveedor y guárdala.",
      "Elige un modelo y pulsa «Probar configuración guardada».",
      "Si la prueba sale bien, pulsa «Activar».",
    ],
    next: { to: "/inicio", label: "Volver a Inicio" },
  },
  plan: {
    title: "¿Cómo se crea un plan?",
    steps: [
      "Elige una meta y los documentos que quieres estudiar.",
      "Pulsa «Generar plan»: la IA tarda unos minutos.",
      "Abre el plan y empieza por la primera sesión.",
    ],
  },
  practica: {
    title: "Dos formas de practicar",
    steps: [
      "Preguntas: repasa con respuesta inmediata; no se guarda nada.",
      "Simulacro: haz el test de una sesión; tu resultado cuenta en Estadísticas y en tus repasos.",
    ],
  },
  temas: {
    title: "¿Qué son los temas clave?",
    steps: [
      "La IA lee tu material y estima qué temas importan más.",
      "Tu plan se centra en los marcados como prioritarios.",
      "El resto queda fuera para que estudies menos y mejor.",
    ],
    next: { to: "/plan", label: "Ver mi plan" },
  },
};
