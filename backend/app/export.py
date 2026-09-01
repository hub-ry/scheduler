"""Freeze the database into a single JSON file.

Run with ``python -m app.export`` (or ``./snapshot`` from the repo root).

Two jobs, and the second one is the reason this exists now rather than later:

1. **A backup.** ``scheduler.db`` is gitignored and regenerated, so the
   enrollment figures someone types into the Courses tab are the one piece of
   hand-entered data in the project with nowhere to live. A committed snapshot
   gives them a home.

2. **The seam to a static site.** The frontend already reaches the backend
   through exactly one object - ``api`` in ``src/api.ts``, with no stray
   ``fetch`` calls anywhere else. Swapping that object's implementation to read
   this file instead of ``/api`` is what turns the app into a deployable static
   page, once the ranker is ported to run in the browser. Producing the file the
   static build would need is the cheap half of that, so it is done up front.

The shapes here deliberately match ``app/api/schemas.py`` field for field. A
snapshot that did not look exactly like the API's responses would need a second
set of types on the frontend, which is the whole cost this is trying to avoid.
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel
from sqlmodel import Session, select

from app.api.routes import list_courses, list_events, list_exams
from app.db import engine

#: Where the frontend can pick it up. Vite serves ``public/`` at the site root,
#: so a static build ships this alongside index.html with no extra wiring.
DEFAULT_OUTPUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "snapshot.json"

#: Bumped when the shape changes, so a stale committed snapshot fails loudly on
#: load rather than rendering a half-empty calendar.
SCHEMA_VERSION = 1


def build_snapshot(session: Session) -> dict[str, Any]:
    """Collect everything the frontend reads, in the API's own response shapes.

    The route functions are reused rather than reimplemented. They already
    resolve a course's weight and fold the placeholder-enrollment rule into it,
    and duplicating that here is exactly how a snapshot silently drifts from what
    the live API would have said.
    """
    from app.core.models import Term

    terms = session.exec(select(Term).order_by(Term.start_date)).all()

    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "terms": [
            {
                "id": t.id,
                "name": t.name,
                "start_date": t.start_date.isoformat(),
                "end_date": t.end_date.isoformat(),
            }
            for t in terms
        ],
        "courses": [_dump(c) for c in list_courses(session)],
        "exams": [_dump(e) for e in list_exams(session)],
        "events": [_dump(e) for e in list_events(session)],
    }


def _dump(model: BaseModel) -> dict[str, Any]:
    """Serialise one response model the way FastAPI would over the wire."""
    return json.loads(model.model_dump_json())


def write_snapshot(output: Path = DEFAULT_OUTPUT) -> dict[str, Any]:
    with Session(engine) as session:
        snapshot = build_snapshot(session)

    output.parent.mkdir(parents=True, exist_ok=True)
    # A trailing newline and sorted-free key order keep the committed file's
    # diffs readable: only rows that actually changed show up in git.
    output.write_text(json.dumps(snapshot, indent=2) + "\n")
    return snapshot


def main() -> None:
    snapshot = write_snapshot()
    cwd = Path.cwd()
    where = (
        DEFAULT_OUTPUT.relative_to(cwd) if DEFAULT_OUTPUT.is_relative_to(cwd) else DEFAULT_OUTPUT
    )
    print(
        f"Wrote {where}: "
        f"{len(snapshot['courses'])} courses, "
        f"{len(snapshot['exams'])} exams, "
        f"{len(snapshot['events'])} events."
    )


if __name__ == "__main__":
    main()
