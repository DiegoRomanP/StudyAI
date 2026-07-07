"""Document persistence."""

from __future__ import annotations

from sqlalchemy import select

from app.models.document import Document
from app.repositories.base import BaseRepository


class DocumentRepository(BaseRepository[Document]):
    model = Document

    def list_for_user(self, user_id: int) -> list[Document]:
        stmt = (
            select(Document)
            .where(Document.user_id == user_id)
            .order_by(Document.created_at.desc())
        )
        return list(self.db.execute(stmt).scalars().all())
