import base64
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app import speech
from app.config import settings
from app.main import app

WAV = base64.b64encode(b"RIFF\x24\x00\x00\x00WAVEfmt " + b"\x00" * 32).decode()


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_config_reports_wispr_off_without_key(client):
    assert client.get("/api/config").json()["wispr_configured"] is False


def test_transcribe_without_key_is_503(client):
    res = client.post("/api/transcribe", json={"audio": WAV, "language": ["hi"]})
    assert res.status_code == 503
    assert "WISPR_API_KEY" in res.json()["detail"]


def test_rejects_non_wav_and_bad_base64(client, monkeypatch):
    monkeypatch.setattr(settings, "wispr_api_key", "fl-test")
    assert client.post("/api/transcribe", json={"audio": "not base64 at all!!"}).status_code == 400
    mp3 = base64.b64encode(b"ID3" + b"\x00" * 40).decode()
    assert client.post("/api/transcribe", json={"audio": mp3}).status_code == 400


def fake_wispr(handler):
    """Patch speech.transcribe's HTTP client with an in-memory Wispr Flow."""
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_sends_key_audio_languages_and_shop_dictionary(client, monkeypatch):
    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["auth"] = req.headers["authorization"]
        seen["url"] = str(req.url)
        seen["body"] = json.loads(req.content)
        return httpx.Response(200, json={"id": "x", "text": " Sharma ji ne 500 UPI se diye ", "detected_language": "hi", "total_time": 300})

    monkeypatch.setattr(settings, "wispr_api_key", "fl-test")
    real = speech.transcribe
    monkeypatch.setattr(speech, "transcribe", lambda a, l, d: real(a, l, d, client=fake_wispr(handler)))

    res = client.post("/api/transcribe", json={"audio": WAV, "language": ["hi", "EN", "hinglish"]})
    assert res.status_code == 200
    assert res.json() == {"text": "Sharma ji ne 500 UPI se diye", "detected_language": "hi", "source": "wispr"}
    assert seen["auth"] == "Bearer fl-test"
    assert seen["url"] == "https://platform-api.wisprflow.ai/api/v1/dash/api"
    assert seen["body"]["audio"] == WAV
    assert seen["body"]["language"] == ["hi", "en"]  # only real 2-letter codes go through
    words = seen["body"]["context"]["dictionary_context"]
    assert "Parle-G" in words and "Sharma ji" in words and "parlay" in words


@pytest.mark.parametrize(
    "status, expect",
    [(401, 502), (413, 413), (500, 502)],
)
def test_wispr_errors_become_clear_messages(client, monkeypatch, status, expect):
    monkeypatch.setattr(settings, "wispr_api_key", "fl-test")
    real = speech.transcribe
    handler = lambda req: httpx.Response(status, json={"detail": "boom"})  # noqa: E731
    monkeypatch.setattr(speech, "transcribe", lambda a, l, d: real(a, l, d, client=fake_wispr(handler)))
    res = client.post("/api/transcribe", json={"audio": WAV})
    assert res.status_code == expect
    assert res.json()["detail"]


def test_network_failure_is_502(client, monkeypatch):
    monkeypatch.setattr(settings, "wispr_api_key", "fl-test")

    def handler(req):
        raise httpx.ConnectError("down")

    real = speech.transcribe
    monkeypatch.setattr(speech, "transcribe", lambda a, l, d: real(a, l, d, client=fake_wispr(handler)))
    res = client.post("/api/transcribe", json={"audio": WAV})
    assert res.status_code == 502
    assert "not reachable" in res.json()["detail"]
