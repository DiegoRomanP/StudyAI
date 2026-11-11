import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { AssessmentResponseV2, AssessmentResultV2, LearningResponseV2 } from "../../src/api/adaptiveLearning";
import type { PlanDTO } from "../../src/api/types";

const apiOrigin = process.env.STUDYAI_QA_API_URL ?? "http://127.0.0.1:8002";
const documentName = "perfiles-academicos-qa.md";
const goalName = "Comparar fracciones y testimonios";
const optInLabel = "Adaptar la enseñanza y evaluación al perfil académico";
const writtenAnswer = "La perspectiva del narrador orienta la interpretación del testimonio.";
const mixedMaterial = "# Álgebra\n\n" + "Álgebra estudia relaciones. ".repeat(10) +
  "\n\n# Historia\n\n" + "Historia contrasta relatos. ".repeat(10);

async function createInputs(request: APIRequestContext, material = mixedMaterial, title = goalName) {
  const document = await request.post(`${apiOrigin}/documents/upload`, {
    multipart: {
      file: {
        name: documentName,
        mimeType: "text/markdown",
        buffer: Buffer.from(material),
      },
    },
  });
  expect(document.status()).toBe(201);
  const { id: documentId } = await document.json() as { id: number };
  await expect.poll(async () => {
    const response = await request.get(`${apiOrigin}/documents/${documentId}`);
    return (await response.json()).status;
  }).toBe("INDEXED");
  const goal = await request.post(`${apiOrigin}/goals`, {
    data: { goal_type: "LEARNING", title, description: "" },
  });
  expect(goal.status()).toBe(201);
  const { id: goalId } = await goal.json() as { id: number };
  return {
    goalId,
    documentId,
    cleanup: async () => {
      expect((await request.delete(`${apiOrigin}/goals/${goalId}`)).status()).toBe(204);
      expect((await request.delete(`${apiOrigin}/documents/${documentId}`)).status()).toBe(204);
    },
  };
}

async function enableAdaptiveMode(page: Page, profile: string) {
  const optIn = page.getByRole("checkbox", { name: optInLabel });
  await expect(optIn).not.toBeChecked();
  await optIn.press("Space");
  const profiles = page.getByRole("combobox", { name: "Perfil académico" });
  await expect(profiles).toHaveValue("auto");
  if (profile !== "auto") await profiles.selectOption(profile);
}

async function openLesson(page: Page, linkName: string) {
  await page.getByRole("link", { name: linkName }).click({ timeout: 45_000 });
  await expect(page).toHaveURL(/\/session\/\d+$/);
  await startLesson(page);
}

async function startLesson(page: Page) {
  await page.getByRole("button", { name: "Empezar", exact: true }).press("Enter");
  await expect(page.getByRole("heading", { name: "Objetivos de aprendizaje" })).toBeVisible();
}

async function submitAdaptiveAssessment(page: Page) {
  await page.getByRole("button", { name: "Terminé" }).press("Enter");
  const delivery = page.waitForResponse((response) =>
    response.request().method() === "GET" && /^\/quizzes\/\d+\/assessment-v2$/.test(new URL(response.url()).pathname),
  );
  await page.getByRole("button", { name: "Ir al test" }).press("Enter");
  const response = await delivery;
  expect(response.status()).toBe(200);
  const { questions, revision } = await response.json() as AssessmentResponseV2;
  const assessment = page.getByRole("region", { name: "Evaluación adaptativa" });
  await expect(assessment.getByText("Tiempo estimado: 10–15 min", { exact: true })).toBeVisible();
  await expect(assessment.getByRole("timer")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Reflexión formativa" })).toHaveCount(0);

  for (const [index, question] of questions.entries()) {
    const item = assessment.getByRole("region", { name: `Pregunta ${index + 1} de ${questions.length}` });
    await expect(item).toBeVisible();
    expect(question).not.toHaveProperty("expected_answer");
    expect(question).not.toHaveProperty("exemplar");
    switch (question.kind) {
      case "flashcard":
        await item.getByRole("button", { name: "Mostrar respuesta" }).press("Enter");
        await item.getByRole("radio", { name: /^Calidad 2\b/ }).press("Space");
        break;
      case "multiple_choice":
        await item.getByRole("radio").first().press("Space");
        break;
      case "true_false":
        await item.getByRole("radio", { name: "Falso", exact: true }).press("Space");
        break;
      case "essay":
        expect(question).not.toHaveProperty("rubric_criteria");
        await item.getByRole("textbox", { name: "Tu respuesta" }).fill(writtenAnswer);
        break;
      default:
        throw new Error(`Unexpected format in the linguistic mock: ${question.kind}`);
    }
    if (index < questions.length - 1) {
      await assessment.getByRole("button", { name: "Siguiente pregunta" }).press("Enter");
    }
  }

  const submitted = page.waitForResponse((event) =>
    event.request().method() === "POST" && /^\/quizzes\/\d+\/assessment-v2\/submit$/.test(new URL(event.url()).pathname),
  );
  await assessment.getByRole("button", { name: "Enviar evaluación" }).press("Enter");
  const resultResponse = await submitted;
  expect(resultResponse.status()).toBe(200);
  expect(resultResponse.request().postDataJSON()).toMatchObject({ revision });
  const result = await resultResponse.json() as AssessmentResultV2;
  const exemplar = result.formative_feedback.find((feedback) => feedback.submitted_text === writtenAnswer)?.exemplar;
  if (!exemplar) throw new Error("Expected a saved essay and its exemplar in the formative result.");
  const [objective] = result.objective_results;
  expect(objective?.total).toBeGreaterThan(0);

  await expect(page).toHaveURL(/\?fase=resultado$/);
  await expect(page.getByRole("heading", { name: "Resultados de evaluación" })).toBeVisible();
  await expect(page.getByText(`${objective.correct} de ${objective.total} respuestas correctas`, { exact: true })).toBeVisible();
  await expect(page.getByText(writtenAnswer, { exact: true })).toBeVisible();
  await expect(page.getByText(exemplar, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Añadir reflexión formativa" }).press("Enter");
  const reflection = page.getByRole("group", { name: "Reflexión formativa" });
  await reflection.getByRole("radio").first().press("Space");
  await expect(reflection.getByRole("radio").first()).toBeChecked();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Resultados de evaluación" })).toBeVisible();
  await expect(page.getByText(writtenAnswer, { exact: true })).toBeVisible();
  await expect(page.getByText(exemplar, { exact: true })).toBeVisible();
  await expect(reflection).not.toBeVisible();
}

test("Inicio teaches, submits, and reopens a linguistic assessment", async ({ page, request }) => {
  test.setTimeout(90_000);
  const inputs = await createInputs(request);
  try {
    await page.goto("/inicio");
    await page.getByRole("checkbox", { name: documentName }).check();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.getByText("Usar una meta guardada", { exact: true }).click();
    await page.getByRole("combobox", { name: "Meta guardada" }).selectOption(String(inputs.goalId));
    await enableAdaptiveMode(page, "linguistic_interpretive");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.getByRole("button", { name: "Seguir en modo demo" }).click();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();

    const generation = page.waitForRequest((event) =>
      event.method() === "POST" && new URL(event.url()).pathname === "/plans/generate",
    );
    await page.getByRole("button", { name: "Estudiar", exact: true }).click();
    expect((await generation).postDataJSON()).toMatchObject({
      content_version: 2, profile_hint: "linguistic_interpretive",
    });

    await openLesson(page, "Comenzar la siguiente sesión");
    await expect(page.getByText("Perfil efectivo: Perfil Lingüístico-Interpretativo")).toBeVisible();
    await submitAdaptiveAssessment(page);
  } finally {
    await inputs.cleanup();
  }
});

test("Planes sends automatic selection and links to the session from Práctica", async ({ page, request }) => {
  test.setTimeout(90_000);
  const inputs = await createInputs(request);
  try {
    await page.goto("/plan");
    await page.getByRole("combobox", { name: "Meta", exact: true }).selectOption(String(inputs.goalId));
    await page.getByRole("checkbox", { name: documentName }).check();
    await enableAdaptiveMode(page, "auto");

    const generation = page.waitForRequest((event) =>
      event.method() === "POST" && new URL(event.url()).pathname === "/plans/generate",
    );
    await page.getByRole("button", { name: "Generar plan" }).click();
    const requestSent = await generation;
    expect(requestSent.postDataJSON()).toMatchObject({ content_version: 2, profile_hint: "auto" });
    const response = await requestSent.response();
    if (!response) throw new Error("Expected a plan generation response.");
    expect(response.status()).toBe(202);
    const { id: planId } = await response.json() as { id: number };

    await openLesson(page, "Comenzar siguiente sesión");
    const planResponse = await request.get(`${apiOrigin}/plans/${planId}`);
    expect(planResponse.status()).toBe(200);
    const plan = await planResponse.json() as PlanDTO;
    const expectedProfiles = [
      ["logical_deductive", "Perfil Lógico-Deductivo"],
      ["critical_argumentative", "Perfil Crítico-Argumentativo"],
    ];
    const sessions = await Promise.all(plan.sessions.map(async (session) => {
      const response = await request.get(`${apiOrigin}/sessions/${session.id}/learning-v2`);
      expect(response.status()).toBe(200);
      const lesson = await response.json() as LearningResponseV2;
      return { id: session.id, profile: lesson.snapshot.profile_id };
    }));
    for (const [profile, label] of expectedProfiles) {
      const session = sessions.find((item) => item.profile === profile);
      if (!session) throw new Error(`Expected a mixed-material session for ${profile}.`);
      if (!page.url().endsWith(`/session/${session.id}`)) {
        await page.goto(`/session/${session.id}`);
        await startLesson(page);
      }
      await expect(page.getByText(`Perfil efectivo: ${label}`, { exact: true })).toBeVisible();
    }

    const legacyQuizRequests: string[] = [];
    page.on("request", (event) => {
      if (/^\/quizzes\/\d+$/.test(new URL(event.url()).pathname)) legacyQuizRequests.push(event.url());
    });
    await page.goto(`/practica?plan=${planId}`);
    await page.getByRole("link", { name: /^Abrir evaluación de / }).first().press("Enter");
    await expect(page).toHaveURL(/\/session\/\d+\?fase=test$/);
    await expect(page.getByRole("heading", { name: "Evaluación adaptativa" })).toBeVisible();
    expect(legacyQuizRequests).toEqual([]);
  } finally {
    await inputs.cleanup();
  }
});

const profileCases = [
  { hint: "logical_deductive", label: "Perfil Lógico-Deductivo", topic: "Álgebra", block: "Ejemplo resuelto", estimate: "3–5" },
  { hint: "critical_argumentative", label: "Perfil Crítico-Argumentativo", topic: "Historia", block: "Comparación de fuentes", estimate: "8–12" },
  { hint: "systemic_empirical", label: "Perfil Sistémico-Empírico", topic: "Biología", block: "Análisis de observaciones", estimate: "3–8" },
  { hint: "applied_practical", label: "Perfil Aplicado-Práctico", topic: "Economía", block: "Toma de decisiones", estimate: "5–10" },
  { hint: "auto", label: "General (perfil de respaldo)", topic: "Taller", block: "Práctica", estimate: "5–10" },
];

for (const { hint, label, topic, block, estimate } of profileCases) {
  test(`renders the lesson and timing for ${label}`, async ({ page, request }) => {
    const inputs = await createInputs(request, `# ${topic}\n\nConceptos de ${topic}.`, `Estudiar ${topic}`);
    try {
      const generated = await request.post(`${apiOrigin}/plans/generate`, {
        data: { goal_id: inputs.goalId, document_ids: [inputs.documentId], content_version: 2, profile_hint: hint },
      });
      expect(generated.status()).toBe(202);
      const { id: planId } = await generated.json() as { id: number };
      await expect.poll(async () => {
        const response = await request.get(`${apiOrigin}/plans/${planId}/status`);
        return (await response.json()).status;
      }).toBe("READY");
      const response = await request.get(`${apiOrigin}/plans/${planId}`);
      expect(response.status()).toBe(200);
      const plan = await response.json() as PlanDTO;
      const sessionId = plan.sessions[0].id;
      await page.goto(`/session/${sessionId}`);
      await startLesson(page);
      await expect(page.getByText(`Perfil efectivo: ${label}`, { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: block, exact: true })).toBeVisible();

      await page.goto(`/session/${sessionId}?fase=test`);
      const assessment = page.getByRole("region", { name: "Evaluación adaptativa" });
      await expect(assessment.getByText(`Tiempo estimado: ${estimate} min`, { exact: true })).toBeVisible();
    } finally {
      await inputs.cleanup();
    }
  });
}
