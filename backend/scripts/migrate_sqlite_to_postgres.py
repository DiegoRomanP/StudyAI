"""One-off copy of a local SQLite database (and its in-memory vectors) into an empty Postgres.

    DATABASE_URL=postgresql+psycopg://... VECTOR_BACKEND=pgvector \
        python scripts/migrate_sqlite_to_postgres.py studyai.db [storage/chroma/fallback.json]

Creates the schema with ``init_db``, refuses a target that already holds data, copies every table
in one transaction and checks the row counts before committing. ``llm_credentials`` is skipped on
purpose: the keys are encrypted with this machine's SECRET_KEY and BYOK is disabled in SaaS.
Uploaded files stay on disk (they move with the S3/R2 phase).
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, func, inspect, select  # noqa: E402
from sqlalchemy.dialects.postgresql import insert  # noqa: E402

from app.db.base import Base  # noqa: E402
from app.db.init_db import init_db, sync_id_sequences  # noqa: E402
from app.db.session import engine as target  # noqa: E402

SKIPPED = {"llm_credentials"}


def _count(conn, table) -> int:
    return conn.execute(select(func.count()).select_from(table)).scalar_one()


def migrate(sqlite_path: str, vectors_path: str | None) -> None:
    if target.dialect.name != "postgresql":
        sys.exit("DATABASE_URL must point to Postgres (postgresql+psycopg://...).")
    source = create_engine(f"sqlite:///file:{Path(sqlite_path).resolve()}?mode=ro&uri=true")  # read-only
    source_tables = set(inspect(source).get_table_names())

    init_db()  # schema + demo user 1 (copied over below)
    with target.connect() as conn:
        busy = {t.name: n for t in Base.metadata.sorted_tables if (n := _count(conn, t)) > (1 if t.name == "users" else 0)}
    if busy:
        sys.exit(f"The target database already has data, nothing copied: {busy}")

    copied: dict[str, int] = {}
    with source.connect() as src, target.begin() as dst:
        for table in Base.metadata.sorted_tables:  # parents before children
            if table.name in SKIPPED or table.name not in source_tables:
                continue
            columns = [c for c in table.c if c.name in {col["name"] for col in inspect(source).get_columns(table.name)}]
            rows = [dict(r._mapping) for r in src.execute(select(*columns))]
            if rows:
                dst.execute(insert(table).on_conflict_do_nothing(), rows)  # demo user 1 already exists
            copied[table.name] = len(rows)
        for name, expected in copied.items():
            got = _count(dst, Base.metadata.tables[name])
            if got != expected:
                raise RuntimeError(f"{name}: copied {expected} rows but the target has {got}; rolled back")
    sync_id_sequences()
    print("Copied:", copied)

    if vectors_path:
        from app.rag.vector_store import VectorStore, _PgVectorStore

        store = VectorStore()
        if not isinstance(store._fallback, _PgVectorStore):
            sys.exit("Rows copied, vectors NOT copied: run with VECTOR_BACKEND=pgvector.")
        by_document: dict[int, list[dict]] = defaultdict(list)
        for item in json.loads(Path(vectors_path).read_text(encoding="utf-8")):
            by_document[item["metadata"]["document_id"]].append(item)
        for document_id, items in by_document.items():
            items.sort(key=lambda i: i["metadata"]["chunk_index"])
            extra = {k: v for k, v in items[0]["metadata"].items() if k not in ("document_id", "chunk_index")}
            store.add(document_id, [i["text"] for i in items], [i["embedding"] for i in items], extra)
        print("Vectors:", {d: len(i) for d, i in by_document.items()})


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        sys.exit(__doc__)
    migrate(sys.argv[1], sys.argv[2] if len(sys.argv) == 3 else None)
