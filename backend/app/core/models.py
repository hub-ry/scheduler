"""Domain models.

The scheduling problem is "when is my target audience least busy?", so every
row here ultimately reduces to a weighted busy interval on a calendar.

Two kinds of busy sources exist and they differ in how they repeat:

- ``Course``   - recurs weekly for a whole term (MWF 10:00-10:50, etc.)
- ``ClubEvent`` - a one-off with a concrete date, e.g. a row scraped out of the
  weekly club email blast.

Both carry a ``weight``: the estimated number of people in our target audience
who are unavailable because of it. That is what makes slots comparable.
"""

# NOTE: deliberately no ``from __future__ import annotations`` here. SQLModel
# resolves Relationship() targets from the runtime annotations, and stringised
# annotations make it see a bare generic it cannot map.

from datetime import date, datetime, time
from enum import IntEnum

from sqlmodel import Field, Relationship, SQLModel

#: Stand-in weight for a course whose real enrollment nobody has entered yet.
#: Deliberately a round, obviously-synthetic number so it reads as a placeholder
#: in the UI rather than as a roster count.
UNKNOWN_ENROLLMENT_WEIGHT = 100.0


class Weekday(IntEnum):
    """Matches ``datetime.date.weekday()`` so the two can be compared directly."""

    MONDAY = 0
    TUESDAY = 1
    WEDNESDAY = 2
    THURSDAY = 3
    FRIDAY = 4
    SATURDAY = 5
    SUNDAY = 6


class Term(SQLModel, table=True):
    """A semester or quarter. Bounds how far a course's weekly pattern repeats."""

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    start_date: date
    end_date: date

    courses: list["Course"] = Relationship(back_populates="term")


class PackageCourse(SQLModel, table=True):
    """Membership of a course in a package. A plain many-to-many link table."""

    package_id: int = Field(foreign_key="package.id", primary_key=True)
    course_id: int = Field(foreign_key="course.id", primary_key=True)


class Course(SQLModel, table=True):
    """A class that competes for our audience's time.

    ``enrollment`` is the raw headcount; ``audience_fraction`` is how much of
    that roster is actually the underclassmen we care about. Their product is
    the weight, so a 300-person intro lecture outranks a 12-person seminar.

    ``enrollment`` is ``None`` until someone supplies a real roster size. We
    refuse to invent one, so an unknown course falls back to
    :data:`UNKNOWN_ENROLLMENT_WEIGHT` - enough to keep it in the ranking, but a
    flat value that cannot be mistaken for measured data.
    """

    id: int | None = Field(default=None, primary_key=True)
    code: str = Field(index=True)
    #: How the course is actually referred to out loud - "CS 251" for CS 25100.
    #: The registrar's five-digit code is the join key; this is the label.
    short: str = ""
    title: str = ""
    enrollment: int | None = None
    audience_fraction: float = 1.0
    term_id: int | None = Field(default=None, foreign_key="term.id")

    term: Term | None = Relationship(back_populates="courses")
    meetings: list["CourseMeeting"] = Relationship(
        back_populates="course",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    exams: list["Exam"] = Relationship(
        back_populates="course",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    packages: list["Package"] = Relationship(back_populates="courses", link_model=PackageCourse)

    @property
    def weight(self) -> float:
        if self.enrollment is None:
            return UNKNOWN_ENROLLMENT_WEIGHT * self.audience_fraction
        return self.enrollment * self.audience_fraction

    @property
    def has_measured_enrollment(self) -> bool:
        """Lets the UI flag rankings that rest on placeholder weights."""
        return self.enrollment is not None


class Package(SQLModel, table=True):
    """A named audience: the courses whose students you are recruiting.

    Different events chase different rooms. A CS club's callout competes with
    CS 251 and the calculus sequence; a stats reading group does not care about
    either. Ranking against every target course at once averages those audiences
    together and quietly mis-ranks both.

    A package is that choice, saved. Courses belong to as many packages as make
    sense - the calculus sequence is in nearly all of them - so this is a
    many-to-many rather than a column on Course.
    """

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    description: str = ""

    courses: list["Course"] = Relationship(back_populates="packages", link_model=PackageCourse)


class CourseMeeting(SQLModel, table=True):
    """One weekly recurring block of a course. A MWF class has three of these."""

    id: int | None = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="course.id", index=True)
    weekday: Weekday
    start_time: time
    end_time: time

    course: Course | None = Relationship(back_populates="meetings")


class ClubEvent(SQLModel, table=True):
    """A competing event at a concrete date and time.

    ``expected_attendance`` plays the same role ``enrollment`` does for courses.
    ``source`` records where the row came from ("manual", "email:2026-08-24")
    so a re-scrape can replace its own rows without touching hand-entered ones.
    """

    id: int | None = Field(default=None, primary_key=True)
    title: str
    organization: str = ""
    location: str = ""
    starts_at: datetime = Field(index=True)
    ends_at: datetime
    expected_attendance: int = 0
    audience_fraction: float = 1.0
    source: str = "manual"
    is_ours: bool = False

    @property
    def weight(self) -> float:
        return self.expected_attendance * self.audience_fraction


class EventIdea(SQLModel, table=True):
    """An event someone wants to hold, before it has a date.

    The brainstorm list. Deliberately not a :class:`ClubEvent` with nullable
    times: an idea and a booking are different things, and making the dates
    optional would mean every query that reasons about time had to remember to
    exclude the rows that have none.

    ``position`` is what the list is ordered by, so dragging a card reorders
    intent rather than editing anything about the events themselves.
    ``event_id`` is the link to the booking once one exists, and is what makes
    a card read as scheduled.
    """

    id: int | None = Field(default=None, primary_key=True)
    title: str
    notes: str = ""
    position: int = Field(default=0, index=True)
    event_id: int | None = Field(default=None, foreign_key="clubevent.id")


class Exam(SQLModel, table=True):
    """A one-off exam sitting for a course.

    Modelled separately from :class:`ClubEvent` because it is the single most
    disruptive competitor we have: evening exams at this school land at 8:00p
    on weeknights, which is precisely when student orgs meet. It also inherits
    its weight from the course roster instead of carrying its own estimate.

    A course has several of these per term (three midterms is typical), and the
    registrar publishes one row per CRN, so the same sitting appears many times
    in the source table. Dedupe on (course, date, start, end).
    """

    id: int | None = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="course.id", index=True)
    kind: str = "midterm"  # "midterm" | "final" | "quiz"
    starts_at: datetime = Field(index=True)
    ends_at: datetime
    rooms: str = ""
    section: str = ""

    course: Course | None = Relationship(back_populates="exams")
