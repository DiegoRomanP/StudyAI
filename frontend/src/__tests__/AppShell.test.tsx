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

  it("includes Inicio and marks only the current route, including plan details", () => {
    const { unmount } = renderShell("/");

    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Plan" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(
      screen.getAllByRole("link", { name: "StudyAI" }).map((link) => link.getAttribute("href")),
    ).toEqual(["/", "/"]);

    unmount();
    renderShell("/plan/27");

    expect(screen.getByRole("link", { name: "Plan" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Inicio" })).not.toHaveAttribute(
      "aria-current",
    );
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
    expect(screen.getByRole("link", { name: "Plan" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current");
  });

  it("opens and closes a non-modal mobile navigation with Escape and restores focus", () => {
    const backgroundAction = vi.fn();
    renderShell("/", backgroundAction);
    const menuButton = screen.getByRole("button", { name: "Menú" });

    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(menuButton);

    const mobileNavigation = screen.getByRole("navigation", { name: "Navegación móvil" });
    expect(menuButton).toHaveAttribute("aria-expanded", "true");
    expect(menuButton).toHaveAttribute("aria-controls", "mobile-navigation");
    expect(mobileNavigation).toBeInTheDocument();
    expect(mobileNavigation).not.toHaveAttribute("aria-modal", "true");
    expect(
      within(mobileNavigation).getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual(["/", "/documents", "/goals", "/plan", "/dashboard", "/settings"]);
    expect(screen.getByRole("main")).not.toHaveAttribute("inert");
    expect(screen.getByRole("main")).not.toHaveAttribute("aria-hidden", "true");

    fireEvent.click(screen.getByRole("button", { name: "Acción fuera del menú" }));
    expect(backgroundAction).toHaveBeenCalledOnce();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("navigation", { name: "Navegación móvil" })).not.toBeInTheDocument();
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(menuButton).toHaveFocus();

    fireEvent.click(menuButton);
    expect(menuButton).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(menuButton);
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
  });

  it("returns focus to the menu button when the current route is selected", () => {
    renderShell("/documents");
    const menuButton = screen.getByRole("button", { name: "Menú" });
    fireEvent.click(menuButton);

    const currentLink = within(
      screen.getByRole("navigation", { name: "Navegación móvil" }),
    ).getByRole("link", { name: "Documentos" });
    currentLink.focus();
    fireEvent.click(currentLink);

    expect(screen.queryByRole("navigation", { name: "Navegación móvil" })).not.toBeInTheDocument();
    expect(menuButton).toHaveFocus();
  });
});
