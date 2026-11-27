"""transcribe(): speech -> text through the Wispr Flow API (https://api-docs.wisprflow.ai).

The API key stays on the server; the browser sends 16 kHz WAV (base64) to /api/transcribe.
The shop's item and party names go along as `dictionary_context`, so "Parle-G" and
"Sharma ji" come back spelled the way the shop writes them. Without a key the route answers
503 and the frontend falls back to the browser's own speech recognition (D6).
"""

from dataclasses import dataclass

import httpx

from app.config import settings

MAX_AUDIO_BYTES = 25 * 1024 * 1024  # Wispr limit: 25 MB or 6 minutes


class SpeechError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


@dataclass
class Transcript:
    text: str
    detected_language: str | None
    total_time_ms: int | None


def transcribe(
    audio_b64: str,
    languages: list[str],
    dictionary: list[str],
    client: httpx.Client | None = None,
) -> Transcript:
    if not settings.wispr_configured:
        raise SpeechError(503, "Wispr Flow key not set (WISPR_API_KEY).")
    body: dict = {
        "audio": audio_b64,
        "context": {
            "app": {"name": "Galla", "type": "other"},
            "dictionary_context": dictionary,
            "textbox_contents": {"before_text": "", "selected_text": "", "after_text": ""},
        },
    }
    if languages:
        body["language"] = languages
    own = client is None
    client = client or httpx.Client(timeout=httpx.Timeout(45.0, connect=10.0))
    try:
        res = client.post(
            settings.wispr_api_url,
            json=body,
            headers={"Authorization": f"Bearer {settings.wispr_api_key}"},
        )
    except httpx.HTTPError as e:
        raise SpeechError(502, f"Wispr Flow not reachable: {type(e).__name__}") from e
    finally:
        if own:
            client.close()

    if res.status_code == 401:
        raise SpeechError(502, "Wispr Flow rejected the key (check WISPR_API_KEY).")
    if res.status_code == 413:
        raise SpeechError(413, "Recording too long (Wispr limit is 6 minutes / 25 MB).")
    if res.status_code >= 400:
        try:
            detail = res.json().get("detail", res.text)
        except ValueError:
            detail = res.text
        raise SpeechError(502, f"Wispr Flow error {res.status_code}: {str(detail)[:200]}")
    data = res.json()
    return Transcript(
        text=(data.get("text") or "").strip(),
        detected_language=data.get("detected_language"),
        total_time_ms=data.get("total_time"),
    )
