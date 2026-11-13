import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/endpoints";
import type { AssistantMessageDTO } from "../api/types";
import { AssistantPanel } from "../components/session/AssistantPanel";

function message(id: number, role: "USER" | "ASSISTANT", content: string): AssistantMessageDTO {
  return { id, role, mode: "EXAM", content, created_at: "2026-11-13T10:00:00" };
}

function renderPanel(mode: "STUDY" | "EXAM", remaining: number | null = null) {
  vi.spyOn(api, "getAssistantHistory").mockResolvedValue({ messages: [], remaining });
  const ask = vi.spyOn(api, "askAssistant").mockResolvedValue({
    question: message(1, "USER", "¿Cuál es?"),
    answer: message(2, "ASSISTANT", "**Pista:** piensa en $x^2$."),
    remaining: remaining === null ? null : remaining - 1,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AssistantPanel sessionId={7} mode={mode} questionId="42" />
    </QueryClientProvider>,
  );
  return ask;
}

afterEach(() => vi.restoreAllMocks());

describe("AssistantPanel", () => {
  it("in the test warns it only gives hints and sends the question on screen", async () => {
    const ask = renderPanel("EXAM");

    fireEvent.click(screen.getByRole("button", { name: "Pregúntale al asistente" }));
    expect(screen.getByText("En el examen solo te doy pistas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();

    const input = screen.getByLabelText("Tu pregunta");
    fireEvent.change(input, { target: { value: "¿Cuál es?" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(ask).toHaveBeenCalledWith(7, { message: "¿Cuál es?", mode: "EXAM", question_id: "42" }),
    );
    expect(await screen.findByText("Pista:")).toBeInTheDocument();
    expect(document.querySelector(".katex")).not.toBeNull();
  });

  it("while reading sends no question id and shows the free messages left", async () => {
    const ask = renderPanel("STUDY", 0);

    fireEvent.click(screen.getByRole("button", { name: "Pregúntale al asistente" }));
    expect(await screen.findByText("Ya no te quedan mensajes gratis hoy.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tu pregunta"), { target: { value: "Hola" } });
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
    expect(ask).not.toHaveBeenCalled();
  });

  it("closes with Escape and returns focus to the button", () => {
    renderPanel("STUDY");

    fireEvent.click(screen.getByRole("button", { name: "Pregúntale al asistente" }));
    fireEvent.keyDown(screen.getByLabelText("Tu pregunta"), { key: "Escape" });

    expect(screen.queryByText("Asistente de estudio")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pregúntale al asistente" })).toHaveFocus();
  });
});
