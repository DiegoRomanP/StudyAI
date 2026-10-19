"""An exam adjusts the route: mastery, review box and the REVIEW session it schedules."""

from __future__ import annotations

import io
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

import main
from app.db.session import SessionLocal
from app.llm.mock_provider import MockLLMProvider
from app.models.plan import PlanTopic
from app.models.quiz import QuizQuestion, QuizResult
from app.models.session import Session as StudySession
from app.services import adaptive_route_service

D0 = date(2026, 10, 19)


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


@pytest.fixture
def today(monkeypatch):
    """Mutable 'today' for the route service."""
    current = {"day": D0}
    monkeypatch.setattr(adaptive_route_service, "_today", lambda: current["day"])
    return current


@pytest.fixture
def created_plans(client: TestClient):
    """The suite shares one database: remove the plans a test creates."""
    plan_ids: list[int] = []
    yield plan_ids
    for plan_id in plan_ids:
        assert client.delete(f"/plans/{plan_id}").status_code == 204


def _plan(client: TestClient, created_plans: list[int], title: str) -> dict:
    goal_id = client.post(
        "/goals", json={"goal_type": "EXAM", "title": title, "description": ""}
    ).json()["id"]
    md = "# Tema\n\n" + "Contenido de prueba para la ruta adaptativa. " * 200
    files = {"file": (f"{title}.md", io.BytesIO(md.encode()), "text/markdown")}
    doc_id = client.post("/documents/upload", files=files).json()["id"]
    plan_id = client.post("/plans/generate", json={"goal_id": goal_id, "document_ids": [doc_id]}).json()["id"]
    created_plans.append(plan_id)
    plan = client.get(f"/plans/{plan_id}").json()
    assert plan["status"] == "READY"
    return plan


def _answers(quiz: dict, mode: str) -> list[dict]:
    answers = []
    for question in quiz["questions"]:
        if question["question_type"] == "FLASHCARD":
            answers.append({"question_id": question["id"], "quality": 5 if mode == "good" else 0})
        else:
            wrong = next(o for o in question["options"] if o != question["answer"])
            chosen = question["answer"] if mode == "good" else wrong
            answers.append({"question_id": question["id"], "selected_option": chosen})
    return answers


def _take(client: TestClient, session_id: int, mode: str) -> dict:
    quiz = client.get(f"/quizzes/{session_id}").json()
    response = client.post(f"/quizzes/{quiz['id']}/submit", json={"answers": _answers(quiz, mode)})
    assert response.status_code == 200, response.text
    return quiz


def _refresh(client: TestClient, plan: dict) -> dict:
    return client.get(f"/plans/{plan['id']}").json()


def _topic(plan: dict, topic_id: int) -> dict:
    return next(t for t in plan["topics"] if t["id"] == topic_id)


def _reviews(plan: dict, topic_id: int, status: str = "PENDING") -> list[dict]:
    return [
        s for s in plan["sessions"]
        if s["kind"] == "REVIEW" and s["topic_id"] == topic_id and s["status"] == status
    ]


def test_perfect_new_exam_schedules_review_in_three_days(client, today, created_plans):
    plan = _plan(client, created_plans, "Ruta examen perfecto")
    first = plan["sessions"][0]

    _take(client, first["id"], "good")
    plan = _refresh(client, plan)

    topic = _topic(plan, first["topic_id"])
    assert topic["mastery"] == 0.8
    assert topic["review_box"] == 1
    assert topic["mastery_state"] == "EN_PROGRESO"
    [review] = _reviews(plan, first["topic_id"])
    assert review["scheduled_date"] == (D0 + timedelta(days=3)).isoformat()
    assert review["order_index"] > max(s["order_index"] for s in plan["sessions"] if s["kind"] == "NEW")
    detail = client.get(f"/sessions/{review['id']}").json()
    assert detail["review_points"] == []
    assert detail["material"]["content_markdown"]


def test_failed_exam_lists_points_and_puts_failed_questions_first(client, today, created_plans):
    plan = _plan(client, created_plans, "Ruta examen fallado")
    first = plan["sessions"][0]

    quiz = _take(client, first["id"], "bad")
    plan = _refresh(client, plan)

    topic = _topic(plan, first["topic_id"])
    assert topic["mastery"] == 0.2 and topic["review_box"] == 0
    assert topic["mastery_state"] == "REFORZAR"
    [review] = _reviews(plan, first["topic_id"])
    assert review["scheduled_date"] == (D0 + timedelta(days=1)).isoformat()

    detail = client.get(f"/sessions/{review['id']}").json()
    assert detail["review_points"] == [
        {"prompt": q["prompt"], "answer": q["answer"]} for q in quiz["questions"]
    ]
    copied = client.get(f"/quizzes/{review['id']}").json()
    assert [q["prompt"] for q in copied["questions"]] == [q["prompt"] for q in quiz["questions"]]
    originals = {q["prompt"]: q for q in quiz["questions"]}
    for question in copied["questions"]:
        original = originals[question["prompt"]]
        assert sorted(question["options"]) == sorted(original["options"])
        if question["question_type"] == "MULTIPLE_CHOICE":
            assert question["answer"] in question["options"]

    with SessionLocal() as db:
        sources = {
            q.prompt: q.source_question_id
            for q in db.query(QuizQuestion).filter(QuizQuestion.quiz_id == copied["id"])
        }
    assert sources == {q["prompt"]: q["id"] for q in quiz["questions"]}


def test_only_failed_questions_are_listed_and_come_first(client, today, created_plans):
    plan = _plan(client, created_plans, "Ruta fallo parcial")
    first = plan["sessions"][0]
    quiz = client.get(f"/quizzes/{first['id']}").json()
    answers = _answers(quiz, "good")
    last_mc = next(a for a in reversed(answers) if "selected_option" in a)
    question = next(q for q in quiz["questions"] if q["id"] == last_mc["question_id"])
    last_mc["selected_option"] = next(o for o in question["options"] if o != question["answer"])
    assert client.post(f"/quizzes/{quiz['id']}/submit", json={"answers": answers}).status_code == 200

    plan = _refresh(client, plan)
    [review] = _reviews(plan, first["topic_id"])
    detail = client.get(f"/sessions/{review['id']}").json()
    assert detail["review_points"] == [{"prompt": question["prompt"], "answer": question["answer"]}]
    copied = client.get(f"/quizzes/{review['id']}").json()
    assert copied["questions"][0]["prompt"] == question["prompt"]
    assert len(copied["questions"]) == len(quiz["questions"])


def test_three_good_spaced_exams_master_topic_and_stop_reviews(client, today, created_plans):
    plan = _plan(client, created_plans, "Ruta dominio")
    first = plan["sessions"][0]
    topic_id = first["topic_id"]

    _take(client, first["id"], "good")
    for expected_box, expected_days in ((1, 3), (2, 7)):
        plan = _refresh(client, plan)
        assert _topic(plan, topic_id)["review_box"] == expected_box
        [review] = _reviews(plan, topic_id)
        today["day"] = date.fromisoformat(review["scheduled_date"])
        _take(client, review["id"], "good")
        next_box = expected_box + 1
        plan = _refresh(client, plan)
        assert _topic(plan, topic_id)["review_box"] == next_box
        if next_box < 3:
            [following] = _reviews(plan, topic_id)
            assert following["scheduled_date"] == (today["day"] + timedelta(days=expected_days + 4)).isoformat()

    assert _topic(plan, topic_id)["mastery_state"] == "DOMINADO"
    assert _reviews(plan, topic_id) == []


def test_early_review_updates_mastery_without_promotion(client, today, created_plans):
    plan = _plan(client, created_plans, "Ruta repaso temprano")
    first = plan["sessions"][0]
    _take(client, first["id"], "good")
    plan = _refresh(client, plan)
    [review] = _reviews(plan, first["topic_id"])

    today["day"] = D0 + timedelta(days=1)  # before the review's date
    _take(client, review["id"], "good")
    plan = _refresh(client, plan)

    topic = _topic(plan, first["topic_id"])
    assert topic["mastery"] == 0.92
    assert topic["review_box"] == 1
    [following] = _reviews(plan, first["topic_id"])
    assert following["scheduled_date"] == (today["day"] + timedelta(days=3)).isoformat()


def test_retake_of_completed_session_does_not_touch_route(client, today, created_plans):
    plan = _plan(client, created_plans, "Ruta reintento")
    first = plan["sessions"][0]
    _take(client, first["id"], "good")
    before = _refresh(client, plan)

    _take(client, first["id"], "bad")
    after = _refresh(client, plan)

    assert _topic(after, first["topic_id"]) == _topic(before, first["topic_id"])
    assert len(after["sessions"]) == len(before["sessions"])


def test_complete_endpoint_without_quiz_does_not_touch_route(client, today, created_plans):
    plan = _plan(client, created_plans, "Ruta sin examen")
    first = plan["sessions"][0]

    assert client.post(f"/sessions/{first['id']}/complete", json={"flashcard_qualities": {}}).status_code in (200, 204)
    after = _refresh(client, plan)

    assert _topic(after, first["topic_id"])["mastery"] is None
    assert len(after["sessions"]) == len(plan["sessions"])


def test_quiz_without_answers_changes_nothing(client, today, created_plans):
    plan = _plan(client, created_plans, "Ruta sin respuestas")
    first = plan["sessions"][0]
    quiz = client.get(f"/quizzes/{first['id']}").json()

    assert client.post(f"/quizzes/{quiz['id']}/submit", json={"answers": []}).status_code == 200
    after = _refresh(client, plan)

    assert _topic(after, first["topic_id"])["mastery"] is None
    assert len(after["sessions"]) == len(plan["sessions"])


def test_legacy_plan_resolves_topic_by_name_or_skips(client, today, created_plans):
    plan = _plan(client, created_plans, "Ruta plan antiguo")
    named, orphan = plan["sessions"][0], plan["sessions"][1]
    with SessionLocal() as db:
        for session_id, rename in ((named["id"], None), (orphan["id"], "Tema que no existe")):
            session = db.get(StudySession, session_id)
            session.topic_id = None
            if rename:
                session.topic_name = rename
        db.commit()

    _take(client, named["id"], "good")
    _take(client, orphan["id"], "good")
    after = _refresh(client, plan)

    assert _topic(after, named["topic_id"])["mastery"] == 0.8
    assert _topic(after, orphan["topic_id"])["mastery"] is None
    assert len(_reviews(after, named["topic_id"])) == 1
    with SessionLocal() as db:
        assert db.get(StudySession, named["id"]).topic_id == named["topic_id"]


def test_handler_failure_keeps_result_and_leaves_no_partial_review(client, today, created_plans, monkeypatch):
    def boom(*_args, **_kwargs):
        raise RuntimeError("cannot build review")

    monkeypatch.setattr(adaptive_route_service.AdaptiveRouteService, "_build_review", boom)
    plan = _plan(client, created_plans, "Ruta fallo del handler")
    first = plan["sessions"][0]

    _take(client, first["id"], "good")
    after = _refresh(client, plan)

    with SessionLocal() as db:
        assert db.query(QuizResult).filter(QuizResult.session_id == first["id"]).count() == 1
    assert all(s["kind"] == "NEW" for s in after["sessions"])
    assert _topic(after, first["topic_id"])["mastery"] is None
    assert client.get(f"/sessions/{first['id']}").json()["status"] == "COMPLETED"


def test_double_registration_updates_topic_once(client, today, created_plans):
    adaptive_route_service.register_handlers()
    adaptive_route_service.register_handlers()
    plan = _plan(client, created_plans, "Ruta doble registro")
    first = plan["sessions"][0]

    _take(client, first["id"], "good")
    after = _refresh(client, plan)

    assert _topic(after, first["topic_id"])["review_box"] == 1
    assert len(_reviews(after, first["topic_id"])) == 1


def test_submit_makes_no_llm_calls(client, today, created_plans, monkeypatch):
    plan = _plan(client, created_plans, "Ruta sin llamadas")
    calls: list[str] = []
    original = MockLLMProvider.complete

    def counting(self, **kwargs):
        calls.append(kwargs.get("kind", ""))
        return original(self, **kwargs)

    monkeypatch.setattr(MockLLMProvider, "complete", counting)
    _take(client, plan["sessions"][0]["id"], "bad")

    assert calls == []


def test_rating_a_copied_card_updates_the_original_card_schedule(client, today, created_plans):
    plan = _plan(client, created_plans, "Ruta SM2 copia")
    first = plan["sessions"][0]
    quiz = client.get(f"/quizzes/{first['id']}").json()
    card = next(q for q in quiz["questions"] if q["question_type"] == "FLASHCARD")
    answers = [
        {"question_id": q["id"], "quality": 4} if q["question_type"] == "FLASHCARD"
        else {"question_id": q["id"], "selected_option": q["answer"]}
        for q in quiz["questions"]
    ]
    client.post(f"/quizzes/{quiz['id']}/submit", json={"answers": answers})

    plan = _refresh(client, plan)
    [review] = _reviews(plan, first["topic_id"])
    copied = client.get(f"/quizzes/{review['id']}").json()
    copy = next(q for q in copied["questions"] if q["prompt"] == card["prompt"])
    assert copy["id"] != card["id"]
    today["day"] = date.fromisoformat(review["scheduled_date"])
    client.post(f"/quizzes/{copied['id']}/submit", json={"answers": _answers(copied, "good")})

    from app.models.flashcard import FlashcardReview

    with SessionLocal() as db:
        reviews = db.query(FlashcardReview).filter(FlashcardReview.question_id.in_([card["id"], copy["id"]])).all()
    assert [(r.question_id, r.repetition_count) for r in reviews] == [(card["id"], 2)]
