"""Load the checked-in registrar tables and target-course list into the database.

Run with ``python -m app.seed``. It is idempotent: exams are keyed by
(course, start, end) and re-running replaces the set for each course rather
than appending duplicates, so re-seeding after the registrar publishes an
update is safe.

Only exams for courses in ``target_courses.json`` are loaded. The registrar
tables contain every course in the subject, but a 500-level midterm does not
compete for underclassmen, and including it would drown the signal.
"""

import json
from datetime import date
from pathlib import Path

from sqlmodel import Session, select

from app.core.models import AcademicDate, Course, Exam, Package, Term
from app.core.registrar import parse_exam_table
from app.db import create_db_and_tables, engine

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

# The academic calendar for the seeded term. Used to clip weekly course
# meetings so they do not generate busy time outside the semester.
TERM_BOUNDS = {("Fall", 2026): (date(2026, 8, 24), date(2026, 12, 12))}


def load_target_courses() -> dict:
    return json.loads((DATA_DIR / "target_courses.json").read_text())


def seed(session: Session) -> dict[str, int]:
    config = load_target_courses()
    season, year = config["term"]["season"], config["term"]["year"]
    start, end = TERM_BOUNDS[(season, year)]

    term = session.exec(select(Term).where(Term.name == f"{season} {year}")).first()
    if term is None:
        term = Term(name=f"{season} {year}", start_date=start, end_date=end)
        session.add(term)
        session.commit()
        session.refresh(term)

    courses: dict[str, Course] = {}
    for spec in config["courses"]:
        course = session.exec(select(Course).where(Course.code == spec["code"])).first()
        if course is None:
            course = Course(code=spec["code"], term_id=term.id)
            session.add(course)
        course.title = spec.get("title", "")
        course.short = spec.get("short", spec["code"])
        # Never overwrite a real enrollment someone entered with a null from the
        # seed file; the seed only ever fills in what is still unknown.
        if spec.get("enrollment") is not None:
            course.enrollment = spec["enrollment"]
        courses[spec["code"]] = course
    session.commit()

    parsed = [
        exam
        for path in sorted(DATA_DIR.glob("exams_*.txt"))
        for exam in parse_exam_table(path.read_text())
    ]
    relevant = [e for e in parsed if e.course_code in courses]

    # Replace rather than append, so a re-seed after a registrar update does not
    # leave stale sittings behind.
    touched = {e.course_code for e in relevant}
    for code in touched:
        for stale in session.exec(select(Exam).where(Exam.course_id == courses[code].id)).all():
            session.delete(stale)
    session.commit()

    for exam in relevant:
        session.add(
            Exam(
                course_id=courses[exam.course_code].id,
                kind=exam.kind,
                starts_at=exam.starts_at,
                ends_at=exam.ends_at,
                rooms=", ".join(exam.rooms),
            )
        )
    session.commit()

    _seed_packages(session, config, courses)
    academic = _seed_academic_dates(session)

    return {
        "courses": len(courses),
        "exams_parsed": len(parsed),
        "exams_loaded": len(relevant),
        "academic_dates": academic,
        "courses_without_enrollment": sum(1 for c in courses.values() if c.enrollment is None),
    }


def _seed_packages(session: Session, config: dict, courses: dict[str, Course]) -> None:
    """Create the packages declared in the config, without clobbering edits.

    Membership is only filled in when a package is first created. Someone who
    removes a course from a package in the UI means it, and a re-seed that put
    it back would look like the app undoing their work.
    """
    for spec in config.get("packages", []):
        existing = session.exec(select(Package).where(Package.name == spec["name"])).first()
        if existing is not None:
            continue
        package = Package(name=spec["name"], description=spec.get("description", ""))
        package.courses = [courses[code] for code in spec["courses"] if code in courses]
        session.add(package)
    session.commit()


def _seed_academic_dates(session: Session) -> int:
    """Load the published academic calendar - breaks, closures, milestones.

    Rows are keyed by (label, start) and updated in place, so re-seeding after
    the registrar revises a date corrects the existing row instead of leaving a
    stale duplicate that would keep blocking a day the university reopened.
    Hand-entered rows (any other ``source``) are never touched.
    """
    path = DATA_DIR / "academic_calendar.json"
    if not path.exists():
        return 0

    entries = json.loads(path.read_text())["dates"]
    seeded = {(e["label"], date.fromisoformat(e["start"])) for e in entries}

    for stale in session.exec(select(AcademicDate).where(AcademicDate.source == "registrar")).all():
        if (stale.label, stale.start_date) not in seeded:
            session.delete(stale)

    for entry in entries:
        start = date.fromisoformat(entry["start"])
        row = session.exec(
            select(AcademicDate).where(
                AcademicDate.label == entry["label"], AcademicDate.start_date == start
            )
        ).first()
        if row is None:
            row = AcademicDate(label=entry["label"], start_date=start)
            session.add(row)
        row.end_date = date.fromisoformat(entry["end"])
        row.blocks_events = entry.get("blocks_events", True)
        row.note = entry.get("note", "")
        row.source = "registrar"
    session.commit()
    return len(entries)


def main() -> None:
    create_db_and_tables()
    with Session(engine) as session:
        stats = seed(session)
    for key, value in stats.items():
        print(f"{key:32} {value}")
    if stats["courses_without_enrollment"]:
        print(
            f"\nNOTE: {stats['courses_without_enrollment']} target courses have no enrollment "
            "figure, so they rank with a flat placeholder weight. Fill them into "
            "data/target_courses.json for a sharper ranking."
        )


if __name__ == "__main__":
    main()
