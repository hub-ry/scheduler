"""A shared-password gate.

The app has no user accounts and does not want any: everyone who uses it is an
officer of one club, and the thing being protected is a term's worth of event
planning rather than anything sensitive. One password the exec board shares is
proportionate.

It exists because the API is entirely unauthenticated otherwise. Signing in with
Google authorises *Calendar*, not this app, so on a public URL a stranger who
found the link could add events and delete the ideas board. That is the hole
this closes, and no more than that.

Unset ``SCHEDULER_PASSWORD`` and the gate disappears, which is the right default
for ``./dev`` on a laptop: nothing to type, nothing to remember, and no risk
because nothing outside the machine can reach it.
"""

import hmac
import os
import time
from hashlib import sha256

from fastapi import Cookie, HTTPException

COOKIE_NAME = "scheduler_session"

#: How long a sign-in lasts. Long, because being asked to type a shared password
#: mid-planning is the kind of friction that gets a tool abandoned, and the
#: threat model is a stray visitor rather than a determined attacker.
SESSION_SECONDS = 30 * 24 * 60 * 60


def configured_password() -> str | None:
    """The password, or ``None`` when the gate is switched off.

    Read per call rather than captured at import, so tests can set and clear it
    without having to reload the module.
    """
    password = os.environ.get("SCHEDULER_PASSWORD", "").strip()
    return password or None


def _secret() -> bytes:
    """Key for signing session cookies.

    Derived from the password unless one is given explicitly, so there is only
    one thing to configure. Changing the password therefore invalidates every
    outstanding session, which is what you want from a shared secret: removing
    someone's access means changing it, and that should log everyone out.
    """
    explicit = os.environ.get("SCHEDULER_SECRET", "").strip()
    if explicit:
        return explicit.encode()
    return sha256((configured_password() or "").encode()).digest()


def _sign(expires_at: int) -> str:
    return hmac.new(_secret(), str(expires_at).encode(), sha256).hexdigest()


def issue_token(now: float | None = None) -> str:
    expires_at = int((now if now is not None else time.time()) + SESSION_SECONDS)
    return f"{expires_at}.{_sign(expires_at)}"


def token_is_valid(token: str | None, now: float | None = None) -> bool:
    if not token or "." not in token:
        return False
    expiry, _, signature = token.partition(".")
    if not expiry.isdigit():
        return False
    # Compare before checking the clock, and with compare_digest, so a wrong
    # signature and an expired one take the same path.
    if not hmac.compare_digest(signature, _sign(int(expiry))):
        return False
    return int(expiry) > (now if now is not None else time.time())


def password_matches(attempt: str) -> bool:
    expected = configured_password()
    if expected is None:
        return True
    return hmac.compare_digest(attempt.encode(), expected.encode())


def require_session(scheduler_session: str | None = Cookie(default=None)) -> None:
    """Dependency guarding every write. Open when no password is configured."""
    if configured_password() is None:
        return
    if not token_is_valid(scheduler_session):
        raise HTTPException(401, "sign in required")
