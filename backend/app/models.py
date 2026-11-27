"""Database tables. Portable across SQLite and Postgres: lists and dicts use JSON, not ARRAY/JSONB."""

from datetime import UTC, date, datetime

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(UTC)


class Shop(Base):
    __tablename__ = "shops"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    vpa: Mapped[str] = mapped_column(String(120))  # UPI ID, e.g. shop@upi
    language: Mapped[str] = mapped_column(String(10), default="hi")
    opening_cash: Mapped[int] = mapped_column(Integer, default=0)


class Item(Base):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    variant: Mapped[str | None] = mapped_column(String(60))
    unit: Mapped[str] = mapped_column(String(20))  # pc, kg, litre, packet
    price: Mapped[int] = mapped_column(Integer)  # rupees per unit
    aliases: Mapped[list[str]] = mapped_column(JSON, default=list)


class Party(Base):
    __tablename__ = "parties"

    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(10))  # customer | supplier
    phone: Mapped[str | None] = mapped_column(String(20))
    aliases: Mapped[list[str]] = mapped_column(JSON, default=list)


class Entry(Base):
    """A saved khata entry. Entries are never deleted: undo and edits add a reversal."""

    __tablename__ = "entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True)
    type: Mapped[str] = mapped_column(String(20))
    party_id: Mapped[int | None] = mapped_column(ForeignKey("parties.id"))
    items: Mapped[list[dict]] = mapped_column(JSON, default=list)
    amount: Mapped[int] = mapped_column(Integer)
    paid_now: Mapped[int | None] = mapped_column(Integer)
    mode: Mapped[str | None] = mapped_column(String(10))
    due_date: Mapped[date | None] = mapped_column(Date)
    raw_text: Mapped[str] = mapped_column(Text, default="")
    confidence: Mapped[dict] = mapped_column(JSON, default=dict)
    source: Mapped[str] = mapped_column(String(10), default="rules")  # rules | llm | seed
    edited: Mapped[bool] = mapped_column(default=False)  # for the "zero edits" metric
    reverses_id: Mapped[int | None] = mapped_column(ForeignKey("entries.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class DayClose(Base):
    __tablename__ = "day_close"

    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True)
    date: Mapped[date] = mapped_column(Date)
    opening: Mapped[int] = mapped_column(Integer)
    expected: Mapped[int] = mapped_column(Integer)
    counted: Mapped[int] = mapped_column(Integer)
    difference: Mapped[int] = mapped_column(Integer)
