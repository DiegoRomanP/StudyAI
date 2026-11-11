import pytest
from fastapi.testclient import TestClient

import main
from app.models.goal import Goal
from app.models.plan import Plan, PlanStatus
from app.models.quiz import QuestionType, Quiz, QuizQuestion
from app.models.session import Session, SessionKind, SessionMaterial
from app.models.user import User
from app.pedagogy.contracts import AdaptiveSessionDraft, LearningObjective, LessonBlock
from app.pedagogy.registry import resolve_profile, snapshot_profile
from app.repositories.adaptive_content_repository import AdaptiveContentRepository

VERSION_MISMATCH = {
    "code": "CONTENT_VERSION_MISMATCH",
    "detail": "Esta sesión usa otra versión de contenido.",
}
NOT_READY = {
    "code": "CONTENT_NOT_READY",
    "detail": "El contenido de la sesión todavía no está disponible.",
}


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as test_client:
        yield test_client


def seed_session(version, *, owner=1, publish=False, kind=SessionKind.NEW):
    with main.SessionLocal() as db:
        goal = Goal(user_id=owner, title="Razonamiento con evidencia")
        db.add(goal)
        db.flush()
        plan = Plan(
            user_id=owner, goal_id=goal.id, content_version=version, status=PlanStatus.READY
        )
        db.add(plan)
        db.flush()
        session = Session(
            plan_id=plan.id,
            topic_name="Contexto y causalidad",
            kind=kind,
            review_points=[{"prompt": "Pregunta anterior", "answer": "Solución privada"}],
            material=SessionMaterial(content_markdown="Fragmento para estudiar.", youtube_keywords=[]),
            quiz=Quiz(questions=[QuizQuestion(
                question_type=QuestionType.MULTIPLE_CHOICE,
                prompt="Pregunta de respaldo",
                options=["Solución privada", "Distractor"],
                answer="Solución privada",
            )]),
        )
        db.add(session)
        db.flush()
        if publish:
            objective = LearningObjective(
                id="cause", skill="causalidad", description="Explicar una causa", bloom_target="analyze"
            )
            AdaptiveContentRepository(db).save(session.id, AdaptiveSessionDraft(
                pedagogy_snapshot=snapshot_profile(resolve_profile("history", None), [objective]),
                lesson_blocks=[LessonBlock(
                    id="context", kind="context", objective_ids=["cause"], content_markdown="Contexto."
                )],
                adaptive_assessment={
                    "schema_version": 2,
                    "question_objectives": {},
                    "questions": [{
                        "question_id": "adaptive:numeric", "kind": "numeric", "prompt": "Mitad",
                        "objective_ids": ["cause"], "expected_answer": "1/2",
                    }],
                },
                assessment_revision="v2-current",
                assessment_state="open",
            ))
        ids = session.id, session.quiz.id
        db.commit()
        return ids


def test_learning_mode_and_lesson_respect_the_content_version(client):
    v1, _ = seed_session(1)
    v2, _ = seed_session(2, publish=True)

    assert client.get(f"/sessions/{v1}/learning-mode").json() == {"content_version": 1}
    assert client.get(f"/sessions/{v2}/learning-mode").json() == {"content_version": 2}
    wrong_version = client.get(f"/sessions/{v1}/learning-v2")
    assert (wrong_version.status_code, wrong_version.json()) == (409, VERSION_MISMATCH)

    response = client.get(f"/sessions/{v2}/learning-v2")
    assert response.status_code == 200
    lesson = response.json()
    assert lesson["session_id"] == v2
    assert lesson["snapshot"]["profile_id"] == "critical_argumentative"
    assert lesson["lesson_blocks"][0]["objective_ids"] == ["cause"]
    assert "expected_answer" not in response.text
    assert "Solución privada" not in response.text


def test_historical_v2_without_full_content_is_not_ready(client):
    session_id, _ = seed_session(2)

    assert client.get(f"/sessions/{session_id}/learning-mode").json() == {"content_version": 2}
    response = client.get(f"/sessions/{session_id}/learning-v2")
    assert (response.status_code, response.json()) == (409, NOT_READY)


def test_legacy_quiz_and_completion_do_not_accept_a_v2_session(client):
    session_id, quiz_id = seed_session(2, publish=True)
    expected = (409, VERSION_MISMATCH)
    responses = [
        client.get(f"/quizzes/{session_id}"),
        client.get(f"/sessions/{session_id}/result"),
        client.post(f"/quizzes/{quiz_id}/submit", json={"answers": []}),
        client.post(f"/sessions/{session_id}/complete", json={}),
    ]
    assert [(response.status_code, response.json()) for response in responses] == [expected] * 4
    assert client.get(f"/sessions/{session_id}").json()["status"] == "PENDING"


def test_shared_session_responses_never_project_v2_review_keys(client, monkeypatch):
    from app.api.v1.routes import sessions

    monkeypatch.setattr(sessions, "generate_reinforcement_task", lambda *args, **kwargs: None)
    legacy, _ = seed_session(1, kind=SessionKind.REVIEW)
    adaptive, _ = seed_session(2, publish=True, kind=SessionKind.REVIEW)
    assert client.get(f"/sessions/{legacy}").json()["review_points"][0]["answer"] == "Solución privada"
    responses = [
        client.get(f"/sessions/{adaptive}"),
        client.post(f"/sessions/{adaptive}/reinforcement"),
        client.post(f"/sessions/{adaptive}/reinforcement/cancel"),
    ]
    assert [response.status_code for response in responses] == [200, 202, 200]
    for response in responses:
        assert response.json()["review_points"] == []
        assert "Solución privada" not in response.text


def test_ownership_is_checked_before_content_version(client):
    with main.SessionLocal() as db:
        user = User(email="other-learning-route-owner@example.test")
        db.add(user)
        db.flush()
        owner = user.id
        db.commit()
    foreign_session, foreign_quiz = seed_session(2, owner=owner)

    assert client.get(f"/sessions/{foreign_session}/learning-mode").status_code == 404
    assert client.get(f"/sessions/{foreign_session}/learning-v2").status_code == 404
    assert client.get(f"/quizzes/{foreign_session}").status_code == 404
    assert client.post(f"/quizzes/{foreign_quiz}/submit", json={"answers": []}).status_code == 404
