import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PAGE_GUIDES } from "../../lib/pageGuides";
import { PageGuide } from "./PageGuide";

const guide = PAGE_GUIDES.recursos;

function renderGuide() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PageGuide id="recursos" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PageGuide", () => {
  it("is open on the first visit with its steps and next link", () => {
    renderGuide();

    const section = screen.getByRole("region", { name: guide.title });
    expect(section).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(guide.steps.length);
    expect(screen.getByRole("link", { name: `Siguiente: ${guide.next!.label}` })).toHaveAttribute(
      "href",
      guide.next!.to,
    );
  });

  it("closes, stays closed after remounting, and reopens", () => {
    const { unmount } = renderGuide();

    fireEvent.click(screen.getByRole("button", { name: "Entendido" }));
    const reopen = screen.getByRole("button", { name: "¿Cómo funciona esta página?" });
    expect(reopen).toHaveFocus();
    expect(screen.queryByRole("region", { name: guide.title })).not.toBeInTheDocument();

    unmount();
    renderGuide();
    expect(screen.queryByRole("region", { name: guide.title })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "¿Cómo funciona esta página?" }));
    expect(screen.getByRole("heading", { name: guide.title })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Ocultar guía" }));
    expect(screen.getByRole("button", { name: "¿Cómo funciona esta página?" })).toBeInTheDocument();
  });

  it("shows the guide open and keeps working when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderGuide();

    expect(screen.getByRole("region", { name: guide.title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ocultar guía" }));
    expect(screen.getByRole("button", { name: "¿Cómo funciona esta página?" })).toBeInTheDocument();
  });
});
