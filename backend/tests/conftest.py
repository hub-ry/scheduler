"""Test fixtures.

Every test gets a fresh in-memory database seeded from the real registrar
tables in ``data/``, so the API tests exercise the same data the app ships with.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.db import get_session
from app.main import app
from app.seed import seed


@pytest.fixture
def session():
    # StaticPool keeps every connection pointed at the same in-memory database;
    # without it each connection would get its own empty one.
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture
def seeded(session):
    seed(session)
    return session


@pytest.fixture
def client(seeded):
    app.dependency_overrides[get_session] = lambda: seeded
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
