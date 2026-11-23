"""Tier limits (saas), goal archiving, credit endpoints and the PDF upload guards."""

from __future__ import annotations

import io
import uuid

import fitz
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

import main
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.credit_ledger import CreditLedger, CreditReason, CreditSource
from app.models.document import Document
from app.models.goal import Goal
from app.models.user import User
from app.services.credit_service import CreditService

USER_ID = 1


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


@pytest.fixture(autouse=True)
def _clean():
    """Each test starts with no goals, documents, ledger rows or credits for the demo user."""
    with SessionLocal() as db:
        for model in (Goal, Document):
            db.execute(delete(model).where(model.user_id == USER_ID))
        db.execute(delete(CreditLedger))
        db.get(User, USER_ID).credit_balance = 0
        db.commit()


@pytest.fixture
def saas(monkeypatch):
    monkeypatch.setattr(get_settings(), "DEPLOYMENT_MODE", "saas")


def _upload(client, name="a.md", content=b"# T\n\n" + b"texto de prueba " * 40, mime="text/markdown"):
    return client.post("/documents/upload", files={"file": (name, io.BytesIO(content), mime)})


def _goal(client, title="Meta"):
    return client.post("/goals", json={"goal_type": "LEARNING", "title": title, "description": ""})


def test_fourth_document_in_free_is_403(client, saas):
    assert [_upload(client).status_code for _ in range(3)] == [201, 201, 201]

    response = _upload(client)

    assert response.status_code == 403
    assert response.json() == {"detail": "Tu plan permite hasta 3 documentos.", "code": "PLAN_LIMIT_REACHED"}


def test_third_active_goal_is_403_until_one_is_archived(client, saas):
    first, second = _goal(client, "A").json(), _goal(client, "B").json()

    blocked = _goal(client, "C")
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "PLAN_LIMIT_REACHED"
    assert "Archiva una" in blocked.json()["detail"]

    archived = client.post(f"/goals/{first['id']}/archive")
    assert archived.status_code == 200 and archived.json()["archived_at"] is not None
    assert client.post(f"/goals/{first['id']}/archive").status_code == 200  # idempotent
    assert _goal(client, "C").status_code == 201

    # Reactivating needs a free slot again; the archived goal stays listed with its date.
    assert client.post(f"/goals/{first['id']}/unarchive").status_code == 403
    client.post(f"/goals/{second['id']}/archive")
    restored = client.post(f"/goals/{first['id']}/unarchive")
    assert restored.status_code == 200 and restored.json()["archived_at"] is None
    assert {g["id"] for g in client.get("/goals").json()} >= {first["id"], second["id"]}


def test_self_hosted_has_no_limits(client):
    assert get_settings().DEPLOYMENT_MODE == "self_hosted"
    assert all(_upload(client).status_code == 201 for _ in range(4))
    assert all(_goal(client, f"G{i}").status_code == 201 for i in range(4))
    balance = client.get("/account/credits").json()
    assert balance["max_documents"] is None and balance["max_active_goals"] is None


def test_credit_balance_endpoint(client, saas):
    with SessionLocal() as db:
        CreditService(db).grant(
            USER_ID, delta=10, reason=CreditReason.PURCHASE, source=CreditSource.PURCHASED,
            idempotency_key=f"test-purchase-{uuid.uuid4().hex}",
        )
    _goal(client)

    body = client.get("/account/credits").json()

    assert body["purchased"] == 10 and body["total"] == 10 and body["pass_credits"] == 0
    assert (body["tier"], body["max_documents"], body["max_active_goals"]) == ("credits", 30, 10)
    assert body["active_goals_used"] == 1


def test_history_only_has_the_current_users_rows_newest_first(client):
    with SessionLocal() as db:
        other = User(email=f"{uuid.uuid4().hex[:8]}@example.com")
        db.add(other)
        db.commit()
        service = CreditService(db)
        for owner, key in ((USER_ID, "h1"), (other.id, "h-other"), (USER_ID, "h2")):
            service.grant(
                owner, delta=1, reason=CreditReason.ADMIN_ADJUSTMENT, source=CreditSource.PURCHASED,
                idempotency_key=f"{key}-{uuid.uuid4().hex}",
            )

    rows = client.get("/account/credits/history?limit=50").json()

    assert len(rows) == 2
    assert rows[0]["id"] > rows[1]["id"]
    assert {r["reason"] for r in rows} == {"admin_adjustment"}
    assert client.get("/account/credits/history?limit=1").json() == rows[:1]
    assert client.get("/account/credits/history?limit=0").status_code == 422


def _pdf(pages: int, password: str | None = None) -> bytes:
    doc = fitz.open()
    for i in range(pages):
        doc.new_page().insert_text((72, 72), f"Pagina {i} con texto suficiente para indexar.")
    kwargs = {"encryption": fitz.PDF_ENCRYPT_AES_256, "user_pw": password, "owner_pw": password} if password else {}
    return doc.tobytes(**kwargs)


def test_password_protected_pdf_is_rejected(client):
    response = _upload(client, "x.pdf", _pdf(1, "secreto"), "application/pdf")

    assert response.status_code == 400
    assert response.json()["detail"] == "El PDF está protegido con contraseña."


def test_pdf_over_the_page_limit_is_rejected(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "MAX_PDF_PAGES", 2)

    assert _upload(client, "ok.pdf", _pdf(2), "application/pdf").status_code == 201
    response = _upload(client, "big.pdf", _pdf(3), "application/pdf")

    assert response.status_code == 400
    assert "2 páginas" in response.json()["detail"]
