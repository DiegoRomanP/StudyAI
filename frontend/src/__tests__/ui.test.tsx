import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AsyncState } from "../components/AsyncState";
import { Target } from "lucide-react";

import {
  ActivityIndicator,
  Button,
  ButtonLink,
  Input,
  OptionCard,
  ProgressRing,
  SegmentedControl,
  Select,
  Skeleton,
  StepChain,
  Textarea,
} from "../components/ui";
import { SessionResult } from "../components/session/SessionResult";
import { makeSessionSummary } from "../test/fixtures";

describe("UI primitives", () => {
  it("associates visible labels and errors with native form controls", () => {
    render(
      <>
        <Input id="email" name="email" label="Correo" error="Escribe un correo válido." disabled />
        <Select id="study-type" name="studyType" label="Tipo de estudio" disabled>
          <option value="exam">Examen</option>
        </Select>
      </>,
    );

    const email = screen.getByRole("textbox", { name: "Correo" });
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAttribute("aria-describedby", "email-error");
    expect(email).toBeDisabled();
    expect(screen.getByText("Escribe un correo válido.")).toHaveAttribute("id", "email-error");
    const studyType = screen.getByRole("combobox", { name: "Tipo de estudio" });
    expect(studyType).toHaveAttribute("name", "studyType");
    expect(studyType).toBeDisabled();
  });

  it("keeps disabled buttons inoperable and exposes a button-like destination as a link", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <Button disabled onClick={onClick}>
        Guardar cambios
      </Button>,
    );

    const disabledButton = screen.getByRole("button", { name: "Guardar cambios" });
    expect(disabledButton).toBeDisabled();
    fireEvent.click(disabledButton);
    expect(onClick).not.toHaveBeenCalled();

    rerender(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ButtonLink to="/documents">Ver documentos</ButtonLink>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Ver documentos" })).toHaveAttribute("href", "/documents");
    expect(screen.queryByRole("button", { name: "Ver documentos" })).not.toBeInTheDocument();
  });

  it("animates button press feedback while respecting reduced-motion preferences", () => {
    render(<Button>Continuar</Button>);

    const button = screen.getByRole("button", { name: "Continuar" });
    expect(button).toHaveClass("active:scale-[0.985]");
    expect(button).toHaveClass(
      "transition-[color,background-color,border-color,transform,filter]",
      "motion-reduce:transition-none",
    );
  });

  it("navigates from the completed-session view through named links only", () => {
    const renderDoneView = () =>
      render(
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={["/session/42"]}
        >
          <Routes>
            <Route
              path="/session/42"
              element={
                <SessionResult
                  planId={17}
                  nextSession={makeSessionSummary({ id: 43, order_index: 1, topic_name: "Siguiente" })}
                  nextIsAvailable
                  result={{
                    score: 50,
                    correct: 1,
                    total: 2,
                    detail: { "9": { type: "flashcard", quality: 3 } },
                  }}
                />
              }
            />
            <Route path="/session/43" element={<p>Siguiente destino</p>} />
            <Route path="/plan/:planId" element={<p>Plan destino</p>} />
          </Routes>
        </MemoryRouter>,
      );

    const firstRender = renderDoneView();
    const nextLink = screen.getByRole("link", { name: "Siguiente sesión" });
    expect(nextLink).toHaveAttribute("href", "/session/43");
    expect(nextLink.querySelector("button")).toBeNull();
    fireEvent.click(nextLink);
    expect(screen.getByText("Siguiente destino")).toBeInTheDocument();
    firstRender.unmount();

    renderDoneView();
    const planLink = screen.getByRole("link", { name: "Ver plan" });
    expect(planLink).toHaveAttribute("href", "/plan/17");
    expect(planLink.querySelector("button")).toBeNull();
    fireEvent.click(planLink);
    expect(screen.getByText("Plan destino")).toBeInTheDocument();
  });

  it("announces activity with a readable status name", () => {
    render(<ActivityIndicator label="Indexando documento" />);

    expect(screen.getByRole("status", { name: "Indexando documento" })).toBeInTheDocument();
  });
});

describe("AsyncState", () => {
  it("shows a reserved loading skeleton before data is available", () => {
    const { container } = render(
      <AsyncState<string[]>
        data={undefined}
        isLoading
        isError={false}
        loading={<Skeleton height={48} width="100%" />}
        empty={<p>No hay recursos todavía.</p>}
        onRetry={() => undefined}
      >
        {(resources) => <p>{resources.join(", ")}</p>}
      </AsyncState>,
    );

    expect(container.querySelector('[aria-hidden="true"]')).toHaveStyle({ height: "48px", width: "100%" });
    expect(screen.queryByText("No hay recursos todavía.")).not.toBeInTheDocument();
  });

  it("falls back to safe dimensions when skeleton size props are invalid", () => {
    const { container } = render(<Skeleton height={Number.NaN} width="120%" />);

    expect(container.querySelector('[aria-hidden="true"]')).toHaveStyle({ height: "16px", width: "100%" });
  });

  it("offers an explicit retry for an initial load error instead of showing empty state", () => {
    const onRetry = vi.fn();
    render(
      <AsyncState<string[]>
        data={undefined}
        isLoading={false}
        isError
        loading={<Skeleton height={48} />}
        empty={<p>No hay documentos.</p>}
        onRetry={onRetry}
      >
        {(documents) => <p>{documents.join(", ")}</p>}
      </AsyncState>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar los datos.");
    expect(screen.queryByText("No hay documentos.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar carga" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("keeps loaded content visible while retrying a failed refresh", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <AsyncState
        data={["Apuntes de biología"]}
        isLoading={false}
        isError
        isFetching={false}
        isEmpty={(documents) => documents.length === 0}
        loading={<Skeleton height={48} />}
        empty={<p>No hay documentos.</p>}
        onRetry={onRetry}
      >
        {(documents) => <ul>{documents.map((document) => <li key={document}>{document}</li>)}</ul>}
      </AsyncState>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron actualizar los datos.");
    expect(screen.getByText("Apuntes de biología")).toBeInTheDocument();
    expect(screen.queryByText("No hay documentos.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar actualización" }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(
      <AsyncState
        data={["Apuntes de biología"]}
        isLoading={false}
        isError={false}
        isFetching
        isEmpty={(documents) => documents.length === 0}
        loading={<Skeleton height={48} />}
        empty={<p>No hay documentos.</p>}
        onRetry={onRetry}
      >
        {(documents) => <ul>{documents.map((document) => <li key={document}>{document}</li>)}</ul>}
      </AsyncState>,
    );

    expect(screen.getByText("Apuntes de biología")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Actualizando datos…" })).toBeInTheDocument();
  });

  it("renders an explicit empty state for successfully loaded empty data", () => {
    render(
      <AsyncState
        data={[]}
        isLoading={false}
        isError={false}
        isEmpty={(documents) => documents.length === 0}
        loading={<Skeleton height={48} />}
        empty={<p>No hay documentos. Sube el primero.</p>}
        onRetry={() => undefined}
      >
        {(documents) => <p>{documents.join(", ")}</p>}
      </AsyncState>,
    );

    expect(screen.getByText("No hay documentos. Sube el primero.")).toBeInTheDocument();
  });

  it("gives the progress ring a text equivalent and clamps invalid values", () => {
    const { rerender } = render(<ProgressRing value={67.6} label="Sesiones completadas" />);
    expect(screen.getByRole("img", { name: "Sesiones completadas: 68%" })).toBeInTheDocument();

    rerender(<ProgressRing value={Number.NaN} label="Sesiones completadas" />);
    expect(screen.getByRole("img", { name: "Sesiones completadas: 0%" })).toBeInTheDocument();
  });

  it("exposes exactly one pressed option in a segmented control", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Periodo"
        value="7d"
        onChange={onChange}
        options={[
          { value: "7d", label: "7 días" },
          { value: "30d", label: "30 días" },
        ]}
      />,
    );

    const group = screen.getByRole("group", { name: "Periodo" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "7 días" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "30 días" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "30 días" }));
    expect(onChange).toHaveBeenCalledWith("30d");
  });

  it("renders option cards as toggle buttons with their description", () => {
    const onSelect = vi.fn();
    render(
      <OptionCard
        title="Universidad"
        description="Cursos y exámenes"
        icon={Target}
        selected
        onSelect={onSelect}
      />,
    );

    const option = screen.getByRole("button", { name: /Universidad/ });
    expect(option).toHaveAttribute("aria-pressed", "true");
    expect(option).toHaveTextContent("Cursos y exámenes");
    fireEvent.click(option);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("lists chain steps in order and labels the textarea", () => {
    render(
      <>
        <StepChain
          label="Pasos de la sesión"
          steps={[{ label: "Estudio", detail: "25 min" }, { label: "Receso" }, { label: "Quiz" }]}
        />
        <Textarea id="notes" label="Descripción" hint="Opcional" />
      </>,
    );

    const steps = screen.getByRole("list", { name: "Pasos de la sesión" });
    expect(steps.querySelectorAll("li")).toHaveLength(3);
    expect(steps).toHaveTextContent(/Estudio.*25 min.*Receso.*Quiz/);
    expect(screen.getByRole("textbox", { name: "Descripción" })).toHaveAttribute(
      "aria-describedby",
      "notes-hint",
    );
  });
});
