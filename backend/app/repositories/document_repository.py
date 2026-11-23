"""Document persistence."""

from __future__ import annotations

from sqlalchemy import func, select

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

    def count_for_user(self, user_id: int) -> int:
        return self.db.scalar(select(func.count()).where(Document.user_id == user_id)) or 0

    def find_for_user(self, user_id: int, document_ids: list[int]) -> dict[int, Document]:
        """The caller's documents among ``document_ids``, keyed by ID (others are omitted)."""
        if not document_ids:
            return {}
        stmt = select(Document).where(
            Document.user_id == user_id, Document.id.in_(document_ids)
        )
        return {document.id: document for document in self.db.execute(stmt).scalars()}
