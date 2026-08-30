"""Parser for the registrar's published examination schedule.

The source is an HTML table that people copy-paste as text. One row looks like::

    MA    16200            Wed 09/23    8:00p - 9:00p    CL50 224, BHEE 129
    MA    35100    13038    13038-041    Tue 10/06    8:00p - 9:00p    MATH 175

The CRN and section columns are frequently blank, sometimes bracketed
placeholders (``[Dist]``, ``[1]``), and the room column contains an unquoted
comma-separated list. Splitting on whitespace therefore does not give stable
column positions.

Instead we anchor on the two columns that have a rigid shape - the date and the
time range - and treat everything to their left as identifiers and everything
to their right as rooms. That survives blank columns and multi-room rows.

The registrar also emits one row per CRN, so a single sitting appears many
times, and lists distance sections under a ``DIST``-suffixed course code that
duplicates the in-person sitting. Both are collapsed by :func:`parse_exam_table`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, time

# "Wed 09/23" then "8:00p - 9:00p", with the leading columns and trailing rooms
# captured loosely so blank CRN/section cells cannot shift the match.
ROW_RE = re.compile(
    r"""^\s*
    (?P<subject>[A-Z]{2,6})\s+
    (?P<course>\d{5}[A-Z]*)\s+
    (?P<pre>.*?)
    (?P<dow>Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+
    (?P<month>\d{1,2})/(?P<day>\d{1,2})\s+
    (?P<start>\d{1,2}:\d{2}[ap])\s*-\s*(?P<end>\d{1,2}:\d{2}[ap])\s*
    (?P<rooms>.*?)\s*$""",
    re.VERBOSE,
)

# "Fall 2026 (PWL) midterm examinations (MA)" - gives us the year and the kind,
# neither of which appear on the rows themselves.
HEADER_RE = re.compile(
    r"(?P<season>Fall|Spring|Summer|Winter)\s+(?P<year>\d{4}).*?"
    r"(?P<kind>midterm|final)\s+examinations",
    re.IGNORECASE,
)

DOW_TO_INDEX = {"Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4, "Sat": 5, "Sun": 6}


@dataclass(frozen=True)
class ParsedExam:
    """One deduplicated exam sitting, ready to be turned into an ``Exam`` row."""

    subject: str
    course_number: str
    starts_at: datetime
    ends_at: datetime
    rooms: tuple[str, ...]
    kind: str = "midterm"

    @property
    def course_code(self) -> str:
        """Canonical ``"MA 16200"``. The DIST suffix is dropped by the parser."""
        return f"{self.subject} {self.course_number}"

    @property
    def short_code(self) -> str:
        """How students actually write it: ``"MA 162"`` for ``MA 16200``."""
        trimmed = self.course_number.rstrip("0")
        return f"{self.subject} {trimmed or self.course_number}"


def parse_clock(value: str, fallback_pm: bool = True) -> time:
    """Parse the registrar's ``8:00p`` / ``11:30a`` clock format.

    Exams run in the evening, so a bare time with no meridiem is read as PM.
    """
    match = re.match(r"(\d{1,2}):(\d{2})\s*([ap])?", value.strip(), re.IGNORECASE)
    if not match:
        raise ValueError(f"unrecognised time: {value!r}")
    hour, minute, meridiem = int(match[1]), int(match[2]), match[3]
    is_pm = (meridiem or ("p" if fallback_pm else "a")).lower() == "p"
    if hour == 12:
        hour = 12 if is_pm else 0
    elif is_pm:
        hour += 12
    return time(hour, minute)


def infer_year(month: int, term_season: str, term_year: int) -> int:
    """Map a bare ``MM/DD`` onto a calendar year using the term it belongs to.

    Only a spring term straddles New Year, and there only the Nov/Dec months of
    a preceding fall would be ambiguous - which never appear in a spring table.
    """
    if term_season.lower() == "spring" and month >= 8:
        return term_year - 1
    return term_year


def parse_exam_table(text: str, term_season: str = "", term_year: int = 0) -> list[ParsedExam]:
    """Parse a pasted registrar table into deduplicated sittings.

    The season and year are read from the table's own header line when present;
    the arguments are a fallback for fragments pasted without it.
    """
    kind = "midterm"
    if header := HEADER_RE.search(text):
        term_season = header["season"]
        term_year = int(header["year"])
        kind = header["kind"].lower()
    if not term_year:
        raise ValueError("could not determine the term year; pass term_year explicitly")

    # Keyed by sitting, so the registrar's per-CRN duplicates collapse. Rooms
    # are unioned because duplicate rows sometimes list different rooms.
    sittings: dict[tuple[str, str, datetime, datetime], set[str]] = {}
    order: list[tuple[str, str, datetime, datetime]] = []

    for line in text.splitlines():
        match = ROW_RE.match(line)
        if not match:
            continue
        subject = match["subject"]
        # "11300DIST" is the distance section of "11300" - the same sitting.
        course_number = re.sub(r"DIST$", "", match["course"])
        month, day = int(match["month"]), int(match["day"])
        year = infer_year(month, term_season, term_year)
        on = date(year, month, day)

        starts = datetime.combine(on, parse_clock(match["start"]))
        ends = datetime.combine(on, parse_clock(match["end"]))

        key = (subject, course_number, starts, ends)
        if key not in sittings:
            sittings[key] = set()
            order.append(key)
        rooms = (r.strip() for r in match["rooms"].split(","))
        sittings[key].update(r for r in rooms if r and not r.startswith("["))

    return [
        ParsedExam(
            subject=subject,
            course_number=number,
            starts_at=starts,
            ends_at=ends,
            rooms=tuple(sorted(sittings[key])),
            kind=kind,
        )
        for key in order
        for subject, number, starts, ends in [key]
    ]
