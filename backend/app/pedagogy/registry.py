"""Versioned subject profiles and deterministic hint resolution."""

from __future__ import annotations

from app.pedagogy.contracts import LearningObjective, PedagogyProfile, PedagogySnapshot


_PROFILE_REGISTRY: dict[str, PedagogyProfile] = {
    "history": PedagogyProfile(
        id="history",
        version=1,
        rules=[
            "Establece el contexto antes de pedir interpretaciones.",
            "Usa secuencias temporales solo cuando el orden sea inequívoco.",
            "Trabaja causalidad, interpretación y contraste de evidencia disponible.",
            "Distingue ejemplos generados de fuentes históricas.",
        ],
    ),
    "mathematics": PedagogyProfile(
        id="mathematics",
        version=1,
        rules=[
            "Introduce el concepto y sus representaciones antes de practicar.",
            "Explica los pasos de un ejemplo resuelto.",
            "Avanza desde práctica guiada hacia transferencia con menos ayuda.",
            "Usa respuestas numéricas solo cuando el objetivo admita corrección exacta.",
        ],
    ),
    "general": PedagogyProfile(
        id="general",
        version=1,
        rules=[
            "Explica las ideas centrales con claridad.",
            "Presenta un ejemplo pertinente y promueve recuperación activa.",
            "Concluye con una aplicación alineada con los objetivos.",
        ],
    ),
}


def resolve_profile(subject_hint: str, topic_subject: str | None) -> PedagogyProfile:
    """Resolve an explicit subject first, otherwise use a known candidate.

    Unknown, mixed, or absent automatic classifications conservatively use the
    general profile. Returning a deep copy prevents callers mutating the shared
    registry definition.
    """
    if subject_hint != "auto":
        profile = _PROFILE_REGISTRY.get(subject_hint, _PROFILE_REGISTRY["general"])
    else:
        candidate = topic_subject.strip().casefold() if topic_subject else ""
        profile = _PROFILE_REGISTRY.get(candidate, _PROFILE_REGISTRY["general"])
    return profile.model_copy(deep=True)


def snapshot_profile(
    profile: PedagogyProfile, objectives: list[LearningObjective]
) -> PedagogySnapshot:
    """Freeze the selected profile rules and objectives for one session."""
    return PedagogySnapshot(
        profile_id=profile.id,
        profile_version=profile.version,
        rules=list(profile.rules),
        objectives=[objective.model_copy(deep=True) for objective in objectives],
    )
