"""FastAPI application factory and entrypoint.

Run locally with:  ``uvicorn main:app --reload``  (from the ``backend`` dir).
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.exceptions import (
    ConflictError,
    LLMError,
    NotFoundError,
    StudyAIError,
    UnsupportedFileTypeError,
    ValidationError,
)
from app.core.logging import configure_logging, get_logger
from app.db.init_db import init_db
from app.services.progress_service import register_handlers

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    init_db()
    register_handlers()  # wire SM-2 updates to the session.completed event
    logger.info("StudyAI backend ready.")
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="StudyAI API",
        version="0.1.0",
        description="AI study-planning backend (MVP).",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    _register_exception_handlers(app)

    @app.get("/health", tags=["system"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    # Endpoints are mounted at the root to match docs/api_contract.yaml
    # (e.g. POST /documents/upload).
    app.include_router(api_router)
    return app


def _register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(NotFoundError)
    async def _not_found(_: Request, exc: NotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(ValidationError)
    async def _validation(_: Request, exc: ValidationError) -> JSONResponse:
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(ConflictError)
    async def _conflict(_: Request, exc: ConflictError) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc), "code": exc.code})

    @app.exception_handler(UnsupportedFileTypeError)
    async def _unsupported(_: Request, exc: UnsupportedFileTypeError) -> JSONResponse:
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(LLMError)
    async def _llm(_: Request, exc: LLMError) -> JSONResponse:
        return JSONResponse(status_code=502, content={"detail": str(exc)})

    @app.exception_handler(StudyAIError)
    async def _generic(_: Request, exc: StudyAIError) -> JSONResponse:
        logger.exception("Unhandled domain error")
        return JSONResponse(status_code=500, content={"detail": str(exc)})


app = create_app()
