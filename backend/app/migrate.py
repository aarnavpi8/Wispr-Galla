"""Tiny additive migrations, run on every start.

`create_all` makes missing tables but never adds columns to existing ones, so databases
created before a column existed (a teammate's SQLite file, the Docker Postgres volume)
get them here. Only ever ADD columns with defaults; never drop or rename.
"""

from sqlalchemy import Engine, inspect, text

# (table, column, SQL type + default) — portable across SQLite and Postgres.
COLUMNS = [
    ("shops", "kind", "VARCHAR(20) NOT NULL DEFAULT 'kirana'"),
    ("items", "stock", "INTEGER NOT NULL DEFAULT 0"),
    ("items", "low_stock_at", "INTEGER NOT NULL DEFAULT 5"),
]


def add_missing_columns(engine: Engine) -> list[str]:
    added: list[str] = []
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    with engine.begin() as conn:
        for table, column, ddl in COLUMNS:
            if table not in tables:
                continue
            existing = {c["name"] for c in insp.get_columns(table)}
            if column not in existing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
                added.append(f"{table}.{column}")
    return added
