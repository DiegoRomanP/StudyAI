"""Source-controlled academic profile configuration and snapshot contracts."""

from __future__ import annotations

from copy import deepcopy

import pytest
from pydantic import ValidationError

from app.pedagogy import contracts, registry


PROFILE_DATA = {
    "id": "logical_deductive",
    "version": 1,
    "name": "Perfil Lógico-Deductivo",
    "discipline_examples": ["Matemáticas", "Física", "Programación"],
    "rules": ["Resolver con exactitud y explicar el procedimiento."],
    "bloom_levels": ["remember", "understand", "apply", "analyze"],
    "allowed_question_types": [
        "multiple_choice",
        "true_false",
        "short_answer",
        "step_by_step",
        "matching",
    ],
    "primary_evaluation_criterion": "procedure",
    "estimated_minutes_per_question": {"min": 3, "max": 5},
    "question_time_overrides": {},
    "feedback_modes": ["formula"],
    "procedure_rubric_weights": {"result": 0.4, "procedure": 0.6},
}


PROFILE_EXPECTATIONS = {
    "logical_deductive": {
        "name": "Perfil Lógico-Deductivo",
        "examples": ["Matemáticas", "Física", "Programación"],
        "bloom": ["remember", "understand", "apply", "analyze"],
        "formats": ["multiple_choice", "true_false", "short_answer", "step_by_step", "matching"],
        "criterion": "procedure",
        "minutes": {"min": 3, "max": 5},
        "feedback": ["formula"],
        "weights": {"result": 0.4, "procedure": 0.6},
    },
    "critical_argumentative": {
        "name": "Perfil Crítico-Argumentativo",
        "examples": ["Historia", "Filosofía", "Ciencias Políticas"],
        "bloom": ["remember", "understand", "analyze", "evaluate", "create"],
        "formats": ["multiple_choice", "true_false", "short_answer", "essay", "matching"],
        "criterion": "argumentation",
        "minutes": {"min": 8, "max": 12},
        "feedback": ["chapter_reference", "counterargument"],
        "weights": None,
    },
    "linguistic_interpretive": {
        "name": "Perfil Lingüístico-Interpretativo",
        "examples": ["Letras", "Literatura", "Idiomas"],
        "bloom": ["understand", "apply", "analyze", "evaluate", "create"],
        "formats": ["multiple_choice", "true_false", "short_answer", "essay", "matching"],
        "criterion": "argumentation",
        "minutes": {"min": 10, "max": 15},
        "feedback": ["chapter_reference", "counterargument"],
        "weights": None,
    },
    "systemic_empirical": {
        "name": "Perfil Sistémico-Empírico",
        "examples": ["Biología", "Química", "Medicina"],
        "bloom": ["remember", "understand", "apply", "analyze", "evaluate"],
        "formats": ["multiple_choice", "true_false", "short_answer", "step_by_step", "matching"],
        "criterion": "accuracy",
        "minutes": {"min": 3, "max": 8},
        "feedback": ["formula", "chapter_reference"],
        "weights": None,
    },
    "applied_practical": {
        "name": "Perfil Aplicado-Práctico",
        "examples": ["Economía", "Ingeniería aplicada", "Negocios"],
        "bloom": ["understand", "apply", "analyze", "evaluate", "create"],
        "formats": [
            "multiple_choice",
            "true_false",
            "short_answer",
            "essay",
            "step_by_step",
            "matching",
        ],
        "criterion": "procedure",
        "minutes": {"min": 5, "max": 10},
        "feedback": ["formula", "chapter_reference"],
        "weights": None,
    },
}


def make_valid_profile_data() -> dict:
    return deepcopy(PROFILE_DATA)


def make_profile(data: dict):
    try:
        return contracts.PedagogyProfile.model_validate(data)
    except ValidationError as error:
        pytest.fail(f"A valid profile configuration was rejected: {error}")


def make_valid_snapshot_data() -> dict:
    profile = make_valid_profile_data()
    return {
        "snapshot_schema_version": 2,
        "profile_id": profile.pop("id"),
        "profile_version": profile.pop("version"),
        **profile,
        "objectives": [
            {
                "id": "objective-1",
                "skill": "causal reasoning",
                "description": "Explain a cause-and-effect relationship.",
                "bloom_target": "analyze",
            }
        ],
    }


def legacy_snapshot_data() -> dict:
    return {
        "profile_id": "general",
        "profile_version": 1,
        "rules": ["Explain the central idea."],
        "objectives": [
            {
                "id": "legacy-objective",
                "skill": "recall",
                "description": "Recall a key idea.",
            }
        ],
    }


@pytest.mark.parametrize("profile_id", list(PROFILE_EXPECTATIONS))
def test_five_source_controlled_profiles_have_the_planned_configuration(profile_id):
    expected = PROFILE_EXPECTATIONS[profile_id]
    profile = registry.resolve_profile(profile_id, None)

    assert profile.id == profile_id
    assert profile.version == 1
    assert getattr(profile, "name", None) == expected["name"]
    assert getattr(profile, "discipline_examples", None) == expected["examples"]
    assert getattr(profile, "bloom_levels", None) == expected["bloom"]
    assert getattr(profile, "allowed_question_types", None) == expected["formats"]
    assert getattr(profile, "primary_evaluation_criterion", None) == expected["criterion"]
    assert getattr(profile, "estimated_minutes_per_question", None).model_dump() == expected["minutes"]
    assert getattr(profile, "feedback_modes", None) == expected["feedback"]
    weights = getattr(profile, "procedure_rubric_weights", "missing")
    normalized_weights = (
        weights.model_dump() if weights not in (None, "missing") else weights
    )
    assert normalized_weights == expected["weights"]
    assert profile.rules


def test_general_fallback_has_a_new_definition_but_legacy_general_one_remains_readable():
    fallback = registry.resolve_profile(None, "mixed")

    assert fallback.id == "general"
    assert fallback.version == 2
    reader = getattr(contracts, "read_pedagogy_snapshot", None)
    assert callable(reader), "The public legacy snapshot reader is missing."
    legacy = reader(legacy_snapshot_data())
    assert isinstance(legacy, contracts.LegacyPedagogySnapshot)
    assert legacy.profile_id == "general"
    assert legacy.profile_version == 1


@pytest.mark.parametrize(
    "changes",
    [
        {"bloom_levels": []},
        {"bloom_levels": ["apply", "apply"]},
        {"bloom_levels": ["recall"]},
        {"discipline_examples": []},
        {"discipline_examples": ["Matemáticas", "Matemáticas"]},
        {"rules": ["same rule", "same rule"]},
        {"allowed_question_types": []},
        {"allowed_question_types": ["essay", "essay"]},
        {"allowed_question_types": ["diagram"]},
        {"primary_evaluation_criterion": "memorization"},
        {"estimated_minutes_per_question": {"min": 0, "max": 2}},
        {"estimated_minutes_per_question": {"min": 6, "max": 5}},
        {"question_time_overrides": {"essay": {"min": 0, "max": 2}}},
        {"question_time_overrides": {"essay": {"min": 1, "max": 2}}},
        {"question_time_overrides": {"diagram": {"min": 1, "max": 2}}},
        {"feedback_modes": []},
        {"feedback_modes": ["formula", "formula"]},
        {"feedback_modes": ["answer_key"]},
        {"procedure_rubric_weights": {"result": 0.0, "procedure": 1.0}},
        {"procedure_rubric_weights": {"result": 0.4, "procedure": 0.5}},
    ],
)
def test_profile_configuration_rejects_invalid_enums_ranges_arrays_and_weights(changes):
    from app.pedagogy.contracts import PedagogyProfile

    data = make_valid_profile_data()
    data.update(changes)

    with pytest.raises(ValidationError):
        PedagogyProfile.model_validate(data)


def test_profile_configuration_accepts_valid_overrides_and_positive_unit_weights():
    data = make_valid_profile_data()
    data["question_time_overrides"] = {"multiple_choice": {"min": 1, "max": 2}}
    profile = make_profile(data)
    resolver = getattr(registry, "resolve_question_time", None)

    assert callable(resolver), "Per-format timing inheritance is not publicly resolvable."
    assert resolver(profile, "multiple_choice").model_dump() == {"min": 1, "max": 2}
    inherited = resolver(profile, "true_false")
    assert inherited.model_dump() == {"min": 3, "max": 5}
    inherited.min = 4
    assert profile.estimated_minutes_per_question.min == 3
    with pytest.raises(ValueError):
        resolver(profile, "essay")
    assert profile.procedure_rubric_weights.model_dump() == {"result": 0.4, "procedure": 0.6}


def test_profile_aliases_topic_selection_fallback_and_returned_definitions_are_independent():
    assert registry.resolve_profile("history", "logical_deductive").id == "critical_argumentative"
    assert registry.resolve_profile("mathematics", "critical_argumentative").id == "logical_deductive"
    assert registry.resolve_profile("auto", "linguistic_interpretive").id == "linguistic_interpretive"
    assert registry.resolve_profile(None, "systemic_empirical").id == "systemic_empirical"
    assert registry.resolve_profile("auto", "mixed").id == "general"
    assert registry.resolve_profile(None, "unclassified").id == "general"
    assert registry.resolve_profile("auto", None).id == "general"
    assert registry.resolve_profile("", "logical_deductive").id == "general"
    assert registry.resolve_profile("unsupported", "logical_deductive").id == "general"

    first = registry.resolve_profile("auto", "logical_deductive")
    first.rules.append("caller mutation")
    first.bloom_levels.clear()
    second = registry.resolve_profile("auto", "logical_deductive")
    assert "caller mutation" not in second.rules
    assert second.bloom_levels == ["remember", "understand", "apply", "analyze"]


def test_snapshot_captures_full_configuration_bloom_target_and_deep_copies():
    profile = registry.resolve_profile("logical_deductive", None)
    profile.question_time_overrides["multiple_choice"] = contracts.MinuteRange(
        min=1, max=2
    )
    objective = contracts.LearningObjective.model_validate(
        {
            "id": "objective-1",
            "skill": "causal reasoning",
            "description": "Explain a cause-and-effect relationship.",
            "bloom_target": "analyze",
        }
    )
    snapshot = registry.snapshot_profile(profile, [objective])

    assert getattr(snapshot, "snapshot_schema_version", None) == 2
    assert snapshot.profile_id == "logical_deductive"
    assert snapshot.profile_version == 1
    assert snapshot.name == "Perfil Lógico-Deductivo"
    assert snapshot.discipline_examples == ["Matemáticas", "Física", "Programación"]
    assert snapshot.rules == profile.rules
    assert snapshot.objectives[0].bloom_target == "analyze"
    assert snapshot.bloom_levels == ["remember", "understand", "apply", "analyze"]
    assert snapshot.allowed_question_types == [
        "multiple_choice",
        "true_false",
        "short_answer",
        "step_by_step",
        "matching",
    ]
    assert snapshot.primary_evaluation_criterion == "procedure"
    assert snapshot.estimated_minutes_per_question.model_dump() == {"min": 3, "max": 5}
    assert snapshot.question_time_overrides["multiple_choice"].model_dump() == {
        "min": 1,
        "max": 2,
    }
    assert snapshot.feedback_modes == ["formula"]
    assert snapshot.procedure_rubric_weights.model_dump() == {"result": 0.4, "procedure": 0.6}

    profile.rules[0] = "changed outside snapshot"
    profile.question_time_overrides["multiple_choice"].max = 6
    objective.skill = "changed outside snapshot"
    snapshot.feedback_modes.append("counterargument")
    snapshot.question_time_overrides["multiple_choice"].max = 4
    assert snapshot.rules[0] != profile.rules[0]
    assert snapshot.objectives[0].skill == "causal reasoning"
    assert profile.question_time_overrides["multiple_choice"].max == 6
    assert profile.feedback_modes == ["formula"]


def test_version_two_snapshot_requires_an_explicit_schema_version():
    snapshot_data = make_valid_snapshot_data()
    snapshot_data.pop("snapshot_schema_version")

    with pytest.raises(ValidationError):
        contracts.PedagogySnapshot.model_validate(snapshot_data)


def test_snapshot_objective_bloom_target_must_be_a_global_and_configured_level():
    snapshot_data = make_valid_snapshot_data()
    try:
        contracts.PedagogySnapshot.model_validate(snapshot_data)
    except ValidationError as error:
        pytest.fail(f"A configured Bloom target was rejected: {error}")

    invalid_target = deepcopy(snapshot_data)
    invalid_target["objectives"][0]["bloom_target"] = "create"
    with pytest.raises(ValidationError):
        contracts.PedagogySnapshot.model_validate(invalid_target)

    with pytest.raises(ValidationError):
        contracts.LearningObjective.model_validate(
            {
                "id": "objective-2",
                "skill": "evaluate evidence",
                "description": "Compare competing explanations.",
                "bloom_target": "not-a-bloom-level",
            }
        )

    with pytest.raises(ValidationError):
        contracts.PedagogySnapshot.model_validate(
            {
                **snapshot_data,
                "objectives": [
                    {
                        "id": "objective-2",
                        "skill": "create a model",
                        "description": "Build a new model from evidence.",
                        "bloom_target": "create",
                    }
                ],
            }
        )


def test_legacy_reader_keeps_exact_old_shape_without_inventing_configuration():
    raw = legacy_snapshot_data()
    before = deepcopy(raw)
    reader = getattr(contracts, "read_pedagogy_snapshot", None)
    assert callable(reader), "The public legacy snapshot reader is missing."

    legacy = reader(raw)

    assert isinstance(legacy, contracts.LegacyPedagogySnapshot)
    assert legacy.model_dump(mode="json") == before
    assert raw == before
    assert not hasattr(legacy, "bloom_levels")
    assert not hasattr(legacy.objectives[0], "bloom_target")


def test_adaptive_draft_and_learning_response_accept_legacy_and_new_snapshots_without_private_keys():
    from app.pedagogy.contracts import AdaptiveAssessmentPayload, AdaptiveSessionDraft, LessonBlock
    from app.schemas.adaptive_learning import LearningResponseV2

    legacy_raw = legacy_snapshot_data()
    legacy_reader = getattr(contracts, "read_pedagogy_snapshot", None)
    assert callable(legacy_reader), "The public snapshot reader is missing."
    legacy = legacy_reader(legacy_raw)
    new_snapshot = registry.snapshot_profile(
        registry.resolve_profile("critical_argumentative", None),
        [contracts.LearningObjective.model_validate(
            {
                "id": "argument-1",
                "skill": "weigh arguments",
                "description": "Compare evidence for competing claims.",
                "bloom_target": "evaluate",
            }
        )],
    )
    assessment = AdaptiveAssessmentPayload(
        schema_version=2,
        question_objectives={},
        questions=[],
    )

    for snapshot in (legacy, new_snapshot):
        draft = AdaptiveSessionDraft(
            pedagogy_snapshot=snapshot,
            lesson_blocks=[
                LessonBlock(
                    id="block-1",
                    kind="explanation",
                    objective_ids=[],
                    content_markdown="A public lesson.",
                )
            ],
            adaptive_assessment=assessment,
        )
        response = LearningResponseV2.model_validate(
            {
                "session_id": 3,
                "snapshot": draft.pedagogy_snapshot.model_dump(mode="json"),
                "lesson_blocks": [block.model_dump(mode="json") for block in draft.lesson_blocks],
                "content_markdown": "A public lesson.",
            }
        )
        assert response.snapshot == snapshot
        assert "expected_answer" not in response.model_dump()
        with pytest.raises(ValidationError):
            LearningResponseV2.model_validate(
                {
                    "session_id": 3,
                    "snapshot": snapshot.model_dump(mode="json"),
                    "lesson_blocks": [],
                    "content_markdown": "Public lesson.",
                    "expected_answer": "private solution",
                }
            )
