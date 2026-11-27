"""Libro de Reclamaciones: public, no session, available in every deployment mode."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.rate_limit import rate_limit_by_ip
from app.db.session import get_db
from app.schemas.complaint import ComplaintCreate, ComplaintCreated
from app.services.complaint_service import ComplaintService

router = APIRouter(prefix="/complaints", tags=["complaints"])


@router.post(
    "",
    response_model=ComplaintCreated,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit_by_ip("complaints", limit=5, window_seconds=3600))],
)
def create_complaint(body: ComplaintCreate, db: Session = Depends(get_db)) -> ComplaintCreated:
    complaint = ComplaintService(db).create(body)
    return ComplaintCreated(code=complaint.code, created_at=complaint.created_at)
