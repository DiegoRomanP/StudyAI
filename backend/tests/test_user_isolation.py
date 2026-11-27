"""User B can never reach user A's data: every route taking a resource id answers 404."""

import io

import pytest
from fastapi import Header
from fastapi.testclient import TestClient

import main
from app.api.deps import get_current_user
from app.db.session import SessionLocal
from app.models.user import User


@pytest.fixture(scope="module")
def world():
    """Two users sharing one app; the acting user is chosen per request by ``X-Test-User``."""
    ids: dict[str, int] = {}

    def pick_user(x_test_user: str = Header(default="a")) -> User:
        with SessionLocal() as db:
            return db.get(User, ids[x_test_user])

    main.app.dependency_overrides[get_current_user] = pick_user
    with TestClient(main.app) as client:  # the lifespan creates the tables
        with SessionLocal() as db:
            users = {name: User(email=f"{name}@isolation.test") for name in ("a", "b")}
            db.add_all(users.values())
            db.commit()
            ids.update({name: u.id for name, u in users.items()})

        def a(method, url, **kw):
            return client.request(method, url, headers={"X-Test-User": "a"}, **kw)

        goal_id = a("POST", "/goals", json={"goal_type": "LEARNING", "title": "Aislamiento"}).json()["id"]
        doc_id = indexed_doc_as(a)
        r = a("POST", "/plans/generate", json={"goal_id": goal_id, "document_ids": [doc_id]})
        assert r.status_code == 202
        plan_id = r.json()["id"]
        plan = a("GET", f"/plans/{plan_id}").json()
        assert plan["status"] == "READY"
        session_id = plan["sessions"][0]["id"]
        quiz_id = a("GET", f"/quizzes/{session_id}").json()["id"]
        assert a("POST", f"/sessions/{session_id}/complete").status_code == 200
        yield client, {"doc": doc_id, "goal": goal_id, "plan": plan_id, "session": session_id, "quiz": quiz_id}
    main.app.dependency_overrides.pop(get_current_user, None)


def indexed_doc_as(a) -> int:
    content = "# Tema\n\n" + "Contenido de prueba para indexar. " * 50
    files = {"file": ("doc.md", io.BytesIO(content.encode()), "text/markdown")}
    doc_id = a("POST", "/documents/upload", files=files).json()["id"]
    assert a("GET", f"/documents/{doc_id}").json()["status"] == "INDEXED"
    return doc_id


ROUTES = [
    ("GET", "/documents/{doc}", None),
    ("DELETE", "/documents/{doc}", None),
    ("GET", "/goals/{goal}", None),
    ("PUT", "/goals/{goal}", {"title": "Robado"}),
    ("DELETE", "/goals/{goal}", None),
    ("POST", "/goals/{goal}/archive", None),
    ("POST", "/goals/{goal}/unarchive", None),
    ("GET", "/plans/{plan}", None),
    ("GET", "/plans/{plan}/status", None),
    ("POST", "/plans/{plan}/resume", None),
    ("DELETE", "/plans/{plan}", None),
    ("GET", "/sessions/{session}", None),
    ("GET", "/sessions/{session}/result", None),
    ("POST", "/sessions/{session}/complete", None),
    ("POST", "/sessions/{session}/reinforcement", None),
    ("POST", "/sessions/{session}/reinforcement/cancel", None),
    ("GET", "/sessions/{session}/learning-mode", None),
    ("GET", "/sessions/{session}/learning-v2", None),
    ("GET", "/sessions/{session}/assistant", None),
    ("POST", "/sessions/{session}/assistant", {"message": "hola"}),
    ("GET", "/quizzes/{session}", None),
    ("POST", "/quizzes/{quiz}/submit", {"answers": []}),
    ("GET", "/quizzes/{session}/assessment-v2", None),
    ("GET", "/quizzes/{session}/assessment-v2/result", None),
    ("POST", "/quizzes/{quiz}/assessment-v2/submit", {"revision": "x", "answers": []}),
]


@pytest.mark.parametrize("method,path,body", ROUTES, ids=[f"{m} {p}" for m, p, _ in ROUTES])
def test_other_user_gets_404(world, method, path, body):
    client, ids = world
    r = client.request(method, path.format(**ids), json=body, headers={"X-Test-User": "b"})
    assert r.status_code == 404, r.text


def test_b_cannot_generate_a_plan_from_a_goal_or_document(world):
    client, ids = world
    hb = {"X-Test-User": "b"}
    own_goal = client.post("/goals", json={"goal_type": "LEARNING", "title": "Mía"}, headers=hb).json()["id"]
    for body in ({"goal_id": ids["goal"], "document_ids": []}, {"goal_id": own_goal, "document_ids": [ids["doc"]]}):
        r = client.post("/plans/generate", json=body, headers=hb)
        assert r.status_code in (400, 404, 422), r.text
    assert client.get("/plans", headers=hb).json() == []


def test_b_lists_and_dashboard_are_empty(world):
    client, ids = world
    hb = {"X-Test-User": "b"}
    for path in ("/documents", "/plans"):
        assert client.get(path, headers=hb).json() == []
    assert all(g["title"] == "Mía" for g in client.get("/goals", headers=hb).json())
    dash = client.get("/dashboard", headers=hb).json()
    assert dash["sessions_completed"] == 0
    # A's data is intact after all the failed attempts above (runs last: DELETE routes ran as B).
    assert client.get(f"/plans/{ids['plan']}", headers={"X-Test-User": "a"}).status_code == 200
    assert client.get(f"/documents/{ids['doc']}", headers={"X-Test-User": "a"}).status_code == 200
