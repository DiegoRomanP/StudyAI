"""Document endpoints."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, File, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.rate_limit import rate_limit
from app.db.session import get_db
from app.models.user import User
from app.schemas.document import DocumentResponse
from app.services.document_asset_service import find_asset, read_asset
from app.services.document_service import DocumentService, index_document_task

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post(
    "/upload",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("upload", limit=30, window_seconds=3600))],
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


@router.get(
    "/figures/{asset_id}",
    response_class=Response,
    responses={200: {"content": {"image/png": {}}}},
)
def get_document_figure(
    asset_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """A figure extracted from one of the caller's documents (404 for anyone else's)."""
    document_id, key = find_asset(db, asset_id)
    DocumentService(db).get_document(user.id, document_id)
    return Response(
        read_asset(key),
        media_type="image/png",
        headers={"Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff"},
    )
