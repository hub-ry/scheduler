"""Tests for the event brainstorm board.

An idea is an event someone wants to hold before it has a date. The two things
worth guarding are that the order survives a round trip - the board is a
ranking, so a reorder that silently half-applied would be worse than one that
failed - and that a card and the booking it links to have independent
lifetimes.
"""


def make(client, *titles):
    return [client.post("/api/ideas", json={"title": t}).json() for t in titles]


def test_new_ideas_land_at_the_bottom(client):
    made = make(client, "Callout", "Bonfire", "Résumé night")
    listed = client.get("/api/ideas").json()
    assert [i["title"] for i in listed] == [i["title"] for i in made]


def test_an_idea_starts_unscheduled(client):
    idea = make(client, "Callout")[0]
    assert idea["event_id"] is None
    assert idea["scheduled_for"] is None


def test_reorder_round_trips(client):
    made = make(client, "A", "B", "C")
    flipped = [made[2]["id"], made[0]["id"], made[1]["id"]]

    returned = client.post("/api/ideas/reorder", json={"ids": flipped}).json()
    assert [i["id"] for i in returned] == flipped
    assert [i["id"] for i in client.get("/api/ideas").json()] == flipped


def test_reorder_rejects_a_partial_list(client):
    """A dropped id would silently reshuffle whatever it left out."""
    made = make(client, "A", "B", "C")
    response = client.post("/api/ideas/reorder", json={"ids": [made[0]["id"]]})
    assert response.status_code == 400
    # And nothing moved.
    assert [i["title"] for i in client.get("/api/ideas").json()] == ["A", "B", "C"]


def test_linking_a_booking_marks_it_scheduled(client):
    idea = make(client, "Callout")[0]
    event = client.post(
        "/api/events",
        json={
            "title": "Callout",
            "organization": "",
            "location": "",
            "starts_at": "2026-10-14T19:00:00",
            "ends_at": "2026-10-14T20:00:00",
            "expected_attendance": 0,
            "audience_fraction": 1,
            "source": "manual",
            "is_ours": True,
        },
    ).json()

    linked = client.patch(f"/api/ideas/{idea['id']}", json={"event_id": event["id"]}).json()
    assert linked["event_id"] == event["id"]
    assert linked["scheduled_for"] == "2026-10-14T19:00:00"


def test_unlinking_returns_it_to_the_backlog(client):
    idea = make(client, "Callout")[0]
    event = client.post(
        "/api/events",
        json={
            "title": "Callout",
            "organization": "",
            "location": "",
            "starts_at": "2026-10-14T19:00:00",
            "ends_at": "2026-10-14T20:00:00",
            "expected_attendance": 0,
            "audience_fraction": 1,
            "source": "manual",
            "is_ours": True,
        },
    ).json()
    client.patch(f"/api/ideas/{idea['id']}", json={"event_id": event["id"]})

    cleared = client.patch(f"/api/ideas/{idea['id']}", json={"event_id": None}).json()
    assert cleared["event_id"] is None
    assert cleared["scheduled_for"] is None


def test_deleting_an_idea_does_not_cancel_its_event(client):
    """The card is a note; the booking is on a real calendar."""
    idea = make(client, "Callout")[0]
    event = client.post(
        "/api/events",
        json={
            "title": "Callout",
            "organization": "",
            "location": "",
            "starts_at": "2026-10-14T19:00:00",
            "ends_at": "2026-10-14T20:00:00",
            "expected_attendance": 0,
            "audience_fraction": 1,
            "source": "manual",
            "is_ours": True,
        },
    ).json()
    client.patch(f"/api/ideas/{idea['id']}", json={"event_id": event["id"]})

    assert client.delete(f"/api/ideas/{idea['id']}").status_code == 204
    assert any(e["id"] == event["id"] for e in client.get("/api/events").json())


def test_rejects_a_link_to_an_event_that_does_not_exist(client):
    idea = make(client, "Callout")[0]
    assert client.patch(f"/api/ideas/{idea['id']}", json={"event_id": 9999}).status_code == 404


def test_rejects_an_empty_title(client):
    """Including one that is only spaces, which would be an invisible card."""
    assert client.post("/api/ideas", json={"title": ""}).status_code == 422
    assert client.post("/api/ideas", json={"title": "   "}).status_code == 422


def test_trims_a_padded_title(client):
    assert client.post("/api/ideas", json={"title": "  Callout  "}).json()["title"] == "Callout"
