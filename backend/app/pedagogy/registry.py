"""Versioned academic reasoning profiles and deterministic hint resolution."""

from __future__ import annotations

from app.pedagogy.contracts import (
    LearningObjective,
    MinuteRange,
    PedagogyProfile,
    PedagogySnapshot,
    QuestionFormat,
)


_ALL_FORMATS: list[QuestionFormat] = [
    "multiple_choice",
    "true_false",
    "short_answer",
    "essay",
    "step_by_step",
    "matching",
]


def _profile(
    profile_id: str,
    name: str,
    discipline_examples: list[str],
    rules: list[str],
    bloom_levels: list[str],
    allowed_question_types: list[QuestionFormat],
    primary_evaluation_criterion: str,
    estimated_minutes: tuple[int, int],
    feedback_modes: list[str],
    procedure_rubric_weights: dict[str, float] | None = None,
    version: int = 1,
) -> PedagogyProfile:
    return PedagogyProfile(
        id=profile_id,
        version=version,
        name=name,
        discipline_examples=discipline_examples,
        rules=rules,
        bloom_levels=bloom_levels,
        allowed_question_types=allowed_question_types,
        primary_evaluation_criterion=primary_evaluation_criterion,
        estimated_minutes_per_question={"min": estimated_minutes[0], "max": estimated_minutes[1]},
        question_time_overrides={},
        feedback_modes=feedback_modes,
        procedure_rubric_weights=procedure_rubric_weights,
    )


_PROFILE_REGISTRY: dict[str, PedagogyProfile] = {
    "logical_deductive": _profile(
        "logical_deductive",
        "Perfil Lógico-Deductivo",
        ["Matemáticas", "Física", "Programación"],
        [
            "Resuelve problemas con exactitud y explica el razonamiento paso a paso.",
            "Considera tanto el resultado como el procedimiento.",
        ],
        ["remember", "understand", "apply", "analyze"],
        ["multiple_choice", "true_false", "short_answer", "step_by_step", "matching"],
        "procedure",
        (3, 5),
        ["formula"],
        {"result": 0.4, "procedure": 0.6},
    ),
    "critical_argumentative": _profile(
        "critical_argumentative",
        "Perfil Crítico-Argumentativo",
        ["Historia", "Filosofía", "Ciencias Políticas"],
        [
            "Analiza causas, consecuencias, contexto y debate entre ideas.",
            "Conecta eventos y evalúa fuentes en lugar de limitarse a memorizar fechas.",
        ],
        ["remember", "understand", "analyze", "evaluate", "create"],
        ["multiple_choice", "true_false", "short_answer", "essay", "matching"],
        "argumentation",
        (8, 12),
        ["chapter_reference", "counterargument"],
    ),
    "linguistic_interpretive": _profile(
        "linguistic_interpretive",
        "Perfil Lingüístico-Interpretativo",
        ["Letras", "Literatura", "Idiomas"],
        [
            "Trabaja comprensión lectora, retórica, subtexto y gramática.",
            "Promueve inferencias, traducción y análisis de textos.",
        ],
        ["understand", "apply", "analyze", "evaluate", "create"],
        ["multiple_choice", "true_false", "short_answer", "essay", "matching"],
        "argumentation",
        (10, 15),
        ["chapter_reference", "counterargument"],
    ),
    "systemic_empirical": _profile(
        "systemic_empirical",
        "Perfil Sistémico-Empírico",
        ["Biología", "Química", "Medicina"],
        [
            "Combina memorización estructural con método científico.",
            "Formula hipótesis y conecta observaciones con experimentación.",
        ],
        ["remember", "understand", "apply", "analyze", "evaluate"],
        ["multiple_choice", "true_false", "short_answer", "step_by_step", "matching"],
        "accuracy",
        (3, 8),
        ["formula", "chapter_reference"],
    ),
    "applied_practical": _profile(
        "applied_practical",
        "Perfil Aplicado-Práctico",
        ["Economía", "Ingeniería aplicada", "Negocios"],
        [
            "Aplica herramientas para resolver problemas del mundo real.",
            "Interpreta casos y datos antes de justificar una decisión.",
        ],
        ["understand", "apply", "analyze", "evaluate", "create"],
        _ALL_FORMATS,
        "procedure",
        (5, 10),
        ["formula", "chapter_reference"],
    ),
    # The former general@1 definition had no S4 configuration. Keep its
    # existing rules but version the newly configured fallback as general@2.
    "general": _profile(
        "general",
        "General",
        [],
        [
            "Explica las ideas centrales con claridad.",
            "Presenta un ejemplo pertinente y promueve recuperación activa.",
            "Concluye con una aplicación alineada con los objetivos.",
        ],
        ["remember", "understand", "apply", "analyze", "evaluate", "create"],
        _ALL_FORMATS,
        "accuracy",
        (5, 10),
        ["chapter_reference"],
        version=2,
    ),
}

_ALIASES = {
    "history": "critical_argumentative",
    "mathematics": "logical_deductive",
}


def _canonical_profile_id(candidate: str | None) -> str | None:
    if candidate is None:
        return None
    normalized = candidate.strip().casefold()
    normalized = _ALIASES.get(normalized, normalized)
    return normalized if normalized in _PROFILE_REGISTRY else None


def resolve_profile(hint: str | None, topic_profile: str | None) -> PedagogyProfile:
    """Resolve an explicit hint or topic candidate and return an isolated copy.

    ``history`` and ``mathematics`` remain accepted request aliases. Automatic
    and absent hints use the topic candidate; mixed or unknown candidates use
    the general fallback. Unsupported explicit hints retain the safe fallback.
    """
    normalized_hint = hint.strip().casefold() if hint is not None else None
    if normalized_hint is not None and normalized_hint != "auto":
        profile_id = _canonical_profile_id(normalized_hint)
    else:
        profile_id = _canonical_profile_id(topic_profile)
    profile = _PROFILE_REGISTRY.get(profile_id or "general", _PROFILE_REGISTRY["general"])
    return profile.model_copy(deep=True)


def resolve_question_time(
    profile: PedagogyProfile, question_format: QuestionFormat
) -> MinuteRange:
    """Return a validated per-format override or an independent base range."""
    if question_format not in profile.allowed_question_types:
        raise ValueError("Question format is not allowed by this profile.")
    time_range = profile.question_time_overrides.get(
        question_format, profile.estimated_minutes_per_question
    )
    return time_range.model_copy(deep=True)


def snapshot_profile(
    profile: PedagogyProfile, objectives: list[LearningObjective]
) -> PedagogySnapshot:
    """Freeze the complete profile configuration and objectives for a session."""
    return PedagogySnapshot(
        snapshot_schema_version=2,
        profile_id=profile.id,
        profile_version=profile.version,
        name=profile.name,
        discipline_examples=list(profile.discipline_examples),
        rules=list(profile.rules),
        objectives=[objective.model_copy(deep=True) for objective in objectives],
        bloom_levels=list(profile.bloom_levels),
        allowed_question_types=list(profile.allowed_question_types),
        primary_evaluation_criterion=profile.primary_evaluation_criterion,
        estimated_minutes_per_question=profile.estimated_minutes_per_question.model_copy(
            deep=True
        ),
        question_time_overrides={
            format_name: time_range.model_copy(deep=True)
            for format_name, time_range in profile.question_time_overrides.items()
        },
        feedback_modes=list(profile.feedback_modes),
        procedure_rubric_weights=(
            profile.procedure_rubric_weights.model_copy(deep=True)
            if profile.procedure_rubric_weights is not None
            else None
        ),
    )
