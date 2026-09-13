"""Document endpoints."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, File, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.document import DocumentResponse
from app.services.document_service import DocumentService, index_document_task

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post(
    "/upload",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DocumentResponse:
    content = await file.read()
    service = DocumentService(db)
    document = service.create_upload(user.id, file.filename or "document", content)
    # Kick off RAG indexing in the background; the client polls the status.
    background_tasks.add_task(index_document_task, document.id)
    return DocumentResponse.model_validate(document)


@router.get("", response_model=list[DocumentResponse])
def list_documents(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[DocumentResponse]:
    service = DocumentService(db)
    return [DocumentResponse.model_validate(d) for d in service.list_documents(user.id)]


@router.get("/{document_id}", response_model=DocumentResponse)
def get_document(
    document_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DocumentResponse:
    service = DocumentService(db)
    return DocumentResponse.model_validate(service.get_document(user.id, document_id))


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    service = DocumentService(db)
    service.delete_document(user.id, document_id)
