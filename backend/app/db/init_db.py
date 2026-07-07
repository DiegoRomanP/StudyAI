"""Database bootstrap.

For the MVP we create tables directly from the ORM metadata so the app runs with
zero migration steps. Alembic is still configured (see ``alembic.ini``) for when
the schema stabilises and you want versioned migrations.
"""

from __future__ import annotations

from app.api.deps import DEFAULT_USER_EMAIL, DEFAULT_USER_ID
from app.core.logging import get_logger
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.user import User

logger = get_logger(__name__)


def init_db() -> None:
    """Create all tables and seed the default (demo) user."""
    Base.metadata.create_all(bind=engine)
    _seed_default_user()


def _seed_default_user() -> None:
    db = SessionLocal()
    try:
        if db.get(User, DEFAULT_USER_ID) is None:
            db.add(User(id=DEFAULT_USER_ID, email=DEFAULT_USER_EMAIL))
            db.commit()
            logger.info("Seeded default user id=%s", DEFAULT_USER_ID)
    finally:
        db.close()
