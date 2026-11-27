"""Shared route helpers."""

from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.db import get_db
from app.identity import request_owner


def current_owner(request: Request) -> str | None:
    return request_owner(request)


def shop_of(db: Session, owner: str | None) -> models.Shop | None:
    """The caller's shop. Every account / browser only ever sees its own."""
    where = models.Shop.owner == owner if owner is not None else models.Shop.owner.is_(None)
    return db.scalar(select(models.Shop).where(where).order_by(models.Shop.id).limit(1))


def current_shop(db: Session = Depends(get_db), owner: str | None = Depends(current_owner)) -> models.Shop:
    shop = shop_of(db, owner)
    if shop is None:
        raise HTTPException(404, "No shop set up yet.")
    return shop


def iso(dt: datetime | None) -> str | None:
    """ISO string in shop time. SQLite drops tzinfo; we always store UTC."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo("UTC"))
    return dt.astimezone(settings.tz).isoformat()
