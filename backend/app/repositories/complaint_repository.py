"""Complaints book persistence."""

from __future__ import annotations

from sqlalchemy import func, select

from app.models.complaint import Complaint
from app.repositories.base import BaseRepository


class ComplaintRepository(BaseRepository[Complaint]):
    model = Complaint

    def last_number(self, year: int) -> int:
        return self.db.scalar(select(func.max(Complaint.number)).where(Complaint.year == year)) or 0
