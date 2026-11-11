import pytest
from fastapi.testclient import TestClient

import main
from app.models.goal import Goal
from app.models.plan import Plan, PlanStatus
from app.models.quiz import QuestionType, Quiz, QuizQuestion
from app.models.session import Session, SessionKind, SessionMaterial
from app.pedagogy.contracts import (
    AdaptiveSessionDraft,
    LearningObjective,
    LegacyLearningObjective,
    LegacyPedagogySnapshot,
    LessonBlock,
    MinuteRange,
)
from app.pedagogy.registry import resolve_profile, snapshot_profile
from app.repositories.adaptive_content_repository import AdaptiveContentRepository
from tests.test_adaptive_learning_routes import NOT_READY, VERSION_MISMATCH, seed_session


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as test_client:
        yield test_client


@pytest.fixture
def assessment(client):
    with main.SessionLocal() as db:
        goal = Goal(user_id=1, title="Calificar evaluación v2")
        plan = Plan(user_id=1, goal=goal, content_version=2, status=PlanStatus.READY)
        card = QuizQuestion(
            question_type=QuestionType.FLASHCARD, prompt="Tarjeta", answer="Revelar tarjeta",
        )
        legacy = QuizQuestion(
            question_type=QuestionType.MULTIPLE_CHOICE, prompt="Pregunta histórica",
            options=["Primera", "Segunda"], answer="Segunda", order_index=1,
        )
        session = Session(
            plan=plan, kind=SessionKind.REVIEW, topic_name="Fracciones",
            review_points=[{"question_id": "number", "prompt": "Tres cuartos", "answer": "3/4"}],
            material=SessionMaterial(content_markdown="Aprende fracciones."),
            quiz=Quiz(questions=[card, legacy]),
        )
        db.add(session)
        db.flush()
        profile = resolve_profile("mathematics", None)
        draft = AdaptiveSessionDraft(
            pedagogy_snapshot=snapshot_profile(profile, [
                LearningObjective(id=id_, skill=id_, description=id_, bloom_target="apply")
                for id_ in ("a", "b")
            ]),
            lesson_blocks=[LessonBlock(
                id="example", kind="example", objective_ids=["a", "b"], content_markdown="Ejemplo.",
                stimulus_id="case",
            )],
            adaptive_assessment={
                "schema_version": 2,
                "question_objectives": {f"legacy:{card.id}": ["a"], f"legacy:{legacy.id}": ["b"]},
                "questions": [
                    {
                        "question_id": "number", "kind": "numeric", "prompt": "Tres cuartos",
                        "objective_ids": ["a", "b"], "expected_answer": "3/4", "stimulus_id": "case",
                        "feedback": [{
                            "mode": "formula", "text": "Pista privada de la fórmula.",
                            "source_id": "fragment-1",
                        }],
                    },
                    {
                        "question_id": "boolean", "kind": "true_false", "prompt": "Es un entero",
                        "objective_ids": ["a"], "expected_answer": False,
                    },
                ],
                "stimuli": [{
                    "id": "case", "kind": "case", "title": "Ejemplo sintético", "objective_ids": ["a"],
                    "origin": "generated_example", "body_markdown": "Reparte una cantidad.",
                }],
            },
            assessment_revision="revision-1",
            assessment_state="open",
        )
        AdaptiveContentRepository(db).save(session.id, draft)
        ids = session.id, session.quiz.id, card.id, legacy.id, plan.id
        db.commit()
    yield ids[:4]
    assert client.delete(f"/plans/{ids[4]}").status_code == 204
    with main.SessionLocal() as db:
        db.delete(db.get(Goal, goal.id))
        db.commit()


def test_assessment_only_projects_public_question_fields(client, assessment):
    session_id, quiz_id, card_id, legacy_id = assessment
    response = client.get(f"/quizzes/{session_id}/assessment-v2")
    assert response.status_code == 200, response.text
    public = response.json()
    assert public["quiz_id"] == quiz_id
    assert public["revision"] == "revision-1"
    questions = public["questions"]
    assert [q["question_id"] for q in questions] == [
        "number", f"legacy:{card_id}", f"legacy:{legacy_id}", "boolean",
    ]
    assert questions[0]["estimated_minutes_per_question"] == {"min": 3, "max": 5}
    assert questions[0]["stimulus_id"] == "case"
    assert public["stimuli"][0]["body_markdown"] == "Reparte una cantidad."
    lesson = client.get(f"/sessions/{session_id}/learning-v2").json()
    assert lesson["stimuli"] == public["stimuli"]
    assert lesson["lesson_blocks"][0]["stimulus_id"] == "case"
    assert questions[1]["flashcard_answer"] == "Revelar tarjeta"
    assert questions[2]["mode"] == "single"
    assert questions[2]["options"] == ["Primera", "Segunda"]
    assert questions[2]["objective_ids"] == ["b"]
    for field in ("expected_answer", "correct", "exemplar", "matching_pairs", "3/4", "Pista privada"):
        assert field not in response.text


@pytest.mark.parametrize(
    "profile_id,expected_minutes",
    [
        ("history", {"min": 8, "max": 12}),
        ("mathematics", {"min": 3, "max": 5}),
        ("general", {"min": 5, "max": 10}),
    ],
)
def test_legacy_snapshot_assessment_get_derives_timing_without_mutation(
    client, assessment, profile_id, expected_minutes
):
    from copy import deepcopy

    session_id, quiz_id, _, _ = assessment
    with main.SessionLocal() as db:
        repository = AdaptiveContentRepository(db)
        draft = repository.get(session_id)
        assert draft is not None
        draft.pedagogy_snapshot = LegacyPedagogySnapshot(
            profile_id=profile_id,
            profile_version=1,
            rules=["Conserva las reglas históricas."],
            objectives=[
                LegacyLearningObjective(
                    id=objective_id,
                    skill=f"Habilidad {objective_id}",
                    description=f"Descripción {objective_id}.",
                )
                for objective_id in ("a", "b")
            ],
        )
        draft.assessment_revision = f"legacy-{profile_id}-revision"
        repository.save(session_id, draft)
        db.commit()
        session = db.get(Session, session_id)
        quiz = db.get(Quiz, quiz_id)
        snapshot_before = deepcopy(session.material.pedagogy_snapshot)
        revision_before = quiz.assessment_revision

    response = client.get(f"/quizzes/{session_id}/assessment-v2")

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["revision"] == revision_before == f"legacy-{profile_id}-revision"
    assert payload["questions"]
    assert all(
        question["estimated_minutes_per_question"] == expected_minutes
        for question in payload["questions"]
    )
    with main.SessionLocal() as db:
        session = db.get(Session, session_id)
        quiz = db.get(Quiz, quiz_id)
        assert session.material.pedagogy_snapshot == snapshot_before
        assert quiz.assessment_revision == revision_before


def test_full_snapshot_assessment_get_keeps_question_time_override(client, assessment):
    session_id, _, _, legacy_id = assessment
    with main.SessionLocal() as db:
        repository = AdaptiveContentRepository(db)
        draft = repository.get(session_id)
        assert draft is not None
        draft.pedagogy_snapshot.question_time_overrides["multiple_choice"] = MinuteRange(
            min=4, max=6
        )
        repository.save(session_id, draft)
        db.commit()

    response = client.get(f"/quizzes/{session_id}/assessment-v2")

    assert response.status_code == 200, response.text
    questions = {question["question_id"]: question for question in response.json()["questions"]}
    assert questions[f"legacy:{legacy_id}"]["estimated_minutes_per_question"] == {
        "min": 4,
        "max": 6,
    }
    assert questions["number"]["estimated_minutes_per_question"] == {"min": 3, "max": 5}


def test_assessment_get_requires_a_published_v2_session(client):
    legacy, _ = seed_session(1)
    incomplete, _ = seed_session(2)
    wrong = client.get(f"/quizzes/{legacy}/assessment-v2")
    not_ready = client.get(f"/quizzes/{incomplete}/assessment-v2")
    assert (wrong.status_code, wrong.json()) == (409, VERSION_MISMATCH)
    assert (not_ready.status_code, not_ready.json()) == (409, NOT_READY)
    assert client.get("/quizzes/999999/assessment-v2").status_code == 404


def test_historical_assessment_with_missing_choices_requires_regeneration(client, assessment):
    session_id, quiz_id, card_id, legacy_id = assessment
    with main.SessionLocal() as db:
        db.get(QuizQuestion, legacy_id).options = None
        db.commit()
    for response in (
        client.get(f"/quizzes/{session_id}/assessment-v2"),
        _submit(client, quiz_id, _answers(card_id, legacy_id)),
    ):
        assert (response.status_code, response.json()) == (409, NOT_READY)


def _answers(card_id, legacy_id):
    return [
        {"question_id": f"legacy:{card_id}", "kind": "flashcard", "quality": 0},
        {"question_id": f"legacy:{legacy_id}", "kind": "multiple_choice", "selected_option": "Segunda"},
        {"question_id": "number", "kind": "numeric", "value": "0,75"},
        {"question_id": "boolean", "kind": "true_false", "answer": True},
    ]


def _submit(client, quiz_id, answers, revision="revision-1"):
    return client.post(
        f"/quizzes/{quiz_id}/assessment-v2/submit",
        json={"revision": revision, "answers": answers},
    )


def _result(client, session_id):
    return client.get(f"/quizzes/{session_id}/assessment-v2/result")


def _observe_completions(monkeypatch, session_id):
    from app.events.session_events import SESSION_COMPLETED, event_bus

    observed = []
    def record(event):
        if event.session_id == session_id:
            observed.append(event.quiz_result_id)

    monkeypatch.setitem(
        event_bus._handlers, SESSION_COMPLETED, [*event_bus._handlers[SESSION_COMPLETED], record]
    )
    return observed


def test_submission_is_persisted_objective_only_and_replayable(client, assessment, monkeypatch):
    session_id, quiz_id, card_id, legacy_id = assessment
    observed = _observe_completions(monkeypatch, session_id)
    answers = _answers(card_id, legacy_id)
    assert _result(client, session_id).status_code == 404

    submitted = _submit(client, quiz_id, answers)
    assert submitted.status_code == 200, submitted.text
    result = submitted.json()
    assert (result["score"], result["correct"], result["total"]) == (66.7, 2, 3)
    assert result["objective_results"] == [
        {"objective_id": "a", "correct": 1, "total": 2},
        {"objective_id": "b", "correct": 2, "total": 2},
    ]
    item = next(item for item in result["detail"] if item["question_id"] == "number")
    assert item["expected_answer"] == "3/4"
    assert item["grounded_feedback"] == [{
        "mode": "formula", "text": "Pista privada de la fórmula.", "source_id": "fragment-1",
    }]
    assert _result(client, session_id).json() == result

    answers[2]["value"] = "3/4"
    replayed = _submit(client, quiz_id, list(reversed(answers)))
    assert (replayed.status_code, replayed.json()) == (200, result)
    answers[0]["quality"] = 5
    conflict = _submit(client, quiz_id, answers)
    assert conflict.status_code == 409
    assert conflict.json()["code"] == "ASSESSMENT_ALREADY_SUBMITTED"
    assert len(observed) == 1

    from app.models.flashcard import FlashcardReview
    with main.SessionLocal() as db:
        review = db.query(FlashcardReview).filter_by(question_id=card_id).one()
        assert review.last_quality == 0


def test_invalid_or_stale_submission_leaves_state_untouched(client, assessment, monkeypatch):
    session_id, quiz_id, card_id, legacy_id = assessment
    observed = _observe_completions(monkeypatch, session_id)
    answers = _answers(card_id, legacy_id)
    before = [client.get(f"/sessions/{session_id}").json(), client.get("/dashboard").json()]

    stale = _submit(client, quiz_id, answers, "old-revision")
    assert (stale.status_code, stale.json()) == (409, {
        "code": "QUIZ_OUTDATED",
        "detail": "Las preguntas de este test cambiaron. Vuelve a cargarlo.",
    })
    for invalid in (
        answers[:-1],
        answers + [answers[-1]],
        [*answers[:-1], {**answers[-1], "question_id": "other"}],
        [*answers[:-1], {"question_id": "boolean", "kind": "numeric", "value": "1"}],
        [*answers[:2], {**answers[2], "value": "1/0"}, answers[-1]],
    ):
        response = _submit(client, quiz_id, invalid)
        assert response.status_code == 400, response.text

    assert _result(client, session_id).status_code == 404
    assert before == [client.get(f"/sessions/{session_id}").json(), client.get("/dashboard").json()]
    assert observed == []


def test_completion_failure_rolls_back_result_and_sm2(client, assessment, monkeypatch):
    from app.events.session_events import SESSION_COMPLETED, event_bus
    from app.models.flashcard import FlashcardReview

    session_id, quiz_id, card_id, legacy_id = assessment
    answers = _answers(card_id, legacy_id)

    def fail_after_progress(event):
        if event.session_id == session_id:
            raise RuntimeError("mandatory event effect failed")

    with monkeypatch.context() as scoped:
        scoped.setitem(
            event_bus._handlers, SESSION_COMPLETED,
            [*event_bus._handlers[SESSION_COMPLETED], fail_after_progress],
        )
        with pytest.raises(RuntimeError, match="mandatory event effect failed"):
            _submit(client, quiz_id, answers)

    assert client.get(f"/sessions/{session_id}").json()["status"] == "PENDING"
    assert _result(client, session_id).status_code == 404
    with main.SessionLocal() as db:
        assert db.query(FlashcardReview).filter_by(question_id=card_id).count() == 0
        assert db.get(Quiz, quiz_id).assessment_state == "open"

    assert _submit(client, quiz_id, answers).status_code == 200


@pytest.mark.parametrize("same_answers", [True, False])
def test_competing_submissions_persist_one_result(client, assessment, monkeypatch, same_answers):
    from concurrent.futures import ThreadPoolExecutor

    session_id, quiz_id, card_id, legacy_id = assessment
    observed = _observe_completions(monkeypatch, session_id)
    first, second = (_answers(card_id, legacy_id) for _ in range(2))
    if not same_answers:
        second[-1]["answer"] = False

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(_submit, client, quiz_id, answers) for answers in (first, second)]
        responses = [future.result() for future in futures]

    assert sorted(response.status_code for response in responses) == [200, 200 if same_answers else 409]
    stored = _result(client, session_id).json()
    assert all(response.json() == stored for response in responses if response.status_code == 200)
    assert len(observed) == 1


@pytest.fixture
def with_all_formats(assessment):
    session_id, _, _, _ = assessment
    criterion = {
        "criterion_id": "reasoning",
        "description": "Explica el razonamiento.",
        "descriptors": ["Justifica la conclusión con evidencia."],
    }
    item_a = {"id": "a", "text": "Inicio"}
    item_b = {"id": "b", "text": "Conclusión"}
    pair_a = {"left_id": "a", "right_id": "y"}
    pair_b = {"left_id": "b", "right_id": "x"}
    questions_and_answers = [
        (
            {
                "kind": "multiple_choice", "mode": "multiple", "options": ["A", "B", "C", "D"],
                "expected_answer": ["A", "C"],
            },
            {"selected_options": ["C", "A"]},
        ),
        (
            {
                "kind": "matching", "matching_left": [item_a, item_b],
                "matching_right": [{"id": "x", "text": "Uno"}, {"id": "y", "text": "Dos"}],
                "matching_pairs": [pair_a, pair_b],
            },
            {"pairs": [pair_b, pair_a]},
        ),
        (
            {"kind": "sequence", "sequence_items": [item_a, item_b], "expected_answer": ["a", "b"]},
            {"ordered_ids": ["b", "a"]},
        ),
        (
            {"kind": "short_answer", "grading_mode": "exact", "expected_answer": ["Respuesta breve"]},
            {"text": " RESPUESTA    BREVE "},
        ),
        (
            {"kind": "short_answer", "grading_mode": "formative", "rubric_criteria": [criterion]},
            {"text": "Mi hipótesis."},
        ),
        (
            {"kind": "essay", "rubric_criteria": [criterion], "exemplar": "Ensayo modelo privado"},
            {"text": "Mi ensayo."},
        ),
        (
            {
                "kind": "step_by_step", "grading_mode": "numeric",
                "rubric_criteria": [criterion], "expected_answer": "2/3",
            },
            {"final_answer": "2/3"},
        ),
        (
            {"kind": "step_by_step", "grading_mode": "formative", "rubric_criteria": [criterion]},
            {"steps": "Mi justificación.", "final_answer": "Conclusión propia."},
        ),
        (
            {"kind": "rubric", "rubric_criteria": [{**criterion, "descriptors": ["Detalle anterior."]}]},
            {"text": "Versión histórica.", "criterion_ratings": {"reasoning": 2}},
        ),
    ]
    from app.pedagogy.contracts import StoredAssessmentQuestion

    with main.SessionLocal() as db:
        repository = AdaptiveContentRepository(db)
        draft = repository.get(session_id)
        for index, (fields, _) in enumerate(questions_and_answers):
            question = StoredAssessmentQuestion(
                question_id=f"additional-{index}", prompt="Pregunta de prueba", objective_ids=["a"], **fields
            )
            draft.adaptive_assessment.questions.append(question)
        repository.save(session_id, draft)
        db.commit()

    return [
        {"question_id": f"additional-{index}", "kind": question["kind"], **answer}
        for index, (question, answer) in enumerate(questions_and_answers)
    ]


def test_all_formats_submit_and_return_private_feedback_afterward(client, assessment, with_all_formats):
    session_id, quiz_id, card_id, legacy_id = assessment
    before = client.get(f"/quizzes/{session_id}/assessment-v2")
    assert before.status_code == 200, before.text
    for secret in ("Respuesta breve", "Ensayo modelo privado", "Justifica la conclusión", '"matching_pairs"'):
        assert secret not in before.text
    questions = {q["question_id"]: q for q in before.json()["questions"]}
    assert questions["additional-3"]["grading_mode"] == "exact"
    assert questions["additional-4"]["grading_mode"] == "formative"
    assert questions["additional-6"]["grading_mode"] == "numeric"
    assert questions["additional-0"]["mode"] == "multiple"

    answers = _answers(card_id, legacy_id) + with_all_formats
    submitted = _submit(client, quiz_id, answers)
    assert submitted.status_code == 200, submitted.text
    result = submitted.json()
    assert (result["score"], result["correct"], result["total"]) == (75.0, 6, 8)
    detail = {item["question_id"]: item for item in result["detail"]}
    assert detail["additional-1"]["expected_answer"] == [
        {"left_id": "a", "right_id": "y"}, {"left_id": "b", "right_id": "x"},
    ]
    assert detail["additional-2"]["correct"] is False

    formative = {item["question_id"]: item for item in result["formative_feedback"]}
    assert set(formative) == {f"additional-{i}" for i in (4, 5, 6, 7, 8)}
    assert formative["additional-5"]["submitted_text"] == "Mi ensayo."
    assert formative["additional-5"]["exemplar"] == "Ensayo modelo privado"
    assert formative["additional-6"]["procedure_rubric_weights"] == {"result": 0.4, "procedure": 0.6}
    assert formative["additional-6"]["submitted_final_answer"] == "2/3"
    assert "pasos" in formative["additional-6"]["message"].lower()
    assert formative["additional-6"]["criterion_ratings"] == {}
    assert formative["additional-7"]["submitted_text"] == "Mi justificación."
    assert formative["additional-8"]["criterion_ratings"] == {"reasoning": 2}
    assert _result(client, session_id).json() == result

    with_all_formats[0]["selected_options"].reverse()
    with_all_formats[1]["pairs"].reverse()
    with_all_formats[3]["text"] = "respuesta breve"
    assert _submit(client, quiz_id, answers).json() == result


def test_submission_loses_to_a_concurrent_revision_publication(client, assessment, monkeypatch):
    from app.repositories.quiz_repository import QuizRepository

    session_id, quiz_id, card_id, legacy_id = assessment
    claim = QuizRepository.claim_adaptive_submission

    def publish_before_claim(self, quiz, revision, completed_at):
        with main.SessionLocal() as publisher:
            publisher.get(Quiz, quiz.id).assessment_revision = "revision-2"
            publisher.commit()
        return claim(self, quiz, revision, completed_at)

    with monkeypatch.context() as scoped:
        scoped.setattr(QuizRepository, "claim_adaptive_submission", publish_before_claim)
        response = _submit(client, quiz_id, _answers(card_id, legacy_id))
    assert response.status_code == 409
    assert response.json()["code"] == "QUIZ_OUTDATED"
    assert client.get(f"/sessions/{session_id}").json()["status"] == "PENDING"
    assert _result(client, session_id).status_code == 404
    assert _submit(client, quiz_id, _answers(card_id, legacy_id), "revision-2").status_code == 200


def test_assessment_read_keeps_questions_and_revision_from_one_publication(client, assessment):
    from sqlalchemy import event

    from app.db.session import engine

    session_id, quiz_id, card_id, _ = assessment
    armed = True

    def publish_after_read(connection, cursor, statement, parameters, context, executemany):
        nonlocal armed
        if not armed or not statement.startswith("SELECT") or "adaptive_assessment" not in statement:
            return
        armed = False
        with main.SessionLocal() as writer:
            writer.get(Quiz, quiz_id).assessment_revision = "revision-2"
            writer.get(QuizQuestion, card_id).prompt = "Tarjeta nueva"
            writer.commit()

    event.listen(engine, "after_cursor_execute", publish_after_read)
    try:
        before = client.get(f"/quizzes/{session_id}/assessment-v2")
    finally:
        event.remove(engine, "after_cursor_execute", publish_after_read)

    after = client.get(f"/quizzes/{session_id}/assessment-v2")
    assert not armed
    assert (before.status_code, after.status_code) == (200, 200)
    assert before.json()["revision"] == "revision-1"
    assert after.json()["revision"] == "revision-2"
    assert next(q for q in before.json()["questions"] if q["kind"] == "flashcard")["prompt"] == "Tarjeta"
    assert next(q for q in after.json()["questions"] if q["kind"] == "flashcard")["prompt"] == "Tarjeta nueva"


def test_assessment_read_leaves_pending_session_fields_in_the_transaction(assessment):
    session_id, _, _, _ = assessment
    with main.SessionLocal() as db:
        session = db.get(Session, session_id)
        session.topic_id = 1000
        assert AdaptiveContentRepository(db).get(session_id).assessment_revision == "revision-1"
        assert session.topic_id == 1000
        db.rollback()
