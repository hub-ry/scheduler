"""Tests for course packages.

A package names an audience: the courses whose students you are actually
recruiting. The thing worth guarding is that choosing one genuinely narrows the
ranking, because a package that looks selected but changes nothing would be
worse than not having the feature - it would give false confidence in a number.
"""

import pytest


def test_seed_creates_the_declared_packages(client):
    names = {p["name"] for p in client.get("/api/packages").json()}
    assert names == {"CS", "All"}


def test_a_package_carries_its_courses(client):
    cs = next(p for p in client.get("/api/packages").json() if p["name"] == "CS")
    assert "CS 25100" in cs["course_codes"]
    assert "STAT 35000" not in cs["course_codes"]
    assert len(cs["course_ids"]) == len(cs["course_codes"])


def test_reseeding_does_not_undo_an_edit(seeded, client):
    """Someone who removes a course from a package means it."""
    from app.seed import seed

    cs = next(p for p in client.get("/api/packages").json() if p["name"] == "CS")
    trimmed = cs["course_ids"][:2]
    client.patch(f"/api/packages/{cs['id']}", json={"course_ids": trimmed})

    seed(seeded)

    after = next(p for p in client.get("/api/packages").json() if p["name"] == "CS")
    assert after["course_ids"] == trimmed


def test_ranking_scoped_to_a_package_ignores_other_courses(client):
    """The point of the feature: a stats exam must not sink a CS club's slot.

    STAT 35000 sits at 8pm on Wednesday 7 October 2026 and is not in the CS
    club package, so that exact hour is contested for the campus-wide audience
    and free for the CS one. Pinned to the one slot rather than compared across
    a whole term, because the ranker returns best-first and a wide window is
    all clear slots either way - which is how the first version of this test
    passed vacuously.
    """
    cs = next(p for p in client.get("/api/packages").json() if p["name"] == "CS")

    request = {
        "window_start": "2026-10-07",
        "window_end": "2026-10-07",
        "duration_minutes": 60,
        "earliest": "20:00",
        "latest": "21:00",
        "weekdays": [2],
        "step_minutes": 60,
        "limit": 10,
    }

    everyone = client.post("/api/schedule/rank", json=request).json()["slots"]
    scoped = client.post(
        "/api/schedule/rank", json={**request, "course_ids": cs["course_ids"]}
    ).json()["slots"]

    assert len(everyone) == 1 and len(scoped) == 1
    assert everyone[0]["start"] == scoped[0]["start"] == "2026-10-07T20:00:00"

    assert not everyone[0]["is_clear"], "STAT 35000 sits here"
    assert "STAT 35000 midterm" in [c["label"] for c in everyone[0]["conflicts"]]

    assert scoped[0]["is_clear"], "STAT is not the CS club's audience"
    assert scoped[0]["conflicts"] == []


def test_ranking_with_an_empty_course_list_sees_no_exams(client):
    """Distinct from omitting the field, which means every course."""
    request = {
        "window_start": "2026-09-01",
        "window_end": "2026-12-01",
        "duration_minutes": 60,
        "earliest": "17:00",
        "latest": "22:00",
        "weekdays": [0, 1, 2, 3],
        "step_minutes": 30,
        "limit": 200,
        "course_ids": [],
    }
    result = client.post("/api/schedule/rank", json=request).json()
    assert all(s["is_clear"] for s in result["slots"])
    assert result["uses_placeholder_weights"] is False


def test_create_update_and_delete(client):
    courses = client.get("/api/courses").json()
    ids = [c["id"] for c in courses[:3]]

    created = client.post(
        "/api/packages",
        json={"name": "Robotics", "description": "hardware people", "course_ids": ids},
    )
    assert created.status_code == 201
    package = created.json()

    code_of = {c["id"]: c["code"] for c in courses}
    assert package["course_ids"] == sorted(ids, key=lambda i: code_of[i])

    renamed = client.patch(f"/api/packages/{package['id']}", json={"name": "Robotics club"})
    assert renamed.json()["name"] == "Robotics club"
    # Membership is untouched by a rename.
    assert renamed.json()["course_ids"] == package["course_ids"]

    assert client.delete(f"/api/packages/{package['id']}").status_code == 204
    assert all(p["id"] != package["id"] for p in client.get("/api/packages").json())


def test_deleting_a_package_keeps_its_courses(client):
    before = len(client.get("/api/courses").json())
    ids = [c["id"] for c in client.get("/api/courses").json()[:2]]
    package = client.post("/api/packages", json={"name": "Temp", "course_ids": ids}).json()

    client.delete(f"/api/packages/{package['id']}")

    assert len(client.get("/api/courses").json()) == before


@pytest.mark.parametrize("payload", [{"name": "", "course_ids": []}, {"name": "x" * 200}])
def test_rejects_an_unusable_name(client, payload):
    assert client.post("/api/packages", json=payload).status_code == 422


def test_rejects_an_unknown_course_rather_than_dropping_it(client):
    """Silently ignoring it would change someone's audience without telling them."""
    response = client.post("/api/packages", json={"name": "Ghost", "course_ids": [99999]})
    assert response.status_code == 404
    assert "99999" in response.json()["detail"]
