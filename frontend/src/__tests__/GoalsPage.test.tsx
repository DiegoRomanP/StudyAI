import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const goalHooks = vi.hoisted(() => ({
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  deleteGoal: vi.fn(),
  goals: [] as unknown[],
}));

vi.mock("../hooks/queries", () => ({
  useCreateGoal: () => ({ mutateAsync: goalHooks.createGoal, isPending: false }),
  useDeleteGoal: () => ({ mutateAsync: goalHooks.deleteGoal, isPending: false }),
  useGoals: () => ({ data: goalHooks.goals, isLoading: false }),
  useUpdateGoal: () => ({ mutateAsync: goalHooks.updateGoal, isPending: false }),
}));

import { GoalsPage } from "../pages/GoalsPage";

describe("GoalsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    goalHooks.goals = [];
    goalHooks.createGoal.mockResolvedValue({ id: 4 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fills a template without persisting it until explicit confirmation", async () => {
    render(<GoalsPage />);

    const examTemplate = screen.getByRole("button", { name: /Sacar buena nota/i });
    expect(examTemplate).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /Solo quiero aprender/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    fireEvent.click(examTemplate);

    expect(examTemplate).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: "Título" })).toHaveValue("Aprobar el examen");
    expect(goalHooks.createGoal).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox", { name: "Título" }), {
      target: { value: "  Preparar el parcial  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar meta" }));

    await waitFor(() => expect(goalHooks.createGoal).toHaveBeenCalledOnce());
    expect(goalHooks.createGoal).toHaveBeenCalledWith({
      goal_type: "EXAM",
      title: "Preparar el parcial",
      description: "",
    });
    expect(await screen.findByText(/meta guardada/i)).toBeInTheDocument();
    expect(examTemplate).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps a manually edited title unassociated with a template while retaining the default type", async () => {
    render(<GoalsPage />);

    const learningTemplate = screen.getByRole("button", { name: /Solo quiero aprender/i });
    fireEvent.change(screen.getByRole("textbox", { name: "Título" }), {
      target: { value: "Estudiar historia local" },
    });

    expect(learningTemplate).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Guardar meta" }));

    await waitFor(() => expect(goalHooks.createGoal).toHaveBeenCalledOnce());
    expect(goalHooks.createGoal).toHaveBeenCalledWith({
      goal_type: "LEARNING",
      title: "Estudiar historia local",
      description: "",
    });
  });

  it("does not create a goal when the title contains only whitespace", () => {
    render(<GoalsPage />);
    const title = screen.getByRole("textbox", { name: "Título" });
    fireEvent.change(title, { target: { value: "   " } });

    expect(screen.getByRole("button", { name: "Guardar meta" })).toBeDisabled();
    expect(goalHooks.createGoal).not.toHaveBeenCalled();
  });

  it("shows a server creation error instead of announcing an unconfirmed save", async () => {
    goalHooks.createGoal.mockRejectedValue(
      Object.assign(new Error("Request failed"), {
        isAxiosError: true,
        response: { status: 400, data: { detail: "La meta no se pudo guardar." } },
      }),
    );
    render(<GoalsPage />);
    fireEvent.click(screen.getByRole("button", { name: /Sacar buena nota/i }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar meta" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La meta no se pudo guardar.");
    expect(screen.queryByRole("status", { name: /meta guardada/i })).not.toBeInTheDocument();
  });

  it("keeps editing and deletion available for saved goals", async () => {
    goalHooks.goals = [
      {
        id: 4,
        goal_type: "LEARNING",
        title: "Aprender botánica",
        description: "Plantas locales",
        created_at: "2026-09-30T00:00:00Z",
      },
    ];
    goalHooks.updateGoal.mockResolvedValue({ id: 4 });
    goalHooks.deleteGoal.mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<GoalsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    const titleFields = screen.getAllByRole("textbox", { name: "Título" });
    fireEvent.change(titleFields[1], { target: { value: "Botánica urbana" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(goalHooks.updateGoal).toHaveBeenCalledWith({
        id: 4,
        payload: {
          goal_type: "LEARNING",
          title: "Botánica urbana",
          description: "Plantas locales",
        },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(goalHooks.deleteGoal).toHaveBeenCalledWith(4));
  });
});
