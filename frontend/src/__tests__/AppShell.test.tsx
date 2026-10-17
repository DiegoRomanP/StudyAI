import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "../components/AppShell";

function renderShell(initialPath = "/inicio", onBackgroundAction = vi.fn()) {
  return render(
    <MemoryRouter
      initialEntries={[initialPath]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AppShell>
        <h1>Contenido de prueba</h1>
        <button type="button" onClick={onBackgroundAction}>
          Acción fuera del menú
        </button>
      </AppShell>
    </MemoryRouter>,
  );
}

describe("AppShell", () => {
  it("offers a skip link to a focusable main landmark", () => {
    renderShell();

    expect(screen.getByRole("link", { name: "Saltar al contenido" })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1");
  });

  it("keeps every destination in the desktop sidebar and at most five mobile primary controls", () => {
    renderShell();

    const desktopNavigation = screen.getByRole("navigation", { name: "Navegación principal" });
    expect(within(desktopNavigation).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Inicio",
      "Plan de estudio",
      "Práctica",
      "Temas (Pareto)",
      "Recursos",
      "Metas",
      "API Keys",
      "Estadísticas",
    ]);
    expect(
      within(desktopNavigation).getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual(["/inicio", "/plan", "/practica", "/temas", "/documents", "/goals", "/settings", "/dashboard"]);
    expect(within(desktopNavigation).getByRole("link", { name: "Inicio" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    const bottomNavigation = screen.getByRole("navigation", { name: "Navegación inferior" });
    expect(within(bottomNavigation).getAllByRole("link").map((link) => link.textContent?.trim())).toEqual([
      "Inicio",
      "Plan",
      "Práctica",
      "Estadísticas",
    ]);
    // Primary links plus the "Más" trigger never exceed five controls (S7).
    expect(
      within(bottomNavigation).getAllByRole("link").length +
        within(bottomNavigation).getAllByRole("button").length,
    ).toBeLessThanOrEqual(5);
    expect(within(bottomNavigation).queryByRole("link", { name: "API Keys" })).not.toBeInTheDocument();
    expect(within(bottomNavigation).getByRole("link", { name: "Inicio" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(bottomNavigation.parentElement).toHaveClass(
      "fixed",
      "inset-x-0",
      "bottom-0",
      "z-40",
      "md:hidden",
    );
    expect(bottomNavigation).toHaveClass("pb-[env(safe-area-inset-bottom)]");
    expect(screen.getByRole("main").firstElementChild).toHaveClass(
      "pb-[calc(6rem+env(safe-area-inset-bottom))]",
    );
  });

  it.each(["/plan/27", "/session/54"])("marks %s active as part of Plan in both navigations", (path) => {
    renderShell(path);

    expect(
      within(screen.getByRole("navigation", { name: "Navegación principal" })).getByRole("link", {
        name: "Plan de estudio",
      }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(screen.getByRole("navigation", { name: "Navegación inferior" })).getByRole("link", {
        name: "Plan",
      }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(screen.getByRole("navigation", { name: "Navegación inferior" })).getByRole("link", {
        name: "Inicio",
      }),
    ).not.toHaveAttribute("aria-current");
  });

  it("draws the supplied flowing mark as decorative imagery in both brand links to Inicio", () => {
    renderShell();

    const brandLinks = screen.getAllByRole("link", { name: "StudyAI" });
    expect(brandLinks).toHaveLength(2);

    for (const link of brandLinks) {
      expect(link).toHaveAttribute("href", "/inicio");
      const mark = link.querySelector("svg");
      expect(mark).not.toBeNull();
      expect(mark?.getAttribute("aria-hidden")).toBe("true");
      expect(mark?.querySelector("path")?.getAttribute("d")).toBe("M12 39 C21 16 31 15 37 28 S48 48 54 22");
    }
  });

  it("treats an unmatched nested plan path as not found without an active navigation item", async () => {
    renderShell("/plan/27/extra");

    await waitFor(() => expect(document.title).toBe("Página no encontrada | StudyAI"));
    const desktopNavigation = screen.getByRole("navigation", { name: "Navegación principal" });
    expect(within(desktopNavigation).getByRole("link", { name: "Plan de estudio" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(within(desktopNavigation).getByRole("link", { name: "Inicio" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("opens a non-modal overflow disclosure and restores focus on Escape", () => {
    const backgroundAction = vi.fn();
    renderShell("/inicio", backgroundAction);
    const moreButton = screen.getByRole("button", { name: "Más" });

    expect(moreButton).toHaveAttribute("aria-expanded", "false");
    expect(moreButton).toHaveAttribute("aria-controls", "mobile-overflow-navigation");
    fireEvent.click(moreButton);

    const overflowNavigation = screen.getByRole("navigation", { name: "Más destinos" });
    expect(moreButton).toHaveAttribute("aria-expanded", "true");
    expect(overflowNavigation).toBeInTheDocument();
    expect(within(overflowNavigation).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/temas",
      "/documents",
      "/goals",
      "/settings",
    ]);
    expect(screen.getByRole("main")).not.toHaveAttribute("inert");
    expect(screen.getByRole("main")).not.toHaveAttribute("aria-hidden", "true");

    fireEvent.click(screen.getByRole("button", { name: "Acción fuera del menú" }));
    expect(backgroundAction).toHaveBeenCalledOnce();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("navigation", { name: "Más destinos" })).not.toBeInTheDocument();
    expect(moreButton).toHaveAttribute("aria-expanded", "false");
    expect(moreButton).toHaveFocus();

    fireEvent.click(moreButton);
    expect(moreButton).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(moreButton);
    expect(moreButton).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps the Más destinations landmark separate from the bottom navigation landmark", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Más" }));

    const bottomNavigation = screen.getByRole("navigation", { name: "Navegación inferior" });
    const overflowNavigation = screen.getByRole("navigation", { name: "Más destinos" });
    expect(bottomNavigation).not.toContainElement(overflowNavigation);
  });

  it("marks API Keys on the Más trigger and restores focus when its current route is chosen", () => {
    renderShell("/settings");
    const moreButton = screen.getByRole("button", { name: /Más/ });
    expect(moreButton).toHaveAttribute("aria-current", "page");
    expect(moreButton).toHaveTextContent("API Keys actual");
    fireEvent.click(moreButton);

    const currentLink = within(
      screen.getByRole("navigation", { name: "Más destinos" }),
    ).getByRole("link", { name: "API Keys" });
    expect(currentLink).toHaveAttribute("aria-current", "page");
    currentLink.focus();
    fireEvent.click(currentLink);

    expect(screen.queryByRole("navigation", { name: "Más destinos" })).not.toBeInTheDocument();
    expect(moreButton).toHaveFocus();
  });
});
