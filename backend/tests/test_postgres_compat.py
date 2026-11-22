"""Behaviour that differs between SQLite and Postgres (run with TEST_DATABASE_URL for the latter).

Postgres enforces VARCHAR lengths and acts on FK ``ON DELETE CASCADE``; SQLite (as configured
here) does neither. Both engines must give the same answers.
"""

import io

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

import main
from app.db.session import SessionLocal
from app.models.flashcard import FlashcardReview
from app.models.quiz import QuizQuestion


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


def test_long_filename_is_truncated_keeping_its_extension(client: TestClient):
    name = "a" * 600 + ".md"
    files = {"file": (name, io.BytesIO(b"# Notas\n\nContenido."), "text/markdown")}

    r = client.post("/documents/upload", files=files)

    assert r.status_code == 201
    filename = r.json()["filename"]
    assert len(filename) == 512
    assert filename.endswith(".md")


def _ready_plan_with_reviews(client: TestClient, goal_id: int) -> None:
    md = "# Tema\n\n" + "Contenido de prueba para el plan. " * 200
    files = {"file": ("tema.md", io.BytesIO(md.encode()), "text/markdown")}
    doc_id = client.post("/documents/upload", files=files).json()["id"]
    plan_id = client.post("/plans/generate", json={"goal_id": goal_id, "document_ids": [doc_id]}).json()["id"]
    plan = client.get(f"/plans/{plan_id}").json()
    assert plan["status"] == "READY"

    quiz = client.get(f"/quizzes/{plan['sessions'][0]['id']}").json()
    answers = [
        {"question_id": q["id"], "quality": 5}
        if q["question_type"] == "FLASHCARD"
        else {"question_id": q["id"], "selected_option": q["answer"]}
        for q in quiz["questions"]
    ]
    assert client.post(f"/quizzes/{quiz['id']}/submit", json={"answers": answers}).status_code == 200


def _orphan_reviews() -> int:
    with SessionLocal() as db:
        return db.scalar(
            select(func.count())
            .select_from(FlashcardReview)
            .where(~FlashcardReview.question_id.in_(select(QuizQuestion.id)))
        )


def test_deleted_goal_keeps_plans_and_deleting_them_leaves_no_orphans(client: TestClient):
    goal_id = client.post("/goals", json={"goal_type": "MEMORIZATION", "title": "Meta", "description": ""}).json()["id"]
    _ready_plan_with_reviews(client, goal_id)
    _ready_plan_with_reviews(client, goal_id)

    # Postgres enforces Plan.goal_id's FK: a soft delete must not fire its cascade.
    assert client.delete(f"/goals/{goal_id}").status_code == 204
    assert client.get(f"/goals/{goal_id}").status_code == 404
    plan_ids = [p["id"] for p in client.get("/plans").json() if p["goal_id"] == goal_id]
    assert len(plan_ids) == 2

    for plan_id in plan_ids:
        assert client.delete(f"/plans/{plan_id}").status_code == 204
    assert _orphan_reviews() == 0


def test_a_goal_title_at_the_limit_still_creates_a_plan(client: TestClient):
    goal_id = client.post("/goals", json={"goal_type": "EXAM", "title": "t" * 255, "description": ""}).json()["id"]
    md = "# Tema\n\n" + "Contenido de prueba. " * 100
    files = {"file": ("t.md", io.BytesIO(md.encode()), "text/markdown")}
    doc_id = client.post("/documents/upload", files=files).json()["id"]

    r = client.post("/plans/generate", json={"goal_id": goal_id, "document_ids": [doc_id]})

    assert r.status_code == 202
    assert len(client.get(f"/plans/{r.json()['id']}").json()["title"]) == 255


@pytest.mark.skipif(
    __import__("app.db.session", fromlist=["engine"]).engine.dialect.name != "postgresql",
    reason="needs TEST_DATABASE_URL",
)
def test_every_postgres_table_has_row_level_security(client: TestClient):
    # Supabase exposes public tables through its REST API to anyone with the publishable key;
    # RLS with no policies closes that, while the backend (table owner) is unaffected.
    from sqlalchemy import text

    from app.db.session import engine
    from app.rag.vector_store import _PgVectorStore

    _PgVectorStore()
    with engine.connect() as conn:
        open_tables = conn.execute(
            text(
                "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
                "WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity"
            )
        ).scalars().all()
    assert open_tables == []
