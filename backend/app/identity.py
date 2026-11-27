"""Who is calling: decides which shop a request sees.

- Signed in with Google (Firebase): the browser sends `Authorization: Bearer <ID token>`.
  We ask Firebase to check the token (accounts:lookup with the project's web API key, so a
  token from another project fails) and use the account's uid: owner "google:<uid>".
- Not signed in: the browser sends `X-Galla-Device: <random id>` that it keeps in
  localStorage, so each browser/phone gets its own private shop: owner "device:<id>".
- Neither (curl, old clients, tests): owner None, the old shared shop.

Checked tokens are cached until shortly before they expire, so a page load doesn't call
Firebase once per request.
"""

import hashlib
import re
import threading
import time

import httpx
from fastapi import HTTPException, Request

from app.config import settings

LOOKUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup"
DEVICE_ID = re.compile(r"^[A-Za-z0-9_-]{16,64}$")
CACHE_SECONDS = 300

_cache: dict[str, tuple[str, float]] = {}
_lock = threading.Lock()


def verify_firebase_token(token: str, client: httpx.Client | None = None) -> str:
    """-> Firebase uid. Raises 401 for a bad or expired token, 503 if Firebase can't be reached."""
    key = hashlib.sha256(token.encode()).hexdigest()
    now = time.monotonic()
    with _lock:
        hit = _cache.get(key)
        if hit and hit[1] > now:
            return hit[0]
    client = client or httpx.Client(timeout=httpx.Timeout(6.0, connect=4.0))
    try:
        res = client.post(LOOKUP_URL, params={"key": settings.firebase_api_key}, json={"idToken": token})
    except httpx.HTTPError as e:
        raise HTTPException(503, "Login check failed (no connection to Google). Try again.") from e
    if res.status_code != 200:
        raise HTTPException(401, "Login expired. Please sign in again.")
    users = res.json().get("users") or []
    uid = users[0].get("localId") if users else None
    if not uid:
        raise HTTPException(401, "Login expired. Please sign in again.")
    with _lock:
        if len(_cache) > 5000:
            _cache.clear()
        _cache[key] = (uid, now + CACHE_SECONDS)
    return uid


def request_owner(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer ") and settings.firebase_configured:
        token = auth[7:].strip()
        if token:
            return f"google:{verify_firebase_token(token)}"
    device = request.headers.get("x-galla-device", "").strip()
    if device:
        if not DEVICE_ID.match(device):
            raise HTTPException(400, "Bad device id.")
        return f"device:{device}"
    return None
