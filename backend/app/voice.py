"""POST /api/transcribe: the in-app mic's audio -> text via Wispr Flow (app/speech.py)."""

import base64
import binascii

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, speech
from app.db import get_db
from app.deps import current_shop

router = APIRouter(prefix="/api", tags=["voice"])


class TranscribeIn(BaseModel):
    audio: str = Field(min_length=16, description="Base64 of 16 kHz mono WAV")
    language: list[str] = Field(default_factory=list, max_length=4, description="ISO 639-1 codes, e.g. ['hi','en']")


class TranscribeOut(BaseModel):
    text: str
    detected_language: str | None
    source: str = "wispr"


def shop_dictionary(db: Session, shop_id: int, limit: int = 300) -> list[str]:
    """Item and party names (and their aliases) so the shop's own spellings come back."""
    words: list[str] = []
    for i in db.scalars(select(models.Item).where(models.Item.shop_id == shop_id)):
        words += [i.name, *(i.aliases or [])]
    for p in db.scalars(select(models.Party).where(models.Party.shop_id == shop_id)):
        words += [p.name, *(p.aliases or [])]
    seen: dict[str, None] = {}
    for w in words:
        if w and w.strip():
            seen.setdefault(w.strip(), None)
    return list(seen)[:limit]


@router.post("/transcribe", response_model=TranscribeOut)
def transcribe(body: TranscribeIn, db: Session = Depends(get_db), shop: models.Shop = Depends(current_shop)) -> TranscribeOut:
    try:
        raw = base64.b64decode(body.audio, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(400, "audio must be base64") from None
    if len(raw) > speech.MAX_AUDIO_BYTES:
        raise HTTPException(413, "Recording too long (Wispr limit is 6 minutes / 25 MB).")
    if raw[:4] != b"RIFF" or raw[8:12] != b"WAVE":
        raise HTTPException(400, "audio must be a WAV file")
    langs = [code.lower() for code in body.language if len(code) == 2 and code.isalpha()]
    try:
        out = speech.transcribe(body.audio, langs, shop_dictionary(db, shop.id))
    except speech.SpeechError as e:
        raise HTTPException(e.status, e.detail) from None
    return TranscribeOut(text=out.text, detected_language=out.detected_language)
