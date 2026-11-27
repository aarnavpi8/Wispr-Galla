from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.db import Base, SessionLocal, engine, get_db
from app.schemas import ShopSummary
from app.seed import seed_if_empty


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    if settings.seed_on_start:
        with SessionLocal() as db:
            seed_if_empty(db)
    yield


app = FastAPI(title="Galla API", lifespan=lifespan)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "llm_configured": settings.llm_configured}


@app.get("/api/shop", response_model=ShopSummary)
def shop(db: Session = Depends(get_db)) -> ShopSummary:
    shop = db.scalar(select(models.Shop).order_by(models.Shop.id).limit(1))
    if shop is None:
        raise HTTPException(404, "No shop set up yet. Run: python -m app.seed")

    def count(model, *where) -> int:
        return db.scalar(select(func.count()).select_from(model).where(model.shop_id == shop.id, *where)) or 0

    return ShopSummary(
        id=shop.id,
        name=shop.name,
        vpa=shop.vpa,
        language=shop.language,
        items=count(models.Item),
        customers=count(models.Party, models.Party.kind == "customer"),
        suppliers=count(models.Party, models.Party.kind == "supplier"),
        entries=count(models.Entry),
        llm_configured=settings.llm_configured,
    )
