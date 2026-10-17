/**
 * Sample content for the "Ver demo" walkthrough. Everything here is illustrative and
 * lives only in the browser: the demo never imports the API client or touches the
 * backend. Widgets the real API cannot back yet (explanations, wrong-answer history,
 * study time) appear only here, behind the "Demostración simulada" banner (T12).
 */

export interface DemoTopic {
  name: string;
  relevance: number;
  difficulty: number;
}

export const DEMO_TOPICS: DemoTopic[] = [
  { name: "Algoritmos", relevance: 95, difficulty: 4 },
  { name: "Estructuras de datos", relevance: 88, difficulty: 4 },
  { name: "Bases de datos", relevance: 72, difficulty: 3 },
  { name: "Sistemas distribuidos", relevance: 64, difficulty: 5 },
  { name: "Redes", relevance: 60, difficulty: 2 },
];

export const DEMO_TODAY = {
  minutes: 35,
  topic: "Algoritmos",
  steps: [
    { label: "Repaso rápido", detail: "5 min" },
    { label: "Preguntas", detail: "15 min" },
    { label: "Práctica guiada", detail: "10 min" },
    { label: "Resumen", detail: "5 min" },
  ],
};

export const DEMO_PROGRESS = { percent: 68, mastered: 12, inProgress: 5, toReview: 3, streakDays: 5 };

export interface DemoPlanDay {
  day: string;
  topic: string;
  hours: string;
  progress: number;
}

export const DEMO_WEEK: DemoPlanDay[] = [
  { day: "Lun", topic: "Estructuras de datos", hours: "2 h", progress: 80 },
  { day: "Mar", topic: "Algoritmos", hours: "2 h", progress: 60 },
  { day: "Mié", topic: "Bases de datos", hours: "1,5 h", progress: 40 },
  { day: "Jue", topic: "Sistemas distribuidos", hours: "2 h", progress: 20 },
  { day: "Vie", topic: "Redes", hours: "1,5 h", progress: 0 },
];

export const DEMO_MONTH = [
  { week: "Semana 1", focus: "Algoritmos y estructuras de datos", sessions: 5, done: 5 },
  { week: "Semana 2", focus: "Bases de datos", sessions: 4, done: 3 },
  { week: "Semana 3", focus: "Sistemas distribuidos", sessions: 4, done: 0 },
  { week: "Semana 4", focus: "Repaso espaciado y simulacro", sessions: 3, done: 0 },
];

export interface DemoQuestion {
  id: number;
  topic: string;
  hard: boolean;
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
}

export const DEMO_QUESTIONS: DemoQuestion[] = [
  {
    id: 1,
    topic: "Algoritmos",
    hard: true,
    prompt:
      "¿Cuál es la complejidad temporal del siguiente algoritmo?\n\n```python\nfor i in range(n):\n    for j in range(i, n):\n        print(i, j)\n```",
    options: ["O(n)", "O(log n)", "O(n²)", "O(2ⁿ)"],
    answer: "O(n²)",
    explanation:
      "El bucle interno se ejecuta n, n−1, …, 1 veces: en total n(n+1)/2 iteraciones, que crece como n².",
  },
  {
    id: 2,
    topic: "Estructuras de datos",
    hard: true,
    prompt: "¿Qué estructura permite insertar y extraer el mínimo en O(log n)?",
    options: ["Pila", "Montículo binario", "Lista enlazada", "Tabla hash"],
    answer: "Montículo binario",
    explanation:
      "Un montículo binario mantiene el mínimo en la raíz; insertar o extraer solo recorre la altura del árbol, log n.",
  },
  {
    id: 3,
    topic: "Bases de datos",
    hard: false,
    prompt: "¿Qué propiedad ACID garantiza que una transacción se aplica completa o no se aplica?",
    options: ["Atomicidad", "Consistencia", "Aislamiento", "Durabilidad"],
    answer: "Atomicidad",
    explanation: "La atomicidad trata la transacción como una unidad indivisible: todo o nada.",
  },
  {
    id: 4,
    topic: "Redes",
    hard: false,
    prompt: "¿En qué capa del modelo OSI trabaja el protocolo TCP?",
    options: ["Red", "Transporte", "Sesión", "Aplicación"],
    answer: "Transporte",
    explanation: "TCP ofrece entrega fiable entre procesos: es un protocolo de la capa de transporte (4).",
  },
];

export type DemoRange = "7d" | "30d" | "all";

export const DEMO_STATS: Record<
  DemoRange,
  { points: number[]; answered: number; answeredTrend: number; accuracy: number; accuracyTrend: number; studyHours: number; studyTrend: number }
> = {
  "7d": { points: [52, 58, 55, 64, 70, 74, 82], answered: 320, answeredTrend: 28, accuracy: 82, accuracyTrend: 12, studyHours: 18, studyTrend: 35 },
  "30d": { points: [40, 46, 51, 49, 57, 62, 66, 71, 75, 82], answered: 1140, answeredTrend: 19, accuracy: 76, accuracyTrend: 9, studyHours: 64, studyTrend: 22 },
  all: { points: [30, 38, 41, 47, 53, 58, 63, 69, 74, 79, 82], answered: 2410, answeredTrend: 0, accuracy: 71, accuracyTrend: 0, studyHours: 131, studyTrend: 0 },
};

export const DEMO_PROVIDERS = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic (Claude)" },
  { id: "gemini", label: "Google (Gemini)" },
  { id: "ollama", label: "Ollama (Local)" },
  { id: "openrouter", label: "OpenRouter" },
] as const;
