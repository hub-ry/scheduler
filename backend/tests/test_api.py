from datetime import datetime

from sqlmodel import select

from app.core.models import Exam
from app.seed import seed

MA162_EXAM = datetime(2026, 9, 23, 20, 0)  # a real sitting from the seeded data


class TestSeed:
    def test_only_target_courses_get_exams(self, seeded, client):
        codes = {c["code"] for c in client.get("/api/courses").json()}
        assert "MA 16200" in codes
        # MA 13700 is in the pasted table but is not an audience course.
        assert "MA 13700" not in codes

    def test_seeding_twice_does_not_duplicate_exams(self, session):
        first = seed(session)["exams_loaded"]
        second = seed(session)["exams_loaded"]
        assert first == second
        assert len(session.exec(select(Exam)).all()) == first


class TestCourses:
    def test_unknown_enrollment_is_flagged(self, client):
        courses = client.get("/api/courses").json()
        assert all(c["has_measured_enrollment"] is False for c in courses)
        assert all(c["weight"] == 100 for c in courses)

    def test_setting_enrollment_updates_the_weight(self, client):
        course = next(c for c in client.get("/api/courses").json() if c["code"] == "MA 16200")
        updated = client.patch(f"/api/courses/{course['id']}", json={"enrollment": 1400}).json()
        assert updated["enrollment"] == 1400
        assert updated["weight"] == 1400
        assert updated["has_measured_enrollment"] is True

    def test_partial_update_leaves_other_fields_alone(self, client):
        course = next(c for c in client.get("/api/courses").json() if c["code"] == "MA 16200")
        client.patch(f"/api/courses/{course['id']}", json={"enrollment": 900})
        updated = client.patch(
            f"/api/courses/{course['id']}", json={"audience_fraction": 0.5}
        ).json()
        assert updated["enrollment"] == 900
        assert updated["weight"] == 450

    def test_rejects_an_out_of_range_audience_fraction(self, client):
        course = client.get("/api/courses").json()[0]
        assert (
            client.patch(
                f"/api/courses/{course['id']}", json={"audience_fraction": 1.5}
            ).status_code
            == 422
        )  # noqa: E501

    def test_missing_course_is_404(self, client):
        assert client.patch("/api/courses/99999", json={"enrollment": 1}).status_code == 404


class TestExams:
    def test_seeded_exams_are_listed_in_time_order(self, client):
        exams = client.get("/api/exams").json()
        assert exams
        assert [e["starts_at"] for e in exams] == sorted(e["starts_at"] for e in exams)

    def test_the_ma162_september_sitting_survived_the_round_trip(self, client):
        exams = client.get("/api/exams").json()
        sitting = next(
            e
            for e in exams
            if e["course_code"] == "MA 16200" and e["starts_at"] == MA162_EXAM.isoformat()
        )
        assert sitting["rooms"] == "BHEE 129, BHEE 170, CL50 224, ME 1061"


class TestEvents:
    def _payload(self, **overrides):
        return {
            "title": "Rival Org Callout",
            "organization": "Some Other Club",
            "starts_at": "2026-09-23T19:00:00",
            "ends_at": "2026-09-23T20:00:00",
            "expected_attendance": 120,
        } | overrides

    def test_create_and_list(self, client):
        created = client.post("/api/events", json=self._payload())
        assert created.status_code == 201
        assert created.json()["weight"] == 120
        assert len(client.get("/api/events").json()) == 1

    def test_an_event_ending_before_it_starts_is_rejected(self, client):
        bad = self._payload(ends_at="2026-09-23T18:00:00")
        assert client.post("/api/events", json=bad).status_code == 422

    def test_a_zero_length_event_is_rejected(self, client):
        bad = self._payload(ends_at="2026-09-23T19:00:00")
        assert client.post("/api/events", json=bad).status_code == 422

    def test_delete(self, client):
        event_id = client.post("/api/events", json=self._payload()).json()["id"]
        assert client.delete(f"/api/events/{event_id}").status_code == 204
        assert client.get("/api/events").json() == []

    def test_deleting_a_missing_event_is_404(self, client):
        assert client.delete("/api/events/99999").status_code == 404

    def test_our_own_events_do_not_compete_with_us(self, client):
        """An event we are hosting must not make its own slot look bad."""
        client.post("/api/events", json=self._payload(is_ours=True))
        busy = client.get(
            "/api/busy", params={"start": "2026-09-23T00:00", "end": "2026-09-23T23:59"}
        ).json()
        assert all(b["label"] != "Rival Org Callout" for b in busy)


class TestBusy:
    def test_returns_exams_in_the_window_only(self, client):
        busy = client.get(
            "/api/busy", params={"start": "2026-09-23T00:00", "end": "2026-09-23T23:59"}
        ).json()
        labels = {b["label"] for b in busy}
        assert "MA 16200 midterm" in labels
        # The MA 16200 October sitting is outside the window.
        assert all(b["start"].startswith("2026-09-23") for b in busy)

    def test_an_inverted_window_is_rejected(self, client):
        response = client.get(
            "/api/busy", params={"start": "2026-09-24T00:00", "end": "2026-09-23T00:00"}
        )
        assert response.status_code == 422


class TestRanking:
    def _request(self, **overrides):
        return {
            "window_start": "2026-09-21",
            "window_end": "2026-09-25",
            "duration_minutes": 60,
            "earliest": "17:00:00",
            "latest": "22:00:00",
            "step_minutes": 60,
        } | overrides

    def test_the_top_slot_avoids_the_evening_exam_block(self, client):
        body = client.post("/api/schedule/rank", json=self._request()).json()
        assert body["slots"]
        top = body["slots"][0]
        assert top["is_clear"] is True
        assert top["lost_attendance"] == 0

    def test_the_ma162_exam_night_slot_is_penalised(self, client):
        """Wed 09/23 at 8pm holds a real MA 16200 midterm - it must rank badly."""
        body = client.post("/api/schedule/rank", json=self._request(limit=200)).json()
        exam_slot = next(s for s in body["slots"] if s["start"] == "2026-09-23T20:00:00")
        clear_slots = [s for s in body["slots"] if s["is_clear"]]
        assert exam_slot["lost_attendance"] > 0
        assert body["slots"].index(exam_slot) > body["slots"].index(clear_slots[-1])
        assert any(c["label"] == "MA 16200 midterm" for c in exam_slot["conflicts"])

    def test_placeholder_weights_are_disclosed(self, client):
        body = client.post("/api/schedule/rank", json=self._request()).json()
        assert body["uses_placeholder_weights"] is True
        assert "MA 16200" in body["courses_missing_enrollment"]

    def test_real_enrollment_clears_the_placeholder_warning_for_that_course(self, client):
        for course in client.get("/api/courses").json():
            client.patch(f"/api/courses/{course['id']}", json={"enrollment": 500})
        body = client.post("/api/schedule/rank", json=self._request()).json()
        assert body["uses_placeholder_weights"] is False
        assert body["courses_missing_enrollment"] == []

    def test_weekday_filter_is_honoured(self, client):
        body = client.post("/api/schedule/rank", json=self._request(weekdays=[1], limit=100)).json()
        assert {datetime.fromisoformat(s["start"]).weekday() for s in body["slots"]} == {1}

    def test_limit_is_honoured(self, client):
        body = client.post("/api/schedule/rank", json=self._request(limit=3)).json()
        assert len(body["slots"]) == 3
        assert body["considered"] > 3

    def test_an_inverted_window_is_rejected(self, client):
        bad = self._request(window_start="2026-09-25", window_end="2026-09-21")
        assert client.post("/api/schedule/rank", json=bad).status_code == 422

    def test_latest_before_earliest_is_rejected(self, client):
        bad = self._request(earliest="22:00:00", latest="17:00:00")
        assert client.post("/api/schedule/rank", json=bad).status_code == 422

    def test_no_weekdays_is_rejected(self, client):
        assert client.post("/api/schedule/rank", json=self._request(weekdays=[])).status_code == 422

    def test_a_competing_event_changes_the_ranking(self, client):
        before = client.post("/api/schedule/rank", json=self._request(limit=200)).json()
        target = next(s for s in before["slots"] if s["is_clear"])
        client.post(
            "/api/events",
            json={
                "title": "Huge Rival Callout",
                "starts_at": target["start"],
                "ends_at": target["end"],
                "expected_attendance": 5000,
            },
        )
        after = client.post("/api/schedule/rank", json=self._request(limit=200)).json()
        now = next(s for s in after["slots"] if s["start"] == target["start"])
        assert now["is_clear"] is False
        assert now["lost_attendance"] == 5000


class TestImport:
    STAT_TABLE = (
        "Fall 2026 (PWL) midterm examinations (STAT)\n"
        "STAT\t35000\t\t\tThu 12/03\t8:00p - 9:00p\tWALC 1055\n"
        "STAT\t11300\t\t\tThu 12/03\t8:00p - 9:00p\tRHPH 172\n"
    )

    def test_pasting_a_table_imports_only_target_courses(self, client):
        body = client.post("/api/import/exams", json={"text": self.STAT_TABLE}).json()
        assert body["parsed"] == 2
        assert body["imported"] == 1  # STAT 35000 is a target; STAT 11300 is not
        assert body["skipped_non_target"] == ["STAT 11300"]

    def test_importing_the_same_table_twice_is_idempotent(self, client):
        client.post("/api/import/exams", json={"text": self.STAT_TABLE})
        second = client.post("/api/import/exams", json={"text": self.STAT_TABLE}).json()
        assert second["imported"] == 0

    def test_a_table_with_no_year_anywhere_is_rejected(self, client):
        response = client.post(
            "/api/import/exams",
            json={"text": "STAT\t35000\t\t\tThu 12/03\t8:00p - 9:00p\tWALC 1055\n"},
        )
        assert response.status_code == 422
        assert "term year" in response.json()["detail"]

    def test_an_imported_exam_immediately_affects_the_ranking(self, client):
        request = {
            "window_start": "2026-12-03",
            "window_end": "2026-12-03",
            "duration_minutes": 60,
            "earliest": "20:00:00",
            "latest": "21:00:00",
            "step_minutes": 60,
            "weekdays": [3],
        }
        before = client.post("/api/schedule/rank", json=request).json()
        assert before["slots"][0]["is_clear"] is True
        client.post("/api/import/exams", json={"text": self.STAT_TABLE})
        after = client.post("/api/schedule/rank", json=request).json()
        assert after["slots"][0]["is_clear"] is False


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}
