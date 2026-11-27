"""Shared route helpers."""

from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.db import get_db


def current_shop(db: Session = Depends(get_db)) -> models.Shop:
    shop = db.scalar(select(models.Shop).order_by(models.Shop.id).limit(1))
    if shop is None:
        raise HTTPException(404, "No shop set up yet. Run: python -m app.seed")
    return shop


def iso(dt: datetime | None) -> str | None:
    """ISO string in shop time. SQLite drops tzinfo; we always store UTC."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo("UTC"))
    return dt.astimezone(settings.tz).isoformat()
