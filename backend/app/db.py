"""SQLite engine and session wiring.

SQLite is the right default here: the dataset is a few thousand rows of campus
schedule and it keeps the app to a single file with no service to run. The
engine URL is the only thing that has to change to move to Postgres later.
"""

import os
from collections.abc import Iterator
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "scheduler.db"
DATABASE_URL = os.environ.get("SCHEDULER_DATABASE_URL", f"sqlite:///{DEFAULT_DB_PATH}")

# check_same_thread=False because FastAPI serves requests from a thread pool and
# each one opens its own short-lived session.
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)


def create_db_and_tables() -> None:
    # Imported for the side effect of registering every table on SQLModel.metadata.
    from app.core import models  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
