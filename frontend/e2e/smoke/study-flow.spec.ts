import { expect, test } from "@playwright/test";

/**
 * Full first-use journey against the real backend in demo mode (MOCK LLM, isolated
 * QA database): upload → indexed → goal template → Estudiar → ready plan →
 * session → quiz → confirmed result → Estadísticas.
 */
test("a learner goes from material to a graded quiz entirely from Inicio", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/inicio");
  await expect(page.getByRole("heading", { name: "Prepara tu plan de estudio" })).toBeVisible();
  await expect(page.getByText("Modo demo activo")).toBeVisible();

  await page.locator('input[type="file"]').first().setInputFiles({
    name: "algoritmos.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(
      [
        "# Algoritmos",
        "",
        "## Grafos",
        "BFS recorre por niveles usando una cola; DFS profundiza usando una pila o recursión.",
        "",
        "## Ordenamiento",
        "Merge sort divide el arreglo y mezcla mitades ordenadas en O(n log n).",
        "",
        "## Estructuras de datos",
        "Un montículo binario permite extraer el mínimo en O(log n).",
      ].join("\n"),
    ),
  });

  const material = page.getByRole("checkbox", { name: "algoritmos.md" });
  await expect(material).toBeVisible({ timeout: 30_000 });
  await material.check();
  await page.getByRole("button", { name: /Universidad/ }).click();
  await expect(page.getByRole("textbox", { name: "Tu meta" })).toHaveValue("Aprobar el examen del curso");

  const study = page.getByRole("button", { name: "Estudiar" });
  await expect(study).toBeEnabled();
  await study.click();
  await expect(page.getByText("¡Tu plan está listo!")).toBeVisible({ timeout: 45_000 });
  await expect(page).toHaveURL(/\/inicio$/);

  await page.getByRole("link", { name: "Comenzar la siguiente sesión" }).click();
  await expect(page).toHaveURL(/\/session\/\d+$/);
  await page.getByRole("button", { name: "Saltar al receso" }).click();
  await page.getByRole("button", { name: "Ir al test" }).click();

  // Answer every question: rate flashcards, pick the first option of each multiple choice.
  for (let guard = 0; guard < 40; guard += 1) {
    await expect(page.getByText(new RegExp(`^Pregunta ${guard + 1} de \\d+$`))).toBeVisible();
    const reveal = page.getByRole("button", { name: "Mostrar respuesta" });
    if (await reveal.isVisible()) {
      await reveal.click();
      await page.getByRole("button", { name: /^Calidad 4/ }).click();
    } else {
      await page.getByRole("group", { name: "Opciones" }).getByRole("button").first().click();
    }
    const finish = page.getByRole("button", { name: "Finalizar" });
    if (await finish.isVisible()) {
      await finish.click();
      break;
    }
    await page.getByRole("button", { name: "Siguiente" }).click();
  }

  await expect(page.getByRole("heading", { name: "Resultado del test" })).toBeVisible();

  await page.goto("/dashboard");
  const summary = page.getByRole("region", { name: "Resumen del periodo" });
  await expect(summary.getByText("Sesiones completadas")).toBeVisible();
  await expect(summary).toContainText(/Sesiones completadas\s*1/);
});
