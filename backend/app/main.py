"""FastAPI application entry point.

Run with ``uvicorn app.main:app --reload --port 8000``.
"""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import guarded, router
from app.db import create_db_and_tables


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    # Seeding on boot rather than as a deploy step, because it is idempotent and
    # a hosted database starts empty. Without it the first deploy comes up with
    # no courses and no exams and looks broken.
    if os.environ.get("SCHEDULER_SEED_ON_START", "").lower() == "true":
        from sqlmodel import Session

        from app.db import engine
        from app.seed import seed

        with Session(engine) as session:
            seed(session)
    yield


app = FastAPI(
    title="Scheduler",
    description="Conflict-aware event scheduling for student org programming.",
    version="0.1.0",
    lifespan=lifespan,
)

# The Vite dev server runs on a different origin during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(guarded)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# ------------------------------------------------------------------ static ---
#
# In production one process serves the API and the built frontend, so there is
# one origin, one URL to remember, and no CORS. Locally this directory does not
# exist and Vite serves the frontend itself, so the whole block is skipped.
#
# Declared after every real route, because the catch-all below matches anything
# - it shadowed /health when it was registered first.

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str) -> FileResponse:
        """Serve the built page for anything not claimed by a route above.

        Registered last so it cannot shadow the API. A file is returned when one
        exists - the favicon, the snapshot - and index.html otherwise, which is
        what makes a refresh on any URL work.
        """
        candidate = FRONTEND_DIST / path
        if path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
