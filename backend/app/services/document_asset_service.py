"""Figures extracted from a document: stored apart, described by a vision AI when one is
available, and left in the indexed text as ``[figura:N] description`` markers."""

from __future__ import annotations

import hashlib
import os
import shutil
from pathlib import Path

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import LLMError, NotFoundError
from app.core.logging import get_logger
from app.llm.base import LLMProvider
from app.llm.output_budget import OUTPUT_BUDGETS
from app.models.document_asset import DocumentAsset
from app.processors.base import ExtractedDocument
from app.processors.pdf_processor import IMAGE_REF

logger = get_logger(__name__)

_MIN_SIDE_PX = 64  # icons, bullets and rules are not figures
_UNDESCRIBED = "Figura sin describir."
_DESCRIBE_SYSTEM = (
    "Describes figuras de material de estudio para un estudiante. En español y en 2 a 5 frases: "
    "qué muestra la figura (diagrama, gráfico, tabla, fórmula, foto), sus elementos y relaciones, "
    "y el texto, números o fórmulas que contenga (fórmulas en LaTeX entre $...$). "
    "Solo describe lo que se ve; no inventes. Responde solo con la descripción."
)


def assets_dir(document_id: int) -> Path:
    return Path(get_settings().UPLOAD_DIR) / "assets" / str(document_id)


def remove_document_assets(db: Session, document_id: int) -> None:
    """Rows and files; callers own the commit."""
    db.execute(delete(DocumentAsset).where(DocumentAsset.document_id == document_id))
    shutil.rmtree(assets_dir(document_id), ignore_errors=True)


def find_asset(db: Session, asset_id: int) -> tuple[int, Path]:
    """The owning document ID and file of a figure; the caller checks document ownership."""
    asset = db.get(DocumentAsset, asset_id)
    if asset is None:
        raise NotFoundError("Figura no encontrada.")
    path = Path(asset.storage_path).resolve()
    if not path.is_relative_to(assets_dir(asset.document_id).resolve()) or not path.is_file():
        raise NotFoundError("Figura no encontrada.")
    return asset.document_id, path


class FigureDescriber:
    """The pipeline's Describe step for one document."""

    def __init__(self, db: Session, document_id: int, llm: LLMProvider | None) -> None:
        self._db = db
        self._document_id = document_id
        self._llm = llm if llm is not None and llm.supports_images else None

    def __call__(self, extracted: ExtractedDocument) -> str:
        limit = get_settings().PDF_MAX_IMAGES
        kept: dict[str, tuple[str, tuple[int, int]]] = {}  # digest -> (path, size)
        duplicates: dict[str, str] = {}  # dropped path -> digest of the kept copy
        for path in dict.fromkeys(extracted.image_paths):
            size = _image_size(path)
            digest = _sha256(path) if size else None
            if digest in kept:
                duplicates[path] = digest
                _remove(path)
            elif size is None or min(size) < _MIN_SIDE_PX or len(kept) >= limit:
                _remove(path)
            else:
                kept[digest] = (path, size)

        # Describe before writing: a CLI call can take minutes and SQLite has one writer.
        descriptions = {digest: self._describe(path) for digest, (path, _) in kept.items()}
        if self._llm is not None:
            self._llm.drain_usage()  # shortcut: ingestion calls are not in llm_usage yet; add a recorder kind when needed

        # A scanned PDF has nothing but figures: with none described there is no text to index.
        if not IMAGE_REF.sub("", extracted.text).strip() and not any(descriptions.values()):
            for path, _ in kept.values():
                _remove(path)
            return ""

        # Re-indexing starts clean. Rows only: the folder already holds the images just extracted.
        self._db.execute(delete(DocumentAsset).where(DocumentAsset.document_id == self._document_id))
        markers: dict[str, str] = {}
        for digest, (path, size) in kept.items():
            asset = DocumentAsset(
                document_id=self._document_id, storage_path=path, sha256=digest,
                width=size[0], height=size[1], description=descriptions[digest],
            )
            self._db.add(asset)
            self._db.flush()
            markers[digest] = f"\n\n[figura:{asset.id}] {asset.description or _UNDESCRIBED}\n\n"
        self._db.commit()
        replacements = {path: markers[digest] for digest, (path, _) in kept.items()}
        replacements.update({path: markers[digest] for path, digest in duplicates.items()})
        return IMAGE_REF.sub(lambda match: replacements.get(match.group(1), ""), extracted.text)

    def _describe(self, path: str) -> str:
        if self._llm is None:
            return ""
        try:
            text = self._llm.complete(
                kind="image_description",
                system=_DESCRIBE_SYSTEM,
                prompt="Describe la figura adjunta.",
                context={"image_paths": [path]},
                max_tokens=OUTPUT_BUDGETS["image_description"],
            )
        except Exception as exc:  # noqa: BLE001 - a description failure never fails the document
            # One failure (model without vision, quota, CLI not runnable) means the rest would fail too.
            code = exc.code if isinstance(exc, LLMError) else type(exc).__name__
            logger.warning("Figure description stopped for document %s: %s", self._document_id, code)
            self._llm = None
            return ""
        return " ".join(text.split())[:1000]


def _image_size(path: str) -> tuple[int, int] | None:
    try:
        import pymupdf

        pixmap = pymupdf.Pixmap(path)
        return pixmap.width, pixmap.height
    except Exception:  # noqa: BLE001 - unreadable or missing image: skip it
        return None


def _sha256(path: str) -> str:
    with open(path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def _remove(path: str) -> None:
    try:
        os.remove(path)
    except OSError:
        pass
