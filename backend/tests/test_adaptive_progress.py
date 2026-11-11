import pytest
from fastapi.testclient import TestClient

import main
from app.algorithms.adaptive_route import exam_score
from app.models.goal import Goal
from app.models.plan import Plan, PlanStatus
from app.models.quiz import Quiz, QuizResult
from app.models.session import Session, SessionStatus


def v2_detail(quality=0):
    return {
        "_meta": {"type": "_meta", "schema_version": 2, "revision": "r1", "fingerprint": "example"},
        "adaptive:tf": {"type": "true_false", "objective": True, "correct": True},
        "adaptive:numeric": {"type": "numeric", "objective": True, "correct": False},
        "adaptive:essay": {"type": "essay", "objective": False, "criterion_ratings": {"evidence": 2}},
        "legacy:2": {"type": "flashcard", "objective": False, "quality": quality},
    }


@pytest.mark.parametrize("quality", [0, 5])
def test_adaptive_counts_and_mastery_use_only_objective_evidence(quality):
    detail = v2_detail(quality)
    assert exam_score(detail) == 0.5
    result = QuizResult(detail=detail)
    assert (result.correct, result.total) == (1, 2)


def test_legacy_counts_and_mastery_keep_their_existing_flashcard_weight():
    detail = {
        "1": {"type": "multiple_choice", "correct": True},
        "2": {"type": "flashcard", "quality": 0},
    }
    result = QuizResult(detail=detail)
    assert (result.correct, result.total) == (1, 1)
    assert exam_score(detail) == 2 / 3


def test_dashboard_includes_adaptive_results_without_multiple_choice_questions():
    with TestClient(main.app) as client:
        with main.SessionLocal() as db:
            goal = Goal(user_id=1, title="Exactitud adaptativa")
            db.add(goal)
            db.flush()
            plan = Plan(user_id=1, goal_id=goal.id, content_version=2, status=PlanStatus.READY)
            db.add(plan)
            db.flush()
            session = Session(
                plan_id=plan.id, topic_name="Comparar afirmaciones", status=SessionStatus.COMPLETED,
                quiz=Quiz(),
            )
            db.add(session)
            db.flush()
            db.add(QuizResult(quiz_id=session.quiz.id, session_id=session.id, score=50, detail=v2_detail()))
            plan_id, session_id = plan.id, session.id
            db.commit()
        try:
            response = client.get("/dashboard")
            assert response.status_code == 200
            scores = [score for score in response.json()["scores"] if score["session_id"] == session_id]
            assert [score["score"] for score in scores] == [50]
            plan_response = client.get(f"/plans/{plan_id}").json()
            summary = plan_response["sessions"][0]["last_result"]
            assert (summary["correct"], summary["total"]) == (1, 2)
        finally:
            assert client.delete(f"/plans/{plan_id}").status_code == 204
