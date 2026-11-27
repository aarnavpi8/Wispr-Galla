"""The stock book: every stock change goes through record_move(), so stock, the weighted-average
cost and the history can never disagree.

Weighted-average cost (WAC): when stock comes in at a known cost, the item's cost becomes
    (old_stock x old_cost + qty_in x cost_in) / new_stock
Stock going out (sale, wastage) is valued at the current average cost; that is the cost of
goods sold (COGS) used by the inventory account.
"""

from app import models


def record_move(
    db,
    shop_id: int,
    item: models.Item,
    delta: int,
    reason: str,
    unit_cost: int | None = None,
) -> models.StockMove:
    before = item.stock
    if delta > 0 and unit_cost is not None and unit_cost > 0:
        after = before + delta
        if before <= 0 or item.cost_price <= 0:
            item.cost_price = unit_cost
        else:
            item.cost_price = round((before * item.cost_price + delta * unit_cost) / after)
        cost = unit_cost
    else:
        cost = item.cost_price or None
    item.stock = before + delta
    move = models.StockMove(
        shop_id=shop_id, item_id=item.id, delta=delta, reason=reason, stock_after=item.stock, unit_cost=cost
    )
    db.add(move)
    return move
