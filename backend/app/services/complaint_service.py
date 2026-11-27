"""Libro de Reclamaciones: store a reclamo/queja and give it the next correlative code of its year."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.complaint import Complaint
from app.repositories.complaint_repository import ComplaintRepository
from app.schemas.complaint import ComplaintCreate

# Peru has no DST: the book's year turns over at midnight in Lima, not UTC.
LIMA = timezone(timedelta(hours=-5))
_MAX_ATTEMPTS = 5


class ComplaintService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = ComplaintRepository(db)

    def create(self, data: ComplaintCreate, *, now: datetime | None = None) -> Complaint:
        year = (now or datetime.now(timezone.utc)).astimezone(LIMA).year
        for attempt in range(_MAX_ATTEMPTS):
            complaint = Complaint(year=year, number=self.repo.last_number(year) + 1, **data.model_dump())
            if now is not None:
                complaint.created_at = now
            try:
                return self.repo.save(complaint)
            except IntegrityError:  # a concurrent complaint took this number: read the max again
                self.db.rollback()
                if attempt == _MAX_ATTEMPTS - 1:
                    raise
        raise AssertionError("unreachable")
