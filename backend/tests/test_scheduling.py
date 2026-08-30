from __future__ import annotations

from datetime import date, datetime, time, timedelta

from app.core.models import ClubEvent, Course, CourseMeeting, Weekday
from app.core.scheduling import (
    BusyInterval,
    SlotConstraints,
    candidate_slots,
    event_to_interval,
    expand_course,
    rank_slots,
    score_slot,
)

MONDAY = date(2026, 9, 21)


def _span(day: date, start: str, end: str) -> tuple[datetime, datetime]:
    return (
        datetime.combine(day, time.fromisoformat(start)),
        datetime.combine(day, time.fromisoformat(end)),
    )


def busy(day: date, start: str, end: str, weight: float = 100, label: str = "x") -> BusyInterval:
    lo, hi = _span(day, start, end)
    return BusyInterval(start=lo, end=hi, weight=weight, label=label, kind="event")


class TestOverlap:
    def test_disjoint_intervals_do_not_overlap(self):
        assert busy(MONDAY, "20:00", "21:00").overlap_with(
            *_span(MONDAY, "18:00", "19:00")
        ) == timedelta(0)

    def test_touching_intervals_do_not_overlap(self):
        """An event ending exactly when an exam starts is not a conflict."""
        assert busy(MONDAY, "20:00", "21:00").overlap_with(
            *_span(MONDAY, "19:00", "20:00")
        ) == timedelta(0)

    def test_partial_overlap_is_measured(self):
        assert busy(MONDAY, "20:00", "21:00").overlap_with(
            *_span(MONDAY, "19:30", "20:30")
        ) == timedelta(minutes=30)


class TestScoring:
    def test_a_clear_slot_scores_zero(self):
        slot = score_slot(*_span(MONDAY, "18:00", "19:00"), [busy(MONDAY, "20:00", "21:00")])
        assert slot.is_clear
        assert slot.blocked == 0 and slot.lost_attendance == 0

    def test_full_overlap_costs_the_whole_weight(self):
        slot = score_slot(*_span(MONDAY, "20:00", "21:00"), [busy(MONDAY, "20:00", "21:00", 250)])
        assert slot.blocked == 250
        assert slot.lost_attendance == 250

    def test_partial_overlap_is_prorated_but_still_fully_blocked(self):
        """Half a conflict blocks everyone but only costs half the attendance."""
        slot = score_slot(*_span(MONDAY, "19:30", "20:30"), [busy(MONDAY, "20:00", "21:00", 200)])
        assert slot.blocked == 200
        assert slot.lost_attendance == 100

    def test_conflicts_are_reported_worst_first(self):
        slot = score_slot(
            *_span(MONDAY, "20:00", "21:00"),
            [
                busy(MONDAY, "20:00", "20:15", 400, "brief-but-big"),
                busy(MONDAY, "20:00", "21:00", 200, "full-overlap"),
            ],
        )
        assert [c.label for c in slot.conflicts] == ["full-overlap", "brief-but-big"]


class TestCandidateSlots:
    def test_slots_respect_the_time_of_day_bounds(self):
        slots = candidate_slots(
            datetime.combine(MONDAY, time(0, 0)),
            datetime.combine(MONDAY, time(23, 59)),
            SlotConstraints(duration=timedelta(hours=1), earliest=time(18, 0), latest=time(21, 0)),
        )
        assert slots[0][0].time() == time(18, 0)
        # The last slot must END by 21:00, so it starts at 20:00.
        assert slots[-1][0].time() == time(20, 0)

    def test_slots_respect_the_weekday_filter(self):
        slots = candidate_slots(
            datetime.combine(MONDAY, time(0, 0)),
            datetime.combine(MONDAY + timedelta(days=6), time(23, 59)),
            SlotConstraints(weekdays=frozenset({Weekday.TUESDAY, Weekday.THURSDAY})),
        )
        assert {s[0].weekday() for s in slots} == {Weekday.TUESDAY, Weekday.THURSDAY}

    def test_no_slot_straddles_midnight(self):
        slots = candidate_slots(
            datetime.combine(MONDAY, time(0, 0)),
            datetime.combine(MONDAY + timedelta(days=2), time(0, 0)),
            SlotConstraints(duration=timedelta(hours=2), earliest=time(0, 0), latest=time(23, 59)),
        )
        assert all(start.date() == end.date() for start, end in slots)


class TestExpandCourse:
    def _course(self) -> Course:
        course = Course(code="MA 16200", enrollment=1200)
        course.meetings = [
            CourseMeeting(weekday=Weekday.MONDAY, start_time=time(9, 30), end_time=time(10, 20)),
            CourseMeeting(weekday=Weekday.WEDNESDAY, start_time=time(9, 30), end_time=time(10, 20)),
        ]
        return course

    def test_weekly_pattern_repeats_across_the_window(self):
        intervals = expand_course(self._course(), MONDAY, MONDAY + timedelta(days=13))
        assert len(intervals) == 4  # two meetings, two weeks
        assert {i.start.weekday() for i in intervals} == {Weekday.MONDAY, Weekday.WEDNESDAY}

    def test_the_window_is_clipped_to_the_term(self):
        """A course generates no busy time before the term starts."""
        intervals = expand_course(
            self._course(),
            MONDAY,
            MONDAY + timedelta(days=13),
            term_start=MONDAY + timedelta(days=7),
            term_end=MONDAY + timedelta(days=13),
        )
        assert len(intervals) == 2

    def test_enrollment_drives_the_weight(self):
        assert expand_course(self._course(), MONDAY, MONDAY)[0].weight == 1200

    def test_unknown_enrollment_falls_back_to_the_placeholder_weight(self):
        course = Course(code="CS 25100")  # enrollment left unset
        course.meetings = [
            CourseMeeting(weekday=Weekday.MONDAY, start_time=time(9, 0), end_time=time(10, 0))
        ]
        assert not course.has_measured_enrollment
        assert expand_course(course, MONDAY, MONDAY)[0].weight == 100


class TestRanking:
    def test_the_clearest_slot_wins(self):
        exam = busy(MONDAY, "20:00", "21:00", 1200, "MA 162 midterm")
        ranked = rank_slots(
            [exam],
            *_span(MONDAY, "18:00", "22:00"),
            SlotConstraints(duration=timedelta(hours=1), earliest=time(18, 0), latest=time(22, 0)),
        )
        assert ranked[0].is_clear
        assert ranked[-1].start.time() == time(20, 0)

    def test_ties_break_toward_the_earlier_slot(self):
        ranked = rank_slots(
            [],
            *_span(MONDAY, "18:00", "21:00"),
            SlotConstraints(
                duration=timedelta(hours=1),
                earliest=time(18, 0),
                latest=time(21, 0),
                step=timedelta(hours=1),
            ),
        )
        assert [s.start.time() for s in ranked] == [time(18, 0), time(19, 0), time(20, 0)]

    def test_a_big_conflict_outranks_several_small_ones(self):
        ranked = rank_slots(
            [
                busy(MONDAY, "18:00", "19:00", 1200, "huge"),
                busy(MONDAY, "19:00", "20:00", 30, "tiny-a"),
                busy(MONDAY, "19:00", "20:00", 40, "tiny-b"),
            ],
            *_span(MONDAY, "18:00", "20:00"),
            SlotConstraints(
                duration=timedelta(hours=1),
                earliest=time(18, 0),
                latest=time(20, 0),
                step=timedelta(hours=1),
            ),
        )
        assert ranked[0].start.time() == time(19, 0)
        assert ranked[0].lost_attendance == 70

    def test_limit_truncates_after_sorting(self):
        ranked = rank_slots([], *_span(MONDAY, "18:00", "22:00"), SlotConstraints(), limit=3)
        assert len(ranked) == 3

    def test_club_events_compete_alongside_exams(self):
        event = ClubEvent(
            title="Rival Org Info Session",
            starts_at=datetime.combine(MONDAY, time(19, 0)),
            ends_at=datetime.combine(MONDAY, time(20, 0)),
            expected_attendance=80,
        )
        ranked = rank_slots(
            [event_to_interval(event)],
            *_span(MONDAY, "18:00", "20:00"),
            SlotConstraints(
                duration=timedelta(hours=1),
                earliest=time(18, 0),
                latest=time(20, 0),
                step=timedelta(hours=1),
            ),
        )
        assert ranked[0].start.time() == time(18, 0)
        assert ranked[1].conflicts[0].label == "Rival Org Info Session"
