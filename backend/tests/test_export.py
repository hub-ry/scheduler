"""Tests for the JSON snapshot.

The snapshot's whole value rests on it being interchangeable with the live API.
If it drifts, a static build would render subtly different numbers from the one
running locally, and nothing would flag it - so the tests here mostly assert
that the two agree rather than checking the snapshot in isolation.
"""

import json

from app.export import SCHEMA_VERSION, build_snapshot, write_snapshot


def test_snapshot_carries_the_seeded_data(seeded):
    snapshot = build_snapshot(seeded)

    assert snapshot["schema_version"] == SCHEMA_VERSION
    assert snapshot["courses"], "seeded database should have target courses"
    assert snapshot["exams"], "seeded database should have exam sittings"
    assert snapshot["terms"], "exams are meaningless without the term that bounds them"


def test_snapshot_matches_what_the_api_serves(client, seeded):
    """The reason this exists: a static build must not disagree with the server."""
    snapshot = build_snapshot(seeded)

    for key, path in [
        ("courses", "/api/courses"),
        ("exams", "/api/exams"),
        ("events", "/api/events"),
    ]:
        assert snapshot[key] == client.get(path).json(), f"{key} drifted from {path}"


def test_snapshot_is_json_serialisable(seeded):
    """Datetimes and dates are the usual thing that quietly is not."""
    json.dumps(build_snapshot(seeded))


def test_snapshot_preserves_hand_entered_enrollment(client, seeded):
    """The one piece of data in this project that lives nowhere else."""
    course = client.get("/api/courses").json()[0]
    client.patch(f"/api/courses/{course['id']}", json={"enrollment": 437})

    written = next(c for c in build_snapshot(seeded)["courses"] if c["id"] == course["id"])
    assert written["enrollment"] == 437
    assert written["has_measured_enrollment"] is True
    assert written["weight"] == 437


def test_write_snapshot_round_trips_through_the_file(tmp_path, seeded, monkeypatch):
    import app.export as export

    monkeypatch.setattr(export, "engine", seeded.get_bind())
    output = tmp_path / "snapshot.json"
    written = write_snapshot(output)

    assert json.loads(output.read_text()) == written
    assert output.read_text().endswith("\n")
