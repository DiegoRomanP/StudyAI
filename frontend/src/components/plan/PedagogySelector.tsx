import type { ChangeEvent } from "react";

import type { AcademicProfileHint } from "../../api/types";
import { Select } from "../ui";

export const ACADEMIC_PROFILE_OPTIONS: { value: AcademicProfileHint; label: string }[] = [
  { value: "auto", label: "Automático por tema" },
  {
    value: "logical_deductive",
    label: "Lógico-Deductivo (Matemáticas, Física, Programación)",
  },
  {
    value: "critical_argumentative",
    label: "Crítico-Argumentativo (Historia, Filosofía, Ciencias Políticas)",
  },
  {
    value: "linguistic_interpretive",
    label: "Lingüístico-Interpretativo (Letras, Literatura, Idiomas)",
  },
  {
    value: "systemic_empirical",
    label: "Sistémico-Empírico (Biología, Química, Medicina)",
  },
  {
    value: "applied_practical",
    label: "Aplicado-Práctico (Economía, Ingeniería aplicada, Negocios)",
  },
];

interface PedagogySelectorProps {
  enabled: boolean;
  profileHint: AcademicProfileHint;
  onEnabledChange: (enabled: boolean) => void;
  onProfileChange: (profileHint: AcademicProfileHint) => void;
  idPrefix: string;
}

export function PedagogySelector({
  enabled,
  profileHint,
  onEnabledChange,
  onProfileChange,
  idPrefix,
}: PedagogySelectorProps) {
  const checkboxId = `${idPrefix}-enabled`;
  const hintId = `${idPrefix}-hint`;
  const selectId = `${idPrefix}-profile`;

  function handleProfileChange(event: ChangeEvent<HTMLSelectElement>) {
    onProfileChange(event.target.value as AcademicProfileHint);
  }

  return (
    <fieldset className="space-y-2 rounded-surface border border-line p-3">
      <legend className="px-1 text-sm font-medium text-text-primary">
        Enseñanza y evaluación
      </legend>
      <label htmlFor={checkboxId} className="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          id={checkboxId}
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
          aria-describedby={hintId}
          className="h-5 w-5 shrink-0 accent-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        />
        <span className="text-sm font-medium text-text-primary">
          Adaptar la enseñanza y evaluación al perfil académico
        </span>
      </label>
      <p id={hintId} className="text-sm text-text-muted">
        Automático por tema permite usar perfiles distintos según el material.
      </p>
      {enabled && (
        <Select
          id={selectId}
          label="Perfil académico"
          value={profileHint}
          onChange={handleProfileChange}
        >
          {ACADEMIC_PROFILE_OPTIONS.map((profile) => (
            <option key={profile.value} value={profile.value}>
              {profile.label}
            </option>
          ))}
        </Select>
      )}
    </fieldset>
  );
}
