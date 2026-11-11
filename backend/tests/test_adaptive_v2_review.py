from fastapi.testclient import TestClient

import main
from app.models.goal import Goal
from app.models.plan import Plan, PlanStatus, PlanTopic
from app.models.quiz import QuestionType, Quiz, QuizQuestion, QuizResult
from app.models.session import Session, SessionKind, SessionMaterial, SessionStatus
from app.pedagogy.contracts import AdaptiveSessionDraft, LearningObjective
from app.pedagogy.registry import resolve_profile, snapshot_profile
from app.repositories.adaptive_content_repository import AdaptiveContentRepository
from app.services.adaptive_route_service import AdaptiveRouteService


def test_v2_review_copies_versioned_content_and_prioritizes_missed_objectives():
    with TestClient(main.app) as client:
        with main.SessionLocal() as db:
            goal = Goal(user_id=1, title="Comparar cantidades")
            db.add(goal)
            db.flush()
            topic = PlanTopic(name="Fracciones")
            plan = Plan(user_id=1, goal_id=goal.id, content_version=2, status=PlanStatus.READY, topics=[topic])
            db.add(plan)
            db.flush()
            session = Session(
                plan_id=plan.id, topic_id=topic.id, topic_name=topic.name, status=SessionStatus.COMPLETED,
                material=SessionMaterial(content_markdown="Una mitad equivale a 0,5.", youtube_keywords=[]),
                quiz=Quiz(questions=[
                    QuizQuestion(question_type=QuestionType.FLASHCARD, prompt="Mitad", answer="1/2"),
                    QuizQuestion(
                        question_type=QuestionType.MULTIPLE_CHOICE, order_index=1, prompt="Valor",
                        options=["1", "2", "3", "4"], answer="1",
                    ),
                ]),
            )
            db.add(session)
            db.flush()
            flashcard, legacy_mc = session.quiz.questions
            snapshot = snapshot_profile(resolve_profile("mathematics", None), [LearningObjective(
                id="objetivo", skill="comparar", description="Compara fracciones", bloom_target="apply",
            )])
            content = AdaptiveSessionDraft(
                pedagogy_snapshot=snapshot, lesson_blocks=[], assessment_revision="source-revision",
                assessment_state="submitted", adaptive_assessment={
                    "schema_version": 2,
                    "question_objectives": {f"legacy:{q.id}": ["objetivo"] for q in (flashcard, legacy_mc)},
                    "questions": [
                        {"question_id": "adaptive:tf", "kind": "true_false", "prompt": "¿Son iguales?",
                         "objective_ids": ["objetivo"], "expected_answer": True},
                        {"question_id": "adaptive:n", "kind": "numeric", "prompt": "Escribe la mitad",
                         "objective_ids": ["objetivo"], "expected_answer": "1/2"},
                    ],
                },
            )
            AdaptiveContentRepository(db).save(session.id, content)
            result = QuizResult(quiz_id=session.quiz.id, session_id=session.id, score=33.3, detail={
                "_meta": {"type": "_meta", "schema_version": 2},
                f"legacy:{flashcard.id}": {"type": "flashcard", "objective": False, "quality": 0},
                f"legacy:{legacy_mc.id}": {"type": "multiple_choice", "objective": True, "correct": False},
                "adaptive:tf": {"type": "true_false", "objective": True, "correct": True},
                "adaptive:n": {"type": "numeric", "objective": True, "correct": False},
            })
            db.add(result)
            db.flush()
            plan_id, flashcard_id = plan.id, flashcard.id
            AdaptiveRouteService(db).apply_exam(session.id, result.id)
            db.commit()

        try:
            with main.SessionLocal() as db:
                plan = db.get(Plan, plan_id)
                assert plan.topics[0].mastery == 0.4
                review, = [item for item in plan.sessions if item.kind == SessionKind.REVIEW]
                copy = AdaptiveContentRepository(db).get(review.id)
                assert copy is not None and copy.pedagogy_snapshot == snapshot
                assert copy.assessment_revision != "source-revision" and copy.assessment_state == "open"
                assert [question.question_id for question in copy.adaptive_assessment.questions] == [
                    "adaptive:n", "adaptive:tf",
                ]
                copied_card, = [q for q in review.quiz.questions if q.question_type == QuestionType.FLASHCARD]
                copied_mc, = [q for q in review.quiz.questions if q.question_type == QuestionType.MULTIPLE_CHOICE]
                assert copied_card.source_question_id == flashcard_id
                assert copy.adaptive_assessment.question_objectives == {
                    f"legacy:{copied_card.id}": ["objetivo"], f"legacy:{copied_mc.id}": ["objetivo"],
                }
                assert {point["question_id"] for point in review.review_points} == {
                    "adaptive:n", f"legacy:{copied_mc.id}",
                }
                review_id = review.id
            assert client.get(f"/sessions/{review_id}").json()["review_points"] == []
            assert client.get(f"/sessions/{review_id}/learning-v2").status_code == 200
        finally:
            assert client.delete(f"/plans/{plan_id}").status_code == 204
