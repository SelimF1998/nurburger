"""Runs user-written SQL against a project's events.

Defense in depth:
1. sqlglot parses the query: exactly one read-only statement, only the `events`
   table (or the query's own CTEs), and no dangerous functions.
2. It executes in a READ ONLY transaction with a statement timeout, as the
   `nurburger_query` role, which can only SELECT from `query.events`.
3. `query.events` is a security-barrier view filtered by a transaction-local
   setting holding the project id. The function denylist stops queries from
   changing that setting.
"""

import json
import time
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

import asyncpg
import sqlglot
from sqlglot import exp
from sqlglot.errors import ParseError

from app.config import settings
from app.db import engine
from app.schemas import SqlResult

ALLOWED_TABLES = {"events"}
DENIED_FUNCTION_PREFIXES = (
    "pg_",
    "set_config",
    "current_setting",
    "query_to_",
    "table_to_",
    "cursor_to_",
    "schema_to_",
    "database_to_",
    "dblink",
    "lo_",
    "txid_",
    "has_",
)
_FORBIDDEN_NODES = (
    exp.Insert,
    exp.Update,
    exp.Delete,
    exp.Merge,
    exp.Create,
    exp.Drop,
    exp.Alter,
    exp.Command,
    exp.Set,
    exp.Into,
    exp.Lock,
)


class SqlError(ValueError):
    pass


def _function_name(node: exp.Func) -> str:
    if isinstance(node, exp.Anonymous):
        return str(node.name).lower()
    return node.sql_name().lower()


def validate_sql(sql: str) -> str:
    """Returns the cleaned SQL or raises SqlError explaining why it's not allowed."""
    sql = sql.strip().rstrip(";").strip()
    try:
        statements = [s for s in sqlglot.parse(sql, read="postgres") if s is not None]
    except ParseError as e:
        raise SqlError(f"Could not parse query: {e.errors[0]['description'] if e.errors else e}")
    if len(statements) != 1:
        raise SqlError("Run exactly one statement at a time")
    stmt = statements[0]
    if not isinstance(stmt, exp.Query):
        raise SqlError("Only SELECT queries are allowed")

    for node in stmt.walk():
        if isinstance(node, _FORBIDDEN_NODES):
            raise SqlError("Only read-only SELECT queries are allowed")
        if isinstance(node, exp.Func):
            name = _function_name(node)
            if name.startswith(DENIED_FUNCTION_PREFIXES):
                raise SqlError(f"Function {name}() is not allowed")

    cte_names = {cte.alias_or_name.lower() for cte in stmt.find_all(exp.CTE)}
    for table in stmt.find_all(exp.Table):
        if isinstance(table.this, exp.Func):  # table functions like generate_series()
            continue
        if table.db or table.catalog:
            raise SqlError("Schema-qualified tables are not allowed; query `events` directly")
        name = table.name.lower()
        if name not in ALLOWED_TABLES and name not in cte_names:
            raise SqlError(f"Unknown table {table.name!r}. Available tables: events")
    return sql


def _jsonable(value: Any, type_name: str) -> Any:
    if value is None:
        return None
    if type_name in ("json", "jsonb") and isinstance(value, str):
        try:
            return json.loads(value)
        except ValueError:
            return value
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, dict | list | str | int | float | bool):
        return value
    return str(value)


async def run_sql(project_id: uuid.UUID, sql: str) -> SqlResult:
    sql = validate_sql(sql)
    started = time.perf_counter()
    async with engine.connect() as conn:
        raw = await conn.get_raw_connection()
        pg: asyncpg.Connection = raw.driver_connection  # type: ignore[assignment]
        try:
            async with pg.transaction(readonly=True):
                await pg.execute(f"SET LOCAL statement_timeout = {int(settings.sql_timeout_ms)}")
                await pg.execute(
                    "SELECT set_config('nurburger.project_id', $1, true)", str(project_id)
                )
                await pg.execute("SET LOCAL search_path = query")
                await pg.execute("SET LOCAL ROLE nurburger_query")
                prepared = await pg.prepare(sql)
                attributes = prepared.get_attributes()
                cursor = await prepared.cursor()
                records = await cursor.fetch(settings.sql_max_rows + 1)
        except asyncpg.exceptions.QueryCanceledError as e:
            raise SqlError(f"Query timed out after {settings.sql_timeout_ms / 1000:.0f}s") from e
        except asyncpg.PostgresError as e:
            raise SqlError(str(e).strip()) from e

    truncated = len(records) > settings.sql_max_rows
    records = records[: settings.sql_max_rows]
    types = [a.type.name for a in attributes]
    rows = [[_jsonable(v, types[i]) for i, v in enumerate(r)] for r in records]
    return SqlResult(
        columns=[a.name for a in attributes],
        rows=rows,
        truncated=truncated,
        elapsed_ms=int((time.perf_counter() - started) * 1000),
    )
