import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { GenerationStage } from "../api/types";
import { GenerationProgress, generationLabel } from "../components/plan/GenerationProgress";

function renderProgress(stage: GenerationStage | null, done = 0, total = 0) {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <GenerationProgress stage={stage} done={done} total={total} />
    </MemoryRouter>,
  );
}

function currentStep() {
  return screen.getAllByRole("listitem").find((item) => item.getAttribute("aria-current") === "step");
}

describe("GenerationProgress", () => {
  it.each([
    [null, "Leer tu material y detectar los temas"],
    ["TOPICS", "Leer tu material y detectar los temas"],
    ["SESSIONS", "Elegir los temas clave y repartir las sesiones"],
    ["CONTENT", "Preparar cada sesión con material y preguntas"],
  ] as const)("marks the current step for stage %s", (stage, text) => {
    renderProgress(stage, 0, 3);

    expect(screen.getAllByRole("listitem").filter((item) => item.hasAttribute("aria-current"))).toHaveLength(1);
    expect(currentStep()).toHaveTextContent(text);
  });

  it("marks the earlier steps as done", () => {
    renderProgress("CONTENT", 1, 3);

    expect(screen.getAllByText("(hecho)")).toHaveLength(2);
  });

  it.each(["TOPICS", "SESSIONS"] as const)("draws no bar during %s", (stage) => {
    renderProgress(stage, 0, 3);

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("draws the real share of prepared sessions during CONTENT", () => {
    renderProgress("CONTENT", 1, 3);

    expect(screen.getByRole("progressbar", { name: "Sesiones preparadas" })).toHaveAttribute("aria-valuenow", "33");
    expect(screen.getByRole("status", { name: "Preparando la sesión 2 de 3" })).toBeInTheDocument();
  });

  it("draws no bar while the session count is still unknown", () => {
    renderProgress("CONTENT", 0, 0);

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});

describe("generationLabel", () => {
  it.each([
    [{ progress_stage: null }, "Analizando tu material…"],
    [{ progress_stage: "TOPICS" as const }, "Analizando tu material…"],
    [{ progress_stage: "SESSIONS" as const }, "Repartiendo las sesiones…"],
    [{ progress_stage: "CONTENT" as const, progress_done: 0, progress_total: 3 }, "Preparando la sesión 1 de 3"],
    [{ progress_stage: "CONTENT" as const, progress_done: 3, progress_total: 3 }, "Preparando la sesión 3 de 3"],
    [{ progress_stage: "CONTENT" as const, progress_done: 0, progress_total: 0 }, "Preparando las sesiones…"],
  ])("describes %o", (plan, label) => {
    expect(generationLabel(plan)).toBe(label);
  });
});
