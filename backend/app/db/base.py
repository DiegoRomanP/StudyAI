"""Declarative base and model registry.

Importing this module imports every ORM model so that
``Base.metadata`` is fully populated — this is what Alembic autogenerate and the
startup ``create_all`` rely on. Keep the model imports at the bottom to avoid
circular-import issues.
"""

from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared declarative base for all StudyAI models."""


# NOTE: imported for their side effect of registering tables on Base.metadata.
# The `noqa` keeps linters from removing these "unused" imports.
from app.models import (  # noqa: E402,F401  (side-effect imports)
    document,
    flashcard,
    goal,
    plan,
    quiz,
    session,
    user,
)
