import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "../components/AppShell";

function renderShell(initialPath = "/", onBackgroundAction = vi.fn()) {
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

  it("keeps all six destinations in the desktop sidebar and five primary mobile links", () => {
    renderShell();

    const desktopNavigation = screen.getByRole("navigation", { name: "Navegación principal" });
    expect(within(desktopNavigation).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Inicio",
      "Documentos",
      "Metas",
      "Plan",
      "Dashboard",
      "Configuración",
    ]);
    expect(within(desktopNavigation).getByRole("link", { name: "Inicio" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    const bottomNavigation = screen.getByRole("navigation", { name: "Navegación inferior" });
    expect(within(bottomNavigation).getAllByRole("link").map((link) => link.textContent?.trim())).toEqual([
      "Inicio",
      "Documentos",
      "Metas",
      "Plan",
      "Dashboard",
    ]);
    expect(within(bottomNavigation).queryByRole("link", { name: "Configuración" })).not.toBeInTheDocument();
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

  it("marks direct plan routes active in both desktop and bottom navigation", () => {
    renderShell("/plan/27");

    expect(
      within(screen.getByRole("navigation", { name: "Navegación principal" })).getByRole("link", {
        name: "Plan",
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

  it("uses the provided flowing SVG mark as decorative imagery in both brand links", () => {
    renderShell();

    const brandLinks = screen.getAllByRole("link", { name: "StudyAI" });
    expect(brandLinks).toHaveLength(2);

    for (const link of brandLinks) {
      const mark = link.querySelector("img");
      expect(mark).not.toBeNull();
      expect(mark?.getAttribute("src")).toBe("/favicon.svg");
      expect(mark?.getAttribute("alt")).toBe("");
      expect(mark?.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("treats an unmatched nested plan path as not found without an active navigation item", async () => {
    renderShell("/plan/27/extra");

    await waitFor(() => expect(document.title).toBe("Página no encontrada | StudyAI"));
    const desktopNavigation = screen.getByRole("navigation", { name: "Navegación principal" });
    expect(within(desktopNavigation).getByRole("link", { name: "Plan" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(within(desktopNavigation).getByRole("link", { name: "Inicio" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("opens a non-modal overflow disclosure and restores focus on Escape", () => {
    const backgroundAction = vi.fn();
    renderShell("/", backgroundAction);
    const moreButton = screen.getByRole("button", { name: "Más" });

    expect(moreButton).toHaveAttribute("aria-expanded", "false");
    expect(moreButton).toHaveAttribute("aria-controls", "mobile-overflow-navigation");
    fireEvent.click(moreButton);

    const overflowNavigation = screen.getByRole("navigation", { name: "Más destinos" });
    expect(moreButton).toHaveAttribute("aria-expanded", "true");
    expect(overflowNavigation).toBeInTheDocument();
    expect(within(overflowNavigation).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
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

  it("marks Configuración on the Más trigger and restores focus when its current route is chosen", () => {
    renderShell("/settings");
    const moreButton = screen.getByRole("button", { name: /Más/ });
    expect(moreButton).toHaveAttribute("aria-current", "page");
    fireEvent.click(moreButton);

    const currentLink = within(
      screen.getByRole("navigation", { name: "Más destinos" }),
    ).getByRole("link", { name: "Configuración" });
    expect(currentLink).toHaveAttribute("aria-current", "page");
    currentLink.focus();
    fireEvent.click(currentLink);

    expect(screen.queryByRole("navigation", { name: "Más destinos" })).not.toBeInTheDocument();
    expect(moreButton).toHaveFocus();
  });
});
