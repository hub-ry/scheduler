"""Parser tests run against the real registrar tables in ``data/``.

Synthetic fixtures would not exercise the things that actually break: blank
CRN columns, bracketed placeholders, multi-room cells, and DIST duplicates.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import pytest

from app.core.registrar import parse_clock, parse_exam_table

DATA = Path(__file__).resolve().parents[1] / "data"


@pytest.fixture(scope="module")
def ma_exams():
    return parse_exam_table((DATA / "exams_fall2026_MA.txt").read_text())


@pytest.fixture(scope="module")
def stat_exams():
    return parse_exam_table((DATA / "exams_fall2026_STAT.txt").read_text())


@pytest.fixture(scope="module")
def cs_exams():
    return parse_exam_table((DATA / "exams_fall2026_CS.txt").read_text())


def test_header_supplies_year_and_kind(ma_exams):
    assert ma_exams, "no rows parsed"
    assert {e.kind for e in ma_exams} == {"midterm"}
    assert {e.starts_at.year for e in ma_exams} == {2026}


def test_blank_crn_columns_do_not_shift_fields(ma_exams):
    """MA 16200's rows have empty CRN and Section cells."""
    ma162 = [e for e in ma_exams if e.course_number == "16200"]
    assert [e.starts_at for e in ma162] == [
        datetime(2026, 9, 23, 20, 0),
        datetime(2026, 10, 20, 20, 0),
        datetime(2026, 11, 9, 20, 0),
    ]
    assert all(e.ends_at.hour == 21 for e in ma162)


def test_multi_room_cell_is_split(ma_exams):
    first = next(e for e in ma_exams if e.course_number == "16200")
    assert first.rooms == ("BHEE 129", "BHEE 170", "CL50 224", "ME 1061")


def test_per_crn_duplicates_collapse_to_one_sitting(ma_exams):
    """MA 35100 lists four CRNs; 13038 and 19439 share a sitting, as do 23344/23346."""
    oct6 = [
        e
        for e in ma_exams
        if e.course_number == "35100" and e.starts_at == datetime(2026, 10, 6, 20, 0)
    ]
    assert len(oct6) == 1
    # Rooms from both duplicate rows are unioned rather than one overwriting the other.
    assert oct6[0].rooms == ("MATH 175", "RHPH 172")


def test_dist_sections_merge_into_the_in_person_course(stat_exams):
    """STAT 11300DIST is the same sitting as STAT 11300, not a separate course."""
    assert all(not e.course_number.endswith("DIST") for e in stat_exams)
    sep24 = [e for e in stat_exams if e.starts_at == datetime(2026, 9, 24, 20, 0)]
    assert len(sep24) == 1
    assert sep24[0].course_code == "STAT 11300"


def test_bracketed_placeholders_are_not_rooms(stat_exams):
    assert all("[" not in room for e in stat_exams for room in e.rooms)


def test_asterisked_section_still_parses(cs_exams):
    """CS 33400's section is written ``58534-LE1*``."""
    cs334 = [e for e in cs_exams if e.course_number == "33400"]
    assert len(cs334) == 1
    assert cs334[0].starts_at == datetime(2026, 10, 8, 20, 0)
    assert cs334[0].ends_at == datetime(2026, 10, 8, 22, 0)


def test_short_code_matches_how_students_write_it(cs_exams):
    assert next(e for e in cs_exams if e.course_number == "25100").short_code == "CS 251"


def test_every_data_row_is_parsed():
    """Guards against a regex tweak silently dropping rows."""
    for path in DATA.glob("exams_fall2026_*.txt"):
        lines = path.read_text().splitlines()
        # Skip the title line and the column-header line.
        data_rows = [ln for ln in lines[2:] if ln.strip()]
        parsed = parse_exam_table(path.read_text())
        # Parsing only ever merges rows, so it must never exceed the input.
        assert 0 < len(parsed) <= len(data_rows), path.name


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("8:00p", (20, 0)), ("6:30p", (18, 30)), ("12:00p", (12, 0)), ("11:30a", (11, 30))],
)
def test_parse_clock(raw, expected):
    parsed = parse_clock(raw)
    assert (parsed.hour, parsed.minute) == expected


def test_target_courses_all_appear_in_the_exam_tables(ma_exams, stat_exams, cs_exams):
    """Catches a typo'd course code in the seed list, and records known gaps."""
    targets = json.loads((DATA / "target_courses.json").read_text())["courses"]
    present = {e.course_code for e in [*ma_exams, *stat_exams, *cs_exams]}
    missing = [c["code"] for c in targets if c["code"] not in present]
    # CS 25000 is documented in the seed file as absent from the published table.
    assert missing == ["CS 25000"]
