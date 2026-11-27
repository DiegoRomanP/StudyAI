"""Schema ownership: create_all in self_hosted, Alembic in saas (baseline must match the models)."""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

import app.db.init_db as init_db_module
from app.core.config import get_settings
from app.db.base import Base
from app.db.session import engine
from app.models.billing import Product

_ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"


def test_self_hosted_startup_creates_every_table(monkeypatch, tmp_path):
    fresh = create_engine(f"sqlite:///{tmp_path}/fresh.db")
    monkeypatch.setattr(init_db_module, "engine", fresh)
    monkeypatch.setattr(init_db_module, "SessionLocal", sessionmaker(bind=fresh))

    init_db_module.init_db()

    assert set(Base.metadata.tables) <= set(inspect(fresh).get_table_names())
    fresh.dispose()


def test_saas_startup_seeds_without_create_all(monkeypatch):
    Base.metadata.create_all(bind=engine)  # stands in for `alembic upgrade head`

    def _forbidden(*_args, **_kwargs):
        raise AssertionError("saas must not call create_all: the schema is Alembic's")

    monkeypatch.setattr(get_settings(), "DEPLOYMENT_MODE", "saas")
    monkeypatch.setattr(Base.metadata, "create_all", _forbidden)
    with init_db_module.SessionLocal() as db:
        db.query(Product).delete()
        db.commit()

    init_db_module.init_db()

    with init_db_module.SessionLocal() as db:
        assert db.query(Product).count() == len(init_db_module.SEED_PRODUCTS)


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="needs TEST_DATABASE_URL")
def test_upgrade_head_on_an_empty_database_matches_the_models(monkeypatch):
    server_url = make_url(get_settings().DATABASE_URL)
    scratch_url = server_url.set(database="studyai_alembic_check")
    admin = create_engine(server_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text("DROP DATABASE IF EXISTS studyai_alembic_check"))
        conn.execute(text("CREATE DATABASE studyai_alembic_check"))
    try:
        monkeypatch.setattr(
            get_settings(), "DATABASE_URL", scratch_url.render_as_string(hide_password=False)
        )
        command.upgrade(Config(str(_ALEMBIC_INI)), "head")

        scratch = create_engine(scratch_url)
        with scratch.connect() as conn:
            diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)
        scratch.dispose()
        assert diff == []
    finally:
        with admin.connect() as conn:
            conn.execute(text("DROP DATABASE IF EXISTS studyai_alembic_check WITH (FORCE)"))
        admin.dispose()
