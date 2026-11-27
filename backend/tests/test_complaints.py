"""Libro de Reclamaciones: correlative code per year, field validation, public, rate limited in saas."""

from __future__ import annotations

import re
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

import main
from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.db.session import SessionLocal
from app.models.complaint import Complaint
from app.schemas.complaint import ComplaintCreate
from app.services.complaint_service import ComplaintService

VALID = {
    "name": "Ana Pérez", "document_id": "12345678", "address": "Av. Siempre Viva 123, Lima",
    "phone": "999888777", "email": "ana@example.com", "kind": "reclamo", "amount_cents": 490,
    "detail": "No se acreditaron mis créditos.", "request": "Que se acrediten o se devuelva el pago.",
}


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


@pytest.fixture(autouse=True)
def _clean():
    limiter.clear()
    with SessionLocal() as db:
        db.execute(delete(Complaint))
        db.commit()
    yield
    limiter.clear()


def test_codes_are_correlative_within_the_year(client):
    first = client.post("/complaints", json=VALID)
    second = client.post("/complaints", json={**VALID, "kind": "queja", "amount_cents": None})
    assert first.status_code == second.status_code == 201
    a, b = first.json()["code"], second.json()["code"]
    assert re.fullmatch(r"R-\d{4}-\d{6}", a)
    assert a.endswith("-000001") and b.endswith("-000002") and a[:6] == b[:6]
    assert first.json()["created_at"]


def test_numbering_restarts_each_year_in_lima_time():
    data = ComplaintCreate(**VALID)
    with SessionLocal() as db:
        service = ComplaintService(db)
        # 2027-01-01 03:00 UTC is still 2026-12-31 in Lima.
        assert service.create(data, now=datetime(2027, 1, 1, 3, tzinfo=timezone.utc)).code == "R-2026-000001"
        assert service.create(data, now=datetime(2027, 1, 1, 6, tzinfo=timezone.utc)).code == "R-2027-000001"
        assert service.create(data, now=datetime(2027, 2, 1, tzinfo=timezone.utc)).code == "R-2027-000002"


def test_a_taken_number_is_retried_not_duplicated(monkeypatch):
    """Two concurrent requests read the same max: the loser hits the unique pair and takes the next."""
    from app.repositories.complaint_repository import ComplaintRepository

    data = ComplaintCreate(**VALID)
    with SessionLocal() as db:
        ComplaintService(db).create(data)
        real = ComplaintRepository.last_number
        reads = []

        def stale_first(self, year):  # first read is stale, as if the other request had not committed
            reads.append(year)
            return 0 if len(reads) == 1 else real(self, year)

        monkeypatch.setattr(ComplaintRepository, "last_number", stale_first)
        assert ComplaintService(db).create(data).code.endswith("-000002")
        assert len(reads) == 2


@pytest.mark.parametrize(
    "change",
    [
        {"name": None},
        {"name": "   "},
        {"email": "not-an-email"},
        {"kind": "sugerencia"},
        {"amount_cents": -1},
        {"document_id": "1" * 21},
        {"detail": "x" * 5001},
        {"unexpected": "field"},
    ],
)
def test_invalid_fields_are_422(client, change):
    body = {**VALID, **change}
    body = {k: v for k, v in body.items() if v is not None}
    assert client.post("/complaints", json=body).status_code == 422


def test_is_public_in_saas_and_limited_to_five_an_hour_per_ip(client, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "DEPLOYMENT_MODE", "saas")
    monkeypatch.setattr(settings, "AUTH_MODE", "supabase")  # no token is sent: must still work
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    for _ in range(5):
        assert client.post("/complaints", json=VALID).status_code == 201
    blocked = client.post("/complaints", json=VALID)
    assert blocked.status_code == 429 and "Retry-After" in blocked.headers
