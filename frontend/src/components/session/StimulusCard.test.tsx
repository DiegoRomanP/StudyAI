import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { FigureStimulus, SvgStimulus } from "../../api/adaptiveLearning";
import { StimulusCard } from "./LessonBlocks";

const base = { title: "Ciclo del agua", objective_ids: ["ciclo"] };

describe("StimulusCard images", () => {
  it("shows an AI drawing only as an image data URI, never as inline markup", () => {
    const svg: SvgStimulus = {
      ...base,
      id: "dibujo",
      kind: "svg",
      origin: "generated_example",
      svg: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'><text>Nube → lluvia</text></svg>",
      text_alternative: "Nube y lluvia.",
    };
    const { container } = render(<StimulusCard stimulus={svg} />);

    const image = screen.getByRole("img", { name: "Nube y lluvia." });
    expect(image.getAttribute("src")).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(atob(image.getAttribute("src")!.split(",")[1])).toContain("Nube");
    expect(container.querySelector("svg text")).toBeNull();
  });

  it("loads a document figure from the backend by its numeric ID", () => {
    const figure: FigureStimulus = {
      ...base,
      id: "figura",
      kind: "figure",
      origin: "derived",
      source_id: "fragment-1",
      asset_id: 7,
      text_alternative: "Diagrama del libro.",
    };
    render(<StimulusCard stimulus={figure} />);

    expect(screen.getByRole("img", { name: "Diagrama del libro." }).getAttribute("src")).toMatch(
      /\/documents\/figures\/7$/,
    );
  });
});
