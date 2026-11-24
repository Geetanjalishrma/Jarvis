"""
database.py — SQLite connection + tiny auto-migration

- The database path is absolute (next to this file), so the backend finds the SAME jarvis.db
  no matter which folder you start uvicorn from.
- NEW: ensure_columns() adds any column that exists in models.py but is missing from an
  existing jarvis.db. So you can keep your old database when the app gets new features —
  no manual migration, and no data loss.
"""
import os
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from models import Base

BASE_DIR     = Path(__file__).resolve().parent
DATABASE_URL = os.getenv("DATABASE_URL", "")
if not DATABASE_URL or DATABASE_URL.startswith("sqlite:///./"):
    DATABASE_URL = f"sqlite:///{(BASE_DIR / 'jarvis.db').as_posix()}"
if DATABASE_URL.startswith("postgres://"):               # some hosts hand out the old URL style
    DATABASE_URL = "postgresql://" + DATABASE_URL[len("postgres://"):]

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
    pool_pre_ping=True,                                   # reconnect if a hosted DB dropped an idle connection
)
SessionLocal = sessionmaker(bind=engine)


def _sql_type(col) -> str:
    name = col.type.__class__.__name__.upper()
    if "INT" in name:                      return "INTEGER"
    if name in ("FLOAT", "NUMERIC", "REAL", "DOUBLE"): return "FLOAT"
    if "BOOL" in name:                     return "BOOLEAN"
    if name == "DATE":                     return "DATE"
    if "DATETIME" in name or "TIMESTAMP" in name: return "TIMESTAMP"   # works on SQLite and PostgreSQL
    return "TEXT"


def ensure_columns() -> None:
    """Add columns that are in models.py but missing from the existing database."""
    insp = inspect(engine)
    existing_tables = set(insp.get_table_names())
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue                                   # create_all() makes new tables
            have = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name not in have:
                    conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {_sql_type(col)}'))


# 1) create any missing tables, 2) add any missing columns to old tables
Base.metadata.create_all(bind=engine)
try:
    ensure_columns()
except Exception as e:                                     # never stop the server for a migration hiccup
    print(f"[database] column check skipped: {e}")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
