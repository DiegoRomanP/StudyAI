import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GLOSSARY } from "../../lib/glossary";
import { HelpTerm } from "./HelpTerm";

describe("HelpTerm", () => {
  it("opens the definition, closes it with Esc and returns focus", () => {
    render(
      <p>
        Estudia los <HelpTerm term="temasClave" /> primero. <button type="button">Fuera</button>
      </p>,
    );

    const term = screen.getByRole("button", { name: GLOSSARY.temasClave.label });
    expect(term).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.click(term);
    expect(term).toHaveAttribute("aria-expanded", "true");
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent(GLOSSARY.temasClave.definition);
    expect(term).toHaveAttribute("aria-controls", tooltip.id);

    screen.getByRole("button", { name: "Fuera" }).focus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(term).toHaveAttribute("aria-expanded", "false");
    expect(term).toHaveFocus();
  });

  it("closes on a second click or an outside click and accepts custom text", () => {
    render(
      <div>
        <HelpTerm term="repaso">repasos</HelpTerm>
        <p>Otro texto</p>
      </div>,
    );

    const term = screen.getByRole("button", { name: "repasos" });
    fireEvent.click(term);
    fireEvent.click(term);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.click(term);
    fireEvent.mouseDown(screen.getByText("Otro texto"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
