from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import main
from app.core.exceptions import LLMError
from app.db.session import SessionLocal
from app.llm.mock_provider import MockLLMProvider
from app.llm.prompts import topic_analysis
from app.models.goal import GoalType
from app.models.plan import Plan, PlanTopic
from app.pedagogy.contracts import PedagogySnapshot
from app.services.plan_service import PlanService
from app.strategies.goal_strategies import GoalStrategyFactory


@pytest.fixture
def client():
    with TestClient(main.app) as test_client:
        yield test_client


class _TopicProvider(MockLLMProvider):
    def __init__(self, topics: list[dict], *, fail_first_content: bool = False) -> None:
        super().__init__()
        self.topics = topics
        self.topic_prompt = ""
        self.topic_analysis_calls = 0
        self.content_contexts: list[dict] = []
        self.fail_first_content = fail_first_content

    def complete(
        self,
        *,
        kind: str,
        system: str,
        prompt: str,
        context: dict | None = None,
        max_tokens: int = 4096,
    ) -> str:
        if kind == "topic_analysis":
            self.topic_analysis_calls += 1
            self.topic_prompt = prompt
            return json.dumps({"topics": self.topics})
        if kind == "session_content":
            self.content_contexts.append(context or {})
            if self.fail_first_content:
                self.fail_first_content = False
                raise LLMError("Falló el contenido de prueba.", code="LLM_PROVIDER_ERROR")
        return super().complete(
            kind=kind,
            system=system,
            prompt=prompt,
            context=context,
            max_tokens=max_tokens,
        )


def _topic(
    name: str,
    profile: str | None,
    objective_id: str,
    bloom_target: str = "understand",
) -> dict:
    return {
        "name": name,
        "subtopics": [f"{name} concept"],
        "difficulty": 3,
        "relevance": 0.9,
        "topic_profile": profile,
        "objectives": [
            {
                "id": objective_id,
                "skill": f"Skill for {name}",
                "description": f"Explain {name}.",
                "bloom_target": bloom_target,
            }
        ],
    }


def _create_goal(client: TestClient, title: str, goal_type: str = "LEARNING") -> int:
    response = client.post(
        "/goals",
        json={"goal_type": goal_type, "title": title, "description": ""},
    )
    assert response.status_code == 201
    return response.json()["id"]


def _install_provider(monkeypatch, provider: _TopicProvider) -> None:
    monkeypatch.setattr(
        "app.services.plan_service.get_llm_provider", lambda *_args: provider
    )
    monkeypatch.setattr("app.services.plan_service.uses_free_ai", lambda *_args: False)


def _generate(
    client: TestClient,
    goal_id: int,
    *,
    profile_hint: str | None = None,
    subject_hint: str = "auto",
    content_version: int = 2,
    idempotency_key: str | None = None,
) -> dict:
    body = {
        "goal_id": goal_id,
        "document_ids": [],
        "content_version": content_version,
    }
    if content_version == 2:
        if profile_hint is not None:
            body["profile_hint"] = profile_hint
        else:
            body["subject_hint"] = subject_hint
    headers = {"Idempotency-Key": idempotency_key} if idempotency_key else {}
    response = client.post("/plans/generate", json=body, headers=headers)
    return {"response": response, "plan_id": response.json().get("id")}


def _stored_topics(plan_id: int) -> tuple[Plan, list[PlanTopic]]:
    with SessionLocal() as db:
        plan = db.get(Plan, plan_id)
        topics = list(
            db.scalars(
                select(PlanTopic)
                .where(PlanTopic.plan_id == plan_id)
                .order_by(PlanTopic.name)
            )
        )
        db.expunge(plan)
        for topic in topics:
            db.expunge(topic)
        return plan, topics


def test_adaptive_analysis_prompt_and_snapshots_keep_mixed_profiles_and_objectives(
    client: TestClient, monkeypatch
):
    provider = _TopicProvider(
        [
            _topic("Historia", "critical_argumentative", "history-objective", "analyze"),
            _topic("Álgebra", "logical_deductive", "math-objective", "apply"),
        ]
    )
    _install_provider(monkeypatch, provider)
    goal_id = _create_goal(client, "Mixed adaptive study")

    generated = _generate(client, goal_id)

    assert generated["response"].status_code == 202
    plan_response = client.get(f"/plans/{generated['plan_id']}")
    assert plan_response.status_code == 200
    assert plan_response.json()["status"] == "READY"
    plan, topics = _stored_topics(generated["plan_id"])
    assert plan.generation_goal_type == GoalType.LEARNING.value
    snapshots = {
        topic.name: PedagogySnapshot.model_validate(topic.pedagogy_snapshot)
        for topic in topics
    }
    assert snapshots["Historia"].profile_id == "critical_argumentative"
    assert snapshots["Historia"].objectives[0].bloom_target == "analyze"
    assert snapshots["Álgebra"].profile_id == "logical_deductive"
    assert snapshots["Álgebra"].objectives[0].bloom_target == "apply"
    assert '"topic_profile"' in provider.topic_prompt
    assert '"objectives"' in provider.topic_prompt
    assert "logical_deductive: remember, understand, apply, analyze" in provider.topic_prompt
    assert "critical_argumentative: remember, understand, analyze, evaluate, create" in (
        provider.topic_prompt
    )


def test_v1_topic_analysis_keeps_its_original_prompt_and_does_not_save_v2_metadata(
    client: TestClient, monkeypatch
):
    provider = _TopicProvider(
        [_topic("Legacy algebra", "logical_deductive", "ignored-v2-objective")]
    )
    _install_provider(monkeypatch, provider)
    monkeypatch.setattr(
        "app.services.plan_service.Retriever.retrieve_texts",
        lambda *_args, **_kwargs: [],
    )
    goal_id = _create_goal(client, "Legacy prompt")

    generated = _generate(client, goal_id, content_version=1)

    assert generated["response"].status_code == 202
    expected_prompt = topic_analysis.build_topic_analysis_prompt([], "Legacy prompt.")
    expected_prompt += "\n\n" + GoalStrategyFactory.create(
        GoalType.LEARNING
    ).get_weighting_prompt()
    assert provider.topic_prompt == expected_prompt
    assert '"topic_profile"' not in provider.topic_prompt
    assert '"objectives"' not in provider.topic_prompt
    plan, topics = _stored_topics(generated["plan_id"])
    assert plan.generation_goal_type is None
    assert all(topic.pedagogy_snapshot is None for topic in topics)


def test_explicit_profile_and_legacy_alias_override_topic_candidates(
    client: TestClient, monkeypatch
):
    provider = _TopicProvider(
        [
            _topic("Historia", "critical_argumentative", "objective-history"),
            _topic("Álgebra", "logical_deductive", "objective-algebra"),
        ]
    )
    _install_provider(monkeypatch, provider)
    goal_id = _create_goal(client, "Explicit profile study")

    explicit = _generate(
        client, goal_id, profile_hint="systemic_empirical", idempotency_key="explicit-profile"
    )

    assert explicit["response"].status_code == 202
    assert "systemic_empirical: remember, understand, apply, analyze, evaluate" in (
        provider.topic_prompt
    )
    assert "critical_argumentative: remember, understand, analyze, evaluate, create" not in (
        provider.topic_prompt
    )
    _, topics = _stored_topics(explicit["plan_id"])
    assert {PedagogySnapshot.model_validate(topic.pedagogy_snapshot).profile_id for topic in topics} == {
        "systemic_empirical"
    }


def test_history_subject_alias_overrides_auto_topic_candidate(client: TestClient, monkeypatch):
    provider = _TopicProvider(
        [_topic("Álgebra", "logical_deductive", "objective-algebra")]
    )
    _install_provider(monkeypatch, provider)
    goal_id = _create_goal(client, "Legacy alias study")

    generated = _generate(
        client,
        goal_id,
        subject_hint="history",
        idempotency_key="history-alias-profile",
    )

    assert generated["response"].status_code == 202
    _, topics = _stored_topics(generated["plan_id"])
    assert PedagogySnapshot.model_validate(topics[0].pedagogy_snapshot).profile_id == (
        "critical_argumentative"
    )


def test_unknown_mixed_and_missing_topic_profiles_use_general_fallback(
    client: TestClient, monkeypatch
):
    provider = _TopicProvider(
        [
            _topic("Unknown", "not-a-profile", "unknown-objective"),
            _topic("Mixed", "mixed", "mixed-objective"),
            _topic("Missing", None, "missing-objective"),
            _topic("Legacy alias candidate", "history", "history-objective"),
            _topic("Math alias candidate", "mathematics", "math-objective"),
        ]
    )
    _install_provider(monkeypatch, provider)
    goal_id = _create_goal(client, "General fallback study")

    generated = _generate(client, goal_id)

    assert generated["response"].status_code == 202
    _, topics = _stored_topics(generated["plan_id"])
    assert {PedagogySnapshot.model_validate(topic.pedagogy_snapshot).profile_id for topic in topics} == {
        "general"
    }


def test_invalid_bloom_target_fails_generation_before_persisting_topics(
    client: TestClient, monkeypatch
):
    provider = _TopicProvider(
        [_topic("Álgebra", "logical_deductive", "bad-objective", "evaluate")]
    )
    _install_provider(monkeypatch, provider)
    goal_id = _create_goal(client, "Invalid Bloom study")

    generated = _generate(client, goal_id)

    assert generated["response"].status_code == 202
    assert client.get(f"/plans/{generated['plan_id']}/status").json()["status"] == "FAILED"
    _, topics = _stored_topics(generated["plan_id"])
    assert topics == []
    assert len(provider.topic_prompt) > 0


def test_too_many_topic_objectives_fail_generation_before_persisting_topics(
    client: TestClient, monkeypatch
):
    topic = _topic("Álgebra", "logical_deductive", "objective-1", "apply")
    topic["objectives"] = [
        {
            "id": f"objective-{index}",
            "skill": f"Skill {index}",
            "description": f"Describe skill {index}.",
            "bloom_target": "apply",
        }
        for index in range(4)
    ]
    provider = _TopicProvider([topic])
    _install_provider(monkeypatch, provider)
    goal_id = _create_goal(client, "Objective count study")

    generated = _generate(client, goal_id)

    assert generated["response"].status_code == 202
    assert client.get(f"/plans/{generated['plan_id']}/status").json()["status"] == "FAILED"
    _, topics = _stored_topics(generated["plan_id"])
    assert topics == []


def test_v2_request_identity_freezes_goal_type_and_keeps_v1_hash_unchanged(
    client: TestClient, monkeypatch
):
    scheduled: list[int] = []
    monkeypatch.setattr(
        "app.api.v1.routes.plans.generate_plan_task", scheduled.append
    )
    goal_id = _create_goal(client, "Frozen intention", goal_type="EXAM")

    first = _generate(
        client,
        goal_id,
        profile_hint="logical_deductive",
        idempotency_key="frozen-intention",
    )
    with SessionLocal() as db:
        first_plan = db.get(Plan, first["plan_id"])
        assert first_plan.generation_goal_type == GoalType.EXAM.value
        initial_request_hash = first_plan.idempotency_request_hash

    updated_goal = client.put(f"/goals/{goal_id}", json={"goal_type": "MEMORIZATION"})
    assert updated_goal.status_code == 200
    replay = _generate(
        client,
        goal_id,
        profile_hint="logical_deductive",
        idempotency_key="frozen-intention",
    )

    assert replay["response"].status_code == 409
    assert replay["response"].json()["code"] == "IDEMPOTENCY_KEY_REUSED"
    assert replay["plan_id"] is None
    assert scheduled == [first["plan_id"]]
    assert PlanService._idempotency_request_hash(
        goal_id, [], content_version=1, generation_goal_type=GoalType.EXAM.value
    ) == PlanService._idempotency_request_hash(
        goal_id, [], content_version=1, generation_goal_type=GoalType.MEMORIZATION.value
    )
    assert PlanService._idempotency_request_hash(
        goal_id,
        [],
        content_version=2,
        profile_hint="logical_deductive",
        generation_goal_type=GoalType.EXAM.value,
    ) != PlanService._idempotency_request_hash(
        goal_id,
        [],
        content_version=2,
        profile_hint="logical_deductive",
        generation_goal_type=GoalType.MEMORIZATION.value,
    )
    assert initial_request_hash is not None


def test_legacy_v2_identity_with_null_intention_replays_even_after_goal_changes(
    client: TestClient, monkeypatch
):
    scheduled: list[int] = []
    monkeypatch.setattr(
        "app.api.v1.routes.plans.generate_plan_task", scheduled.append
    )
    goal_id = _create_goal(client, "Legacy v2 intention", goal_type="EXAM")
    first = _generate(
        client,
        goal_id,
        profile_hint="logical_deductive",
        idempotency_key="legacy-v2-intention",
    )
    assert first["response"].status_code == 202

    with SessionLocal() as db:
        plan = db.get(Plan, first["plan_id"])
        plan.generation_goal_type = None
        plan.idempotency_request_hash = PlanService._idempotency_request_hash(
            goal_id,
            [],
            content_version=2,
            profile_hint="logical_deductive",
        )
        db.commit()

    assert client.put(f"/goals/{goal_id}", json={"goal_type": "MEMORIZATION"}).status_code == 200
    replay = _generate(
        client,
        goal_id,
        profile_hint="logical_deductive",
        idempotency_key="legacy-v2-intention",
    )

    assert replay["response"].status_code == 202
    assert replay["plan_id"] == first["plan_id"]
    assert scheduled == [first["plan_id"]]


def test_legacy_v2_integrity_race_winner_uses_the_compatible_old_hash(
    client: TestClient, monkeypatch
):
    scheduled: list[int] = []
    monkeypatch.setattr(
        "app.api.v1.routes.plans.generate_plan_task", scheduled.append
    )
    monkeypatch.setattr("app.services.plan_service.uses_free_ai", lambda *_args: False)
    goal_id = _create_goal(client, "Legacy race winner", goal_type="EXAM")
    first = _generate(
        client,
        goal_id,
        profile_hint="logical_deductive",
        idempotency_key="legacy-v2-race",
    )
    assert first["response"].status_code == 202

    with SessionLocal() as db:
        winner = db.get(Plan, first["plan_id"])
        winner.generation_goal_type = None
        winner.idempotency_request_hash = PlanService._idempotency_request_hash(
            goal_id,
            [],
            content_version=2,
            profile_hint="logical_deductive",
        )
        db.commit()

    assert client.put(f"/goals/{goal_id}", json={"goal_type": "MEMORIZATION"}).status_code == 200
    with SessionLocal() as db:
        service = PlanService(db)
        winner = db.get(Plan, first["plan_id"])
        find_results = iter((None, winner))
        monkeypatch.setattr(
            service,
            "_find_idempotent_plan",
            lambda *_args: next(find_results),
        )

        def raise_unique_violation() -> None:
            raise IntegrityError("INSERT INTO plans", {}, RuntimeError("unique key"))

        monkeypatch.setattr(db, "commit", raise_unique_violation)
        replayed_plan, created = service.create_plan(
            1,
            goal_id,
            [],
            idempotency_key="legacy-v2-race",
            content_version=2,
            profile_hint="logical_deductive",
        )

    assert created is False
    assert replayed_plan.id == first["plan_id"]
    assert scheduled == [first["plan_id"]]


def test_v2_topic_snapshots_survive_resume_after_goal_and_profile_registries_change(
    client: TestClient, monkeypatch
):
    topics = [_topic("Álgebra", "logical_deductive", "algebra-objective", "apply")]
    provider = _TopicProvider(topics, fail_first_content=True)
    _install_provider(monkeypatch, provider)
    goal_id = _create_goal(client, "Resume frozen profile", goal_type="EXAM")
    created = _generate(client, goal_id)
    plan_id = created["plan_id"]

    assert created["response"].status_code == 202
    assert provider.topic_analysis_calls == 1
    assert client.get(f"/plans/{plan_id}/status").json()["status"] == "FAILED"
    failed_plan, stored_before = _stored_topics(plan_id)
    assert failed_plan.generation_goal_type == GoalType.EXAM.value
    assert stored_before[0].pedagogy_snapshot is not None
    snapshot_before = stored_before[0].pedagogy_snapshot

    assert client.put(
        f"/goals/{goal_id}", json={"goal_type": "MEMORIZATION"}
    ).status_code == 200
    profile_before_resume = provider.topic_prompt
    monkeypatch.setattr(
        "app.services.plan_service.resolve_profile",
        lambda *_args: (_ for _ in ()).throw(AssertionError("snapshot was re-resolved")),
    )
    resumed = client.post(f"/plans/{plan_id}/resume")

    assert resumed.status_code == 202
    ready = client.get(f"/plans/{plan_id}/status")
    assert ready.json()["status"] == "READY"
    assert provider.topic_analysis_calls == 1
    assert provider.topic_prompt == profile_before_resume
    assert provider.content_contexts[-1]["flashcards"] == 3
    assert provider.content_contexts[-1]["multiple_choice"] == 7
    finished_plan, stored_after = _stored_topics(plan_id)
    assert finished_plan.generation_goal_type == GoalType.EXAM.value
    assert stored_after[0].pedagogy_snapshot == snapshot_before
