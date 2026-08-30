"""Slot ranking: given everything that competes for our audience, when should we meet?

The model is deliberately simple and explainable, because the output is used to
argue for a time slot with humans:

1.  Every competing thing becomes a weighted :class:`BusyInterval`. The weight
    estimates how many people in our target audience it occupies.
2.  Candidate slots are laid out across the window on a fixed grid.
3.  Each slot is scored against the intervals it overlaps.

Two numbers come out of scoring, and they answer different questions:

``blocked``
    Sum of weights of every source overlapping the slot at all. "How many
    people have *something* in the way?" Use it to reject a slot outright.
``lost_attendance``
    Same sum, but each source is prorated by how much of the slot it eats. A
    class covering the first third of the event costs a third of its roster,
    modelling people who arrive late rather than not at all. This is the
    ranking key because it separates slots that ``blocked`` ties.

Both over-count when one person is busy for two reasons at once. That is
acceptable: we only ever compare slots against each other, and the bias is
roughly uniform across them.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from app.core.models import ClubEvent, Course, Weekday


@dataclass(frozen=True)
class BusyInterval:
    """A concrete span of time during which ``weight`` people are unavailable."""

    start: datetime
    end: datetime
    weight: float
    label: str
    kind: str  # "course" | "event"

    def overlap_with(self, start: datetime, end: datetime) -> timedelta:
        """Length of the intersection with ``[start, end)``; zero if disjoint."""
        latest_start = max(self.start, start)
        earliest_end = min(self.end, end)
        return max(earliest_end - latest_start, timedelta(0))


@dataclass
class Conflict:
    """One busy source's contribution to a slot's score."""

    label: str
    kind: str
    weight: float
    overlap_minutes: float
    overlap_fraction: float


@dataclass
class ScoredSlot:
    start: datetime
    end: datetime
    blocked: float = 0.0
    lost_attendance: float = 0.0
    conflicts: list[Conflict] = field(default_factory=list)

    @property
    def is_clear(self) -> bool:
        return not self.conflicts


@dataclass(frozen=True)
class SlotConstraints:
    """The bounds a candidate slot must satisfy before it is even scored."""

    duration: timedelta = timedelta(hours=1)
    earliest: time = time(8, 0)
    latest: time = time(22, 0)
    weekdays: frozenset[Weekday] = frozenset(Weekday)
    step: timedelta = timedelta(minutes=30)


def expand_course(
    course: Course,
    window_start: date,
    window_end: date,
    term_start: date | None = None,
    term_end: date | None = None,
) -> list[BusyInterval]:
    """Project a course's weekly meeting pattern onto concrete dates.

    The window is clipped to the term, so a course does not generate busy time
    during reading period or before the term begins.
    """
    lo = max(window_start, term_start) if term_start else window_start
    hi = min(window_end, term_end) if term_end else window_end

    intervals: list[BusyInterval] = []
    for meeting in course.meetings:
        day = lo
        while day <= hi:
            if day.weekday() == meeting.weekday:
                intervals.append(
                    BusyInterval(
                        start=datetime.combine(day, meeting.start_time),
                        end=datetime.combine(day, meeting.end_time),
                        weight=course.weight,
                        label=course.code,
                        kind="course",
                    )
                )
            day += timedelta(days=1)
    return intervals


def event_to_interval(event: ClubEvent) -> BusyInterval:
    return BusyInterval(
        start=event.starts_at,
        end=event.ends_at,
        weight=event.weight,
        label=event.title,
        kind="event",
    )


def candidate_slots(
    window_start: datetime,
    window_end: datetime,
    constraints: SlotConstraints,
) -> list[tuple[datetime, datetime]]:
    """Every slot on the grid that fits inside the window and the constraints."""
    slots: list[tuple[datetime, datetime]] = []
    cursor = window_start
    while cursor + constraints.duration <= window_end:
        end = cursor + constraints.duration
        in_days = Weekday(cursor.weekday()) in constraints.weekdays
        # An event may not start before ``earliest`` nor run past ``latest``,
        # and must not straddle midnight into a day we did not vet.
        within_hours = (
            cursor.time() >= constraints.earliest
            and end.date() == cursor.date()
            and end.time() <= constraints.latest
        )
        if in_days and within_hours:
            slots.append((cursor, end))
        cursor += constraints.step
    return slots


def score_slot(start: datetime, end: datetime, busy: list[BusyInterval]) -> ScoredSlot:
    slot = ScoredSlot(start=start, end=end)
    span_minutes = (end - start).total_seconds() / 60
    for interval in busy:
        overlap = interval.overlap_with(start, end)
        if overlap <= timedelta(0):
            continue
        overlap_minutes = overlap.total_seconds() / 60
        fraction = overlap_minutes / span_minutes if span_minutes else 0.0
        slot.blocked += interval.weight
        slot.lost_attendance += interval.weight * fraction
        slot.conflicts.append(
            Conflict(
                label=interval.label,
                kind=interval.kind,
                weight=interval.weight,
                overlap_minutes=overlap_minutes,
                overlap_fraction=fraction,
            )
        )
    slot.conflicts.sort(key=lambda c: c.weight * c.overlap_fraction, reverse=True)
    return slot


def rank_slots(
    busy: list[BusyInterval],
    window_start: datetime,
    window_end: datetime,
    constraints: SlotConstraints | None = None,
    limit: int | None = None,
) -> list[ScoredSlot]:
    """Score every candidate slot and return the least-conflicted ones first.

    Ties on ``lost_attendance`` break toward the earlier slot, which keeps the
    output stable and favours times people are already on campus.
    """
    constraints = constraints or SlotConstraints()
    scored = [
        score_slot(start, end, busy)
        for start, end in candidate_slots(window_start, window_end, constraints)
    ]
    scored.sort(key=lambda s: (s.lost_attendance, s.blocked, s.start))
    return scored[:limit] if limit else scored
