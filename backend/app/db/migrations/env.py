"""Alembic migration environment.

Wires Alembic to the app's declarative ``Base`` (so autogenerate sees every
model) and to the ``DATABASE_URL`` from Settings.
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import get_settings
from app.db.base import Base  # imports all models as a side effect

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)  # keep the app loggers alive when run in-process

# "%%": configparser would read a URL-encoded password ("%40") as interpolation.
config.set_main_option("sqlalchemy.url", get_settings().DATABASE_URL.replace("%", "%%"))
target_metadata = Base.metadata

# Created at first use by _PgVectorStore (app/rag/vector_store.py), outside Base.metadata:
# without this, autogenerate would emit drop_table("document_chunks") and `alembic check` would fail.
_UNMANAGED_TABLES = {"document_chunks"}


def include_object(obj, name, type_, reflected, compare_to) -> bool:
    table = name if type_ == "table" else getattr(getattr(obj, "table", None), "name", None)
    return table not in _UNMANAGED_TABLES


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        include_object=include_object,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,  # SQLite-friendly ALTERs
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
