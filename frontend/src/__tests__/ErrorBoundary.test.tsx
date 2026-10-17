import { fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RouteErrorBoundary } from "../components/ErrorBoundary";

function Broken(): JSX.Element {
  throw new Error("render failure");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RouteErrorBoundary", () => {
  it("replaces a crashed page with a recoverable message and recovers on navigation", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <MemoryRouter
        initialEntries={["/broken"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Link to="/ok">Ir a otra página</Link>
        <RouteErrorBoundary>
          <Routes>
            <Route path="/broken" element={<Broken />} />
            <Route path="/ok" element={<p>Página sana</p>} />
          </Routes>
        </RouteErrorBoundary>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "Algo salió mal al mostrar esta página" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Ir a otra página" }));
    expect(screen.getByText("Página sana")).toBeInTheDocument();
  });
});
