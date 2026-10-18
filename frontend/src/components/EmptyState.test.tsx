import { render, screen } from "@testing-library/react";
import { FolderOpen } from "lucide-react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { EmptyState } from "./EmptyState";
import { ButtonLink } from "./ui";

describe("EmptyState", () => {
  it("explains the empty state and renders its call to action", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <EmptyState
          icon={FolderOpen}
          title="Aún no tienes documentos"
          description="Sube tus apuntes."
          action={<ButtonLink to="/documents">Subir</ButtonLink>}
        />
      </MemoryRouter>,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Aún no tienes documentos");
    expect(status).toHaveTextContent("Sube tus apuntes.");
    expect(screen.getByRole("link", { name: "Subir" })).toHaveAttribute("href", "/documents");
  });
});
