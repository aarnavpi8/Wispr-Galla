from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from fastapi import Depends, FastAPI, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import accounts, entries_api, inventory, ledger, models, setup, voice
from app.config import settings
from app.db import Base, SessionLocal, engine, get_db
from app.deps import current_shop, iso
from app.migrate import add_missing_columns
from app.schemas import AppConfig, EntryOut, FirebaseWebConfig, PartyBalance, ShopSummary, Summary
from app.seed import seed_if_empty, seed_stock_if_missing


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    add_missing_columns(engine)
    with SessionLocal() as db:
        if settings.seed_on_start:
            seed_if_empty(db)
        seed_stock_if_missing(db)  # only touches the demo shop, if there is one
    yield


app = FastAPI(title="Galla API", lifespan=lifespan)
app.include_router(inventory.router)
app.include_router(accounts.router)
app.include_router(voice.router)
app.include_router(setup.router)
app.include_router(entries_api.router)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "llm_configured": settings.llm_configured}


@app.get("/api/config", response_model=AppConfig)
def config() -> AppConfig:
    """Runtime config for the browser, so one Docker image works with or without keys."""
    firebase = None
    if settings.firebase_configured:
        firebase = FirebaseWebConfig(
            apiKey=settings.firebase_api_key,
            authDomain=settings.firebase_auth_domain,
            projectId=settings.firebase_project_id,
            appId=settings.firebase_app_id,
        )
    return AppConfig(llm_configured=settings.llm_configured, wispr_configured=settings.wispr_configured, firebase=firebase)


@app.get("/api/shop", response_model=ShopSummary)
def shop(db: Session = Depends(get_db), shop: models.Shop = Depends(current_shop)) -> ShopSummary:
    def count(model, *where) -> int:
        return db.scalar(select(func.count()).select_from(model).where(model.shop_id == shop.id, *where)) or 0

    return ShopSummary(
        id=shop.id,
        name=shop.name,
        vpa=shop.vpa,
        language=shop.language,
        kind=shop.kind,
        items=count(models.Item),
        customers=count(models.Party, models.Party.kind == "customer"),
        suppliers=count(models.Party, models.Party.kind == "supplier"),
        entries=count(models.Entry),
        llm_configured=settings.llm_configured,
    )


def _parties(db: Session, shop_id: int) -> list[models.Party]:
    return list(db.scalars(select(models.Party).where(models.Party.shop_id == shop_id).order_by(models.Party.id)))


def _entries(db: Session, shop_id: int) -> list[models.Entry]:
    return list(db.scalars(select(models.Entry).where(models.Entry.shop_id == shop_id)))


@app.get("/api/entries", response_model=list[EntryOut])
def entries(
    limit: int = Query(30, ge=1, le=200),
    party_id: int | None = None,
    db: Session = Depends(get_db),
    shop: models.Shop = Depends(current_shop),
) -> list[EntryOut]:
    names = {p.id: p.name for p in _parties(db, shop.id)}
    # Reversal rows are bookkeeping for undo; the original shows as struck through instead.
    q = select(models.Entry).where(models.Entry.shop_id == shop.id, models.Entry.reverses_id.is_(None))
    if party_id is not None:
        q = q.where(models.Entry.party_id == party_id)
    rows = list(db.scalars(q.order_by(models.Entry.created_at.desc(), models.Entry.id.desc()).limit(limit)))
    reversed_ids = set(
        db.scalars(select(models.Entry.reverses_id).where(models.Entry.reverses_id.is_not(None)))
    )
    return [
        EntryOut(
            id=e.id,
            type=e.type,
            party_id=e.party_id,
            party_name=names.get(e.party_id) if e.party_id else None,
            amount=e.amount,
            paid_now=e.paid_now,
            mode=e.mode,
            due_date=e.due_date,
            raw_text=e.raw_text,
            source=e.source,
            reversed=e.id in reversed_ids,
            created_at=iso(e.created_at) or "",
        )
        for e in rows
    ]


@app.get("/api/khata", response_model=list[PartyBalance])
def khata(db: Session = Depends(get_db), shop: models.Shop = Depends(current_shop)) -> list[PartyBalance]:
    parties = _parties(db, shop.id)
    today = datetime.now(settings.tz).date()
    balances = ledger.party_balances(_entries(db, shop.id), {p.id: p.kind for p in parties}, today)
    out = [
        PartyBalance(
            id=p.id,
            name=p.name,
            kind=p.kind,
            phone=p.phone,
            balance=balances[p.id].balance,
            overdue_since=balances[p.id].overdue_since,
            last_entry_at=iso(balances[p.id].last_entry_at),
        )
        for p in parties
    ]
    # Overdue first, then biggest balance.
    return sorted(out, key=lambda b: (b.overdue_since is None, -b.balance))


@app.get("/api/summary", response_model=Summary)
def summary(
    days: int = Query(7, ge=1, le=60),
    db: Session = Depends(get_db),
    shop: models.Shop = Depends(current_shop),
) -> Summary:
    parties = _parties(db, shop.id)
    kinds = {p.id: p.kind for p in parties}
    today = datetime.now(settings.tz).date()
    window = [today - timedelta(days=i) for i in range(days - 1, -1, -1)]
    all_entries = _entries(db, shop.id)
    totals = ledger.daily_totals(all_entries, window, settings.tz, kinds)
    t = totals[-1]
    balances = ledger.party_balances(all_entries, kinds, today)
    customers = [b for pid, b in balances.items() if kinds[pid] == "customer"]
    return Summary(
        today=t.as_dict(),
        days=[d.as_dict() for d in totals],
        opening_cash=shop.opening_cash,
        expected_cash_today=shop.opening_cash + t.cash_in - t.cash_out,
        udhaar_outstanding=sum(max(b.balance, 0) for b in customers),
        overdue_count=sum(1 for b in customers if b.overdue_since),
    )
