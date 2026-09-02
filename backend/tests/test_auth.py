"""Tests for the shared-password gate.

Two things matter. Unconfigured, the gate must be completely invisible - that is
how the app runs on a laptop, and a dev environment that started demanding a
password would be a worse bug than the one this feature fixes. Configured, it
must actually cover the writes, including any endpoint added later.
"""

import pytest

from app import auth


@pytest.fixture
def gated(monkeypatch):
    monkeypatch.setenv("SCHEDULER_PASSWORD", "boiler-up")
    return "boiler-up"


def test_open_when_no_password_is_configured(client, monkeypatch):
    monkeypatch.delenv("SCHEDULER_PASSWORD", raising=False)

    assert client.get("/api/courses").status_code == 200
    session = client.get("/api/session").json()
    assert session == {"required": False, "authenticated": True}


def test_reads_are_refused_until_you_sign_in(client, gated):
    assert client.get("/api/courses").status_code == 401
    assert client.get("/api/session").json() == {"required": True, "authenticated": False}


def test_writes_are_refused_until_you_sign_in(client, gated):
    assert client.post("/api/ideas", json={"title": "Callout"}).status_code == 401


def test_signing_in_opens_it(client, gated):
    assert client.post("/api/session", json={"password": gated}).status_code == 200
    # The TestClient keeps the cookie, exactly as a browser would.
    assert client.get("/api/courses").status_code == 200
    assert client.post("/api/ideas", json={"title": "Callout"}).status_code == 201


def test_the_wrong_password_is_refused(client, gated):
    assert client.post("/api/session", json={"password": "guess"}).status_code == 401
    assert client.get("/api/courses").status_code == 401


def test_signing_out_closes_it_again(client, gated):
    client.post("/api/session", json={"password": gated})
    assert client.delete("/api/session").status_code == 204
    assert client.get("/api/courses").status_code == 401


def test_every_data_route_is_behind_the_gate(client, gated):
    """A route added later should be covered by default, not by remembering.

    The guard is on the router rather than on individual endpoints, so this
    walks the real route table instead of a hand-written list that would drift.
    """
    from app.main import app

    open_paths = {"/api/session", "/health", "/openapi.json", "/docs", "/redoc", "/docs/oauth2-redirect"}
    for route in app.routes:
        path = getattr(route, "path", "")
        if not path.startswith("/api/") or path in open_paths:
            continue
        dependencies = [d.call for d in getattr(route, "dependencies", [])]
        assert auth.require_session in dependencies, f"{path} is not behind the gate"


def test_a_tampered_cookie_is_refused(client, gated):
    client.post("/api/session", json={"password": gated})
    client.cookies.set(auth.COOKIE_NAME, "99999999999.deadbeef")
    assert client.get("/api/courses").status_code == 401


def test_an_expired_cookie_is_refused(client, gated):
    token = auth.issue_token(now=0)  # expired long ago
    client.cookies.set(auth.COOKIE_NAME, token)
    assert client.get("/api/courses").status_code == 401


def test_changing_the_password_invalidates_old_sessions(client, gated, monkeypatch):
    """Removing someone's access means changing it, so it must log everyone out."""
    client.post("/api/session", json={"password": gated})
    assert client.get("/api/courses").status_code == 200

    monkeypatch.setenv("SCHEDULER_PASSWORD", "something-else")
    assert client.get("/api/courses").status_code == 401
