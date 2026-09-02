"""HTTP routes.

The interesting endpoint is ``POST /api/schedule/rank``. Everything else exists
to feed it: courses carry the weights, exams and events are the competition.
"""

import os
from dataclasses import replace
from datetime import datetime, time, timedelta
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from sqlmodel import Session, select

from app.api import schemas
from app.auth import (
    COOKIE_NAME,
    SESSION_SECONDS,
    configured_password,
    issue_token,
    password_matches,
    require_session,
    token_is_valid,
)
from app.core.models import AcademicDate, ClubEvent, Course, EventIdea, Exam, Package, Term
from app.core.registrar import parse_exam_table
from app.core.scheduling import (
    BusyInterval,
    SlotConstraints,
    candidate_slots,
    event_to_interval,
    expand_course,
    rank_slots,
)
from app.db import get_session

router = APIRouter(prefix="/api")

#: Everything except the session endpoints themselves sits behind the gate.
#: Applied to the router rather than route by route, so a new endpoint is
#: protected by default instead of protected only if someone remembers.
guarded = APIRouter(prefix="/api", dependencies=[Depends(require_session)])

#: Declared once rather than as a per-route default, so the dependency is a
#: module-level singleton instead of a call evaluated in an argument default.
SessionDep = Annotated[Session, Depends(get_session)]


def _exam_interval(exam: Exam, course: Course) -> BusyInterval:
    return BusyInterval(
        start=exam.starts_at,
        end=exam.ends_at,
        weight=course.weight,
        label=f"{course.code} {exam.kind}",
        kind="exam",
    )


def _academic_dates(session: Session, window_start: datetime, window_end: datetime):
    """Academic-calendar rows touching the window, earliest first."""
    return session.exec(
        select(AcademicDate)
        .where(
            AcademicDate.start_date <= window_end.date(),
            AcademicDate.end_date >= window_start.date(),
        )
        .order_by(AcademicDate.start_date)
    ).all()


def _academic_blocks(
    session: Session, window_start: datetime, window_end: datetime
) -> list[schemas.BusyOut]:
    """Calendar chips for breaks and milestones - one per day of a span.

    Emitted per day rather than as one interval per row because the month grid
    buckets blocks by their start day, so a four-day break drawn as a single
    block would appear only on the Wednesday.

    These are not :class:`BusyInterval`s: a closed day is not weighted
    competition for our audience, it is a day that cannot be used at all, and
    the ranking honours it by never offering those slots (see
    ``SlotConstraints.blackout_days``). Their weight is therefore zero.
    """
    blocks: list[schemas.BusyOut] = []
    for entry in _academic_dates(session, window_start, window_end):
        for day in entry.days():
            if not window_start.date() <= day <= window_end.date():
                continue
            blocks.append(
                schemas.BusyOut(
                    start=datetime.combine(day, time.min),
                    end=datetime.combine(day, time.max),
                    label=entry.label,
                    kind="closed" if entry.blocks_events else "academic",
                    weight=0.0,
                    detail=entry.note,
                )
            )
    return blocks


def _blackout_days(session: Session, window_start: datetime, window_end: datetime) -> frozenset:
    """Every date in the window on which we are not allowed to host."""
    return frozenset(
        day
        for entry in _academic_dates(session, window_start, window_end)
        if entry.blocks_events
        for day in entry.days()
    )


def _collect_busy(
    session: Session,
    window_start: datetime,
    window_end: datetime,
    course_ids: set[int] | None = None,
) -> tuple[list[BusyInterval], list[str]]:
    """Every weighted busy block in the window, plus the courses still guessing.

    The second return value is what lets the UI say "this ranking rests on
    placeholder numbers" instead of implying the figures are measured.

    ``course_ids`` narrows the audience to one package's courses. Competing club
    events are deliberately not filtered by it: a package says whose calendar we
    are reasoning about, and another org's callout competes for those people
    whatever they are enrolled in.
    """
    courses = {
        c.id: c
        for c in session.exec(select(Course)).all()
        if course_ids is None or c.id in course_ids
    }
    term = session.exec(select(Term)).first()

    intervals: list[BusyInterval] = []
    contributing: set[str] = set()

    exams = session.exec(
        select(Exam).where(Exam.starts_at < window_end, Exam.ends_at > window_start)
    ).all()
    for exam in exams:
        course = courses.get(exam.course_id)
        if course is None:
            continue
        intervals.append(_exam_interval(exam, course))
        if not course.has_measured_enrollment:
            contributing.add(course.code)

    # Weekly class meetings, clipped to the term.
    for course in courses.values():
        if not course.meetings:
            continue
        intervals.extend(
            expand_course(
                course,
                window_start.date(),
                window_end.date(),
                term_start=term.start_date if term else None,
                term_end=term.end_date if term else None,
            )
        )
        if not course.has_measured_enrollment:
            contributing.add(course.code)

    events = session.exec(
        select(ClubEvent).where(
            ClubEvent.starts_at < window_end,
            ClubEvent.ends_at > window_start,
        )
    ).all()
    for event in events:
        interval = event_to_interval(event)
        if event.is_ours:
            # Our own bookings used to be excluded outright, which meant an
            # event you had just booked did not appear on the calendar at all.
            # They belong on the grid, and they belong in the ranking too - the
            # thing a slot most obviously clashes with is another of our events.
            interval = replace(interval, kind="ours", label=f"BM: {event.title}")
        intervals.append(interval)

    return intervals, sorted(contributing)


@guarded.get("/courses", response_model=list[schemas.CourseOut])
def list_courses(session: SessionDep):
    courses = session.exec(select(Course).order_by(Course.code)).all()
    return [
        schemas.CourseOut(
            id=c.id,
            code=c.code,
            short=c.short,
            title=c.title,
            enrollment=c.enrollment,
            audience_fraction=c.audience_fraction,
            weight=c.weight,
            has_measured_enrollment=c.has_measured_enrollment,
            exam_count=len(c.exams),
        )
        for c in courses
    ]


@guarded.patch("/courses/{course_id}", response_model=schemas.CourseOut)
def update_course(course_id: int, payload: schemas.CourseUpdate, session: SessionDep):
    course = session.get(Course, course_id)
    if course is None:
        raise HTTPException(404, "course not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(course, field, value)
    session.add(course)
    session.commit()
    session.refresh(course)
    return schemas.CourseOut(
        id=course.id,
        code=course.code,
        short=course.short,
        title=course.title,
        enrollment=course.enrollment,
        audience_fraction=course.audience_fraction,
        weight=course.weight,
        has_measured_enrollment=course.has_measured_enrollment,
        exam_count=len(course.exams),
    )


def _package_out(package: Package) -> schemas.PackageOut:
    courses = sorted(package.courses, key=lambda c: c.code)
    return schemas.PackageOut(
        id=package.id,
        name=package.name,
        description=package.description,
        course_ids=[c.id for c in courses],
        course_codes=[c.code for c in courses],
    )


def _resolve_courses(session: Session, course_ids: list[int]) -> list[Course]:
    """Look up every id, refusing the whole request if one is unknown.

    Partial success would silently drop a course from someone's audience and
    quietly change their ranking, which is worse than a 404 they can act on.
    """
    courses = []
    for course_id in dict.fromkeys(course_ids):
        course = session.get(Course, course_id)
        if course is None:
            raise HTTPException(404, f"no course with id {course_id}")
        courses.append(course)
    return courses


@guarded.get("/packages", response_model=list[schemas.PackageOut])
def list_packages(session: SessionDep):
    packages = session.exec(select(Package).order_by(Package.name)).all()
    return [_package_out(p) for p in packages]


@guarded.post("/packages", response_model=schemas.PackageOut, status_code=201)
def create_package(payload: schemas.PackageIn, session: SessionDep):
    package = Package(name=payload.name, description=payload.description)
    package.courses = _resolve_courses(session, payload.course_ids)
    session.add(package)
    session.commit()
    session.refresh(package)
    return _package_out(package)


@guarded.patch("/packages/{package_id}", response_model=schemas.PackageOut)
def update_package(package_id: int, payload: schemas.PackageUpdate, session: SessionDep):
    package = session.get(Package, package_id)
    if package is None:
        raise HTTPException(404, "package not found")
    if payload.name is not None:
        package.name = payload.name
    if payload.description is not None:
        package.description = payload.description
    if payload.course_ids is not None:
        package.courses = _resolve_courses(session, payload.course_ids)
    session.add(package)
    session.commit()
    session.refresh(package)
    return _package_out(package)


@guarded.delete("/packages/{package_id}", status_code=204)
def delete_package(package_id: int, session: SessionDep):
    package = session.get(Package, package_id)
    if package is None:
        raise HTTPException(404, "package not found")
    # Only the grouping goes; the courses themselves belong to the term, not to
    # whoever happened to file them under one audience.
    session.delete(package)
    session.commit()


def _idea_out(idea: EventIdea, session: Session) -> schemas.IdeaOut:
    booking = session.get(ClubEvent, idea.event_id) if idea.event_id else None
    return schemas.IdeaOut(
        id=idea.id,
        title=idea.title,
        notes=idea.notes,
        position=idea.position,
        event_id=idea.event_id,
        scheduled_for=booking.starts_at if booking else None,
    )


@guarded.get("/ideas", response_model=list[schemas.IdeaOut])
def list_ideas(session: SessionDep):
    ideas = session.exec(select(EventIdea).order_by(EventIdea.position, EventIdea.id)).all()
    return [_idea_out(i, session) for i in ideas]


@guarded.post("/ideas", response_model=schemas.IdeaOut, status_code=201)
def create_idea(payload: schemas.IdeaIn, session: SessionDep):
    # New cards go to the bottom, where you were looking when you added one.
    last = session.exec(select(EventIdea).order_by(EventIdea.position.desc())).first()
    idea = EventIdea(
        title=payload.title,
        notes=payload.notes,
        position=(last.position + 1) if last else 0,
    )
    session.add(idea)
    session.commit()
    session.refresh(idea)
    return _idea_out(idea, session)


@guarded.patch("/ideas/{idea_id}", response_model=schemas.IdeaOut)
def update_idea(idea_id: int, payload: schemas.IdeaUpdate, session: SessionDep):
    idea = session.get(EventIdea, idea_id)
    if idea is None:
        raise HTTPException(404, "idea not found")
    fields = payload.model_dump(exclude_unset=True)
    if "event_id" in fields and fields["event_id"] is not None:
        if session.get(ClubEvent, fields["event_id"]) is None:
            raise HTTPException(404, "no such event to link")
    for field, value in fields.items():
        setattr(idea, field, value)
    session.add(idea)
    session.commit()
    session.refresh(idea)
    return _idea_out(idea, session)


@guarded.delete("/ideas/{idea_id}", status_code=204)
def delete_idea(idea_id: int, session: SessionDep):
    idea = session.get(EventIdea, idea_id)
    if idea is None:
        raise HTTPException(404, "idea not found")
    # Only the card goes. A booking it was linked to is a real event on a real
    # calendar, and deleting a brainstorm note should not cancel it.
    session.delete(idea)
    session.commit()


@guarded.post("/ideas/reorder", response_model=list[schemas.IdeaOut])
def reorder_ideas(payload: schemas.ReorderRequest, session: SessionDep):
    """Rewrite every position from one ordered list of ids.

    Takes the whole order rather than a moved-from/moved-to pair, because the
    board already knows the arrangement it is showing and sending it wholesale
    cannot leave the server's idea of the order disagreeing with the screen.
    """
    ideas = {i.id: i for i in session.exec(select(EventIdea)).all()}
    if set(payload.ids) != set(ideas):
        raise HTTPException(400, "reorder must list every idea exactly once")
    for position, idea_id in enumerate(payload.ids):
        ideas[idea_id].position = position
        session.add(ideas[idea_id])
    session.commit()
    return [_idea_out(ideas[i], session) for i in payload.ids]


@guarded.get("/exams", response_model=list[schemas.ExamOut])
def list_exams(session: SessionDep):
    exams = session.exec(select(Exam).order_by(Exam.starts_at)).all()
    courses = {c.id: c for c in session.exec(select(Course)).all()}
    return [
        schemas.ExamOut(
            id=e.id,
            course_code=courses[e.course_id].code,
            course_title=courses[e.course_id].title,
            kind=e.kind,
            starts_at=e.starts_at,
            ends_at=e.ends_at,
            rooms=e.rooms,
            weight=courses[e.course_id].weight,
        )
        for e in exams
        if e.course_id in courses
    ]


@guarded.get("/events", response_model=list[schemas.EventOut])
def list_events(session: SessionDep):
    events = session.exec(select(ClubEvent).order_by(ClubEvent.starts_at)).all()
    return [schemas.EventOut(**e.model_dump(), weight=e.weight) for e in events]


@guarded.post("/events", response_model=schemas.EventOut, status_code=201)
def create_event(payload: schemas.EventIn, session: SessionDep):
    event = ClubEvent(**payload.model_dump())
    session.add(event)
    session.commit()
    session.refresh(event)
    return schemas.EventOut(**event.model_dump(), weight=event.weight)


@guarded.delete("/events/{event_id}", status_code=204)
def delete_event(event_id: int, session: SessionDep):
    event = session.get(ClubEvent, event_id)
    if event is None:
        raise HTTPException(404, "event not found")
    session.delete(event)
    session.commit()


@guarded.get("/busy", response_model=list[schemas.BusyOut])
def list_busy(start: datetime, end: datetime, session: SessionDep):
    """Everything competing for attention in a window - the calendar grid's data."""
    if end <= start:
        raise HTTPException(422, "end must be after start")
    intervals, _ = _collect_busy(session, start, end)
    blocks = [
        schemas.BusyOut(start=i.start, end=i.end, label=i.label, kind=i.kind, weight=i.weight)
        for i in intervals
    ] + _academic_blocks(session, start, end)
    return sorted(blocks, key=lambda b: (b.start, b.kind != "closed"))


@guarded.get("/academic-dates", response_model=list[schemas.AcademicDateOut])
def list_academic_dates(session: SessionDep):
    """The academic calendar, so the UI can explain why a day is unavailable."""
    rows = session.exec(select(AcademicDate).order_by(AcademicDate.start_date)).all()
    return [
        schemas.AcademicDateOut(
            id=row.id,
            label=row.label,
            start_date=row.start_date,
            end_date=row.end_date,
            blocks_events=row.blocks_events,
            note=row.note,
        )
        for row in rows
    ]


@guarded.post("/schedule/rank", response_model=schemas.RankResponse)
def rank(payload: schemas.RankRequest, session: SessionDep):
    window_start = datetime.combine(payload.window_start, time.min)
    window_end = datetime.combine(payload.window_end, time.max)

    intervals, missing = _collect_busy(
        session,
        window_start,
        window_end,
        set(payload.course_ids) if payload.course_ids is not None else None,
    )
    constraints = SlotConstraints(
        duration=timedelta(minutes=payload.duration_minutes),
        earliest=payload.earliest,
        latest=payload.latest,
        weekdays=frozenset(payload.weekdays),
        step=timedelta(minutes=payload.step_minutes),
        blackout_days=_blackout_days(session, window_start, window_end),
    )
    considered = len(candidate_slots(window_start, window_end, constraints))
    ranked = rank_slots(intervals, window_start, window_end, constraints, limit=payload.limit)

    return schemas.RankResponse(
        slots=[
            schemas.SlotOut(
                start=s.start,
                end=s.end,
                blocked=s.blocked,
                lost_attendance=round(s.lost_attendance, 1),
                is_clear=s.is_clear,
                conflicts=[
                    schemas.ConflictOut(
                        label=c.label,
                        kind=c.kind,
                        weight=c.weight,
                        overlap_minutes=c.overlap_minutes,
                        overlap_fraction=round(c.overlap_fraction, 3),
                    )
                    for c in s.conflicts
                ],
            )
            for s in ranked
        ],
        considered=considered,
        uses_placeholder_weights=bool(missing),
        courses_missing_enrollment=missing,
    )


@guarded.post("/import/exams", response_model=schemas.ImportResponse)
def import_exams(payload: schemas.ImportRequest, session: SessionDep):
    """Paste a registrar table and load the sittings for tracked courses."""
    try:
        parsed = parse_exam_table(payload.text, payload.term_season, payload.term_year)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

    courses = {c.code: c for c in session.exec(select(Course)).all()}
    imported = 0
    skipped: set[str] = set()
    unknown: set[str] = set()

    for exam in parsed:
        course = courses.get(exam.course_code)
        if course is None:
            if payload.include_non_target:
                unknown.add(exam.course_code)
            else:
                skipped.add(exam.course_code)
            continue
        # Idempotent: the same sitting pasted twice does not duplicate.
        existing = session.exec(
            select(Exam).where(
                Exam.course_id == course.id,
                Exam.starts_at == exam.starts_at,
                Exam.ends_at == exam.ends_at,
            )
        ).first()
        if existing:
            existing.rooms = ", ".join(exam.rooms)
            session.add(existing)
            continue
        session.add(
            Exam(
                course_id=course.id,
                kind=exam.kind,
                starts_at=exam.starts_at,
                ends_at=exam.ends_at,
                rooms=", ".join(exam.rooms),
            )
        )
        imported += 1
    session.commit()

    return schemas.ImportResponse(
        parsed=len(parsed),
        imported=imported,
        skipped_non_target=sorted(skipped),
        unknown_courses=sorted(unknown),
    )


# ---------------------------------------------------------------- session ---
#
# On the open router, because a gate you have to be through in order to knock
# is not a gate.


@router.get("/session", response_model=schemas.SessionOut)
def read_session(scheduler_session: str | None = Cookie(default=None)):
    """Whether a password is needed here, and whether this browser has given it.

    The frontend asks this before rendering anything, so a deployment with no
    password configured never shows a sign-in screen at all.
    """
    required = configured_password() is not None
    return schemas.SessionOut(
        required=required,
        authenticated=(not required) or token_is_valid(scheduler_session),
    )


@router.post("/session", response_model=schemas.SessionOut)
def sign_in(payload: schemas.SignIn, response: Response):
    if not password_matches(payload.password):
        raise HTTPException(401, "wrong password")
    response.set_cookie(
        COOKIE_NAME,
        issue_token(),
        max_age=SESSION_SECONDS,
        httponly=True,
        samesite="lax",
        # Set over https in production; left off locally, where the dev server
        # is plain http and a secure cookie would simply never be stored.
        secure=os.environ.get("SCHEDULER_SECURE_COOKIE", "").lower() == "true",
    )
    return schemas.SessionOut(required=True, authenticated=True)


@router.delete("/session", status_code=204)
def sign_out(response: Response):
    response.delete_cookie(COOKIE_NAME)
