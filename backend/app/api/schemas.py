"""Request and response bodies for the HTTP layer.

Kept separate from the SQLModel tables so the wire format can stay stable while
the storage model moves, and so computed fields (``weight``, ``conflicts``)
can be exposed without becoming columns.
"""

from datetime import date, datetime, time
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, model_validator

from app.core.models import Weekday


class CourseOut(BaseModel):
    id: int
    code: str
    short: str
    title: str
    enrollment: int | None
    audience_fraction: float
    weight: float
    has_measured_enrollment: bool
    exam_count: int = 0


class CourseUpdate(BaseModel):
    """Everything here is optional; omitted fields are left alone."""

    enrollment: int | None = Field(default=None, ge=0)
    audience_fraction: float | None = Field(default=None, gt=0, le=1)
    title: str | None = None


class SessionOut(BaseModel):
    """Whether this deployment is gated, and whether the caller is through it."""

    required: bool
    authenticated: bool


class SignIn(BaseModel):
    password: str


class PackageOut(BaseModel):
    id: int
    name: str
    description: str
    course_ids: list[int]
    course_codes: list[str]


class PackageIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = ""
    course_ids: list[int] = []


class PackageUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = None
    course_ids: list[int] | None = None


class IdeaOut(BaseModel):
    id: int
    title: str
    notes: str
    position: int
    event_id: int | None
    #: Denormalised from the linked booking so the board can show when it lands
    #: without fetching every event to find out.
    scheduled_for: datetime | None = None


class IdeaIn(BaseModel):
    # Stripped before validation, so a title of spaces is rejected rather than
    # creating a card with an invisible name.
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    notes: str = ""


class IdeaUpdate(BaseModel):
    title: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
        | None
    ) = None
    notes: str | None = None
    event_id: int | None = None


class ReorderRequest(BaseModel):
    """The ids of every idea, in the order they should now appear."""

    ids: list[int]


class ExamOut(BaseModel):
    id: int
    course_code: str
    course_title: str
    kind: str
    starts_at: datetime
    ends_at: datetime
    rooms: str
    weight: float


class EventIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    organization: str = ""
    location: str = ""
    starts_at: datetime
    ends_at: datetime
    expected_attendance: int = Field(default=0, ge=0)
    audience_fraction: float = Field(default=1.0, gt=0, le=1)
    source: str = "manual"
    is_ours: bool = False

    @model_validator(mode="after")
    def _end_must_follow_start(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        return self


class EventOut(EventIn):
    id: int
    weight: float


class ConflictOut(BaseModel):
    label: str
    kind: Literal["course", "event", "exam", "ours"]
    weight: float
    overlap_minutes: float
    overlap_fraction: float


class SlotOut(BaseModel):
    start: datetime
    end: datetime
    blocked: float
    lost_attendance: float
    is_clear: bool
    conflicts: list[ConflictOut]


class RankRequest(BaseModel):
    """The 'when should we hold this?' query."""

    window_start: date
    window_end: date
    duration_minutes: int = Field(default=60, ge=15, le=480)
    earliest: time = time(17, 0)
    latest: time = time(22, 0)
    weekdays: list[Weekday] = Field(
        default_factory=lambda: [
            Weekday.MONDAY,
            Weekday.TUESDAY,
            Weekday.WEDNESDAY,
            Weekday.THURSDAY,
        ]
    )
    step_minutes: int = Field(default=30, ge=5, le=120)
    limit: int = Field(default=10, ge=1, le=200)
    #: Restrict the audience to these courses. ``None`` means every tracked
    #: course, which is the right default but the wrong answer for a club whose
    #: people all sit in one department.
    course_ids: list[int] | None = None

    @model_validator(mode="after")
    def _validate_window(self):
        if self.window_end < self.window_start:
            raise ValueError("window_end must not precede window_start")
        if self.latest <= self.earliest:
            raise ValueError("latest must be after earliest")
        if not self.weekdays:
            raise ValueError("at least one weekday must be allowed")
        return self


class RankResponse(BaseModel):
    slots: list[SlotOut]
    considered: int
    #: Set when any contributing course is still on a placeholder weight, so the
    #: UI can caveat the ranking instead of presenting it as measured.
    uses_placeholder_weights: bool
    courses_missing_enrollment: list[str]


class BusyOut(BaseModel):
    """A busy block for the calendar grid."""

    start: datetime
    end: datetime
    label: str
    kind: str
    weight: float
    detail: str = ""


class AcademicDateOut(BaseModel):
    """A break, closure, or milestone from the university academic calendar."""

    id: int
    label: str
    start_date: date
    end_date: date
    blocks_events: bool
    note: str


class ImportRequest(BaseModel):
    text: str = Field(min_length=1)
    term_season: str = ""
    term_year: int = 0
    #: When false, rows for courses outside the target list are reported but
    #: not written, matching the seeder's behaviour.
    include_non_target: bool = False


class ImportResponse(BaseModel):
    parsed: int
    imported: int
    skipped_non_target: list[str]
    unknown_courses: list[str]
