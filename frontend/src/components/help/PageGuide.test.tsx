import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PAGE_GUIDES, type GuideId } from "../../lib/pageGuides";
import { PageGuide } from "./PageGuide";

describe("PageGuide", () => {
  it("shows its steps in a popover opened from the help button", () => {
    const guide = PAGE_GUIDES.recursos;
    render(<PageGuide id="recursos" />);

    const button = screen.getByRole("button", { name: `Ayuda: ${guide.title}` });
    expect(button).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    for (const step of guide.steps) expect(screen.getByText(step)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps every guide to 3 short steps", () => {
    for (const guide of Object.values(PAGE_GUIDES)) {
      expect(guide.steps.length).toBeGreaterThan(0);
      expect(guide.steps.length).toBeLessThanOrEqual(3);
      for (const step of guide.steps) expect(step.split(/\s+/).length).toBeLessThanOrEqual(10);
    }
  });

  it("does not persist anything", () => {
    window.localStorage.clear();
    render(<PageGuide id={"plan-detalle" satisfies GuideId} />);
    fireEvent.click(screen.getByRole("button", { name: /Ayuda/ }));
    expect(window.localStorage.length).toBe(0);
  });
});
