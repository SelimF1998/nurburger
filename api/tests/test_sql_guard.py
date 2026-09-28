import pytest

from app.services.sql import SqlError, validate_sql


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT count(*) FROM events",
        "select event, count(*) from events group by 1 order by 2 desc;",
        "SELECT properties->>'plan' AS plan, count(DISTINCT distinct_id) FROM events GROUP BY 1",
        (
            "WITH daily AS (SELECT date_trunc('day', timestamp) d, count(*) c FROM events GROUP BY 1) "
            "SELECT * FROM daily ORDER BY d"
        ),
        "SELECT * FROM generate_series(1, 3)",
        "SELECT event FROM events UNION ALL SELECT distinct_id FROM events",
        "SELECT (properties->>'amount')::numeric FROM events WHERE event = 'purchase'",
    ],
)
def test_allows_read_queries(sql: str) -> None:
    validate_sql(sql)


@pytest.mark.parametrize(
    ("sql", "message"),
    [
        ("DELETE FROM events", "Only"),
        ("SELECT 1; SELECT 2", "exactly one"),
        ("SELECT * FROM users", "Unknown table"),
        ("SELECT * FROM public.events", "Schema-qualified"),
        ("SELECT * FROM pg_catalog.pg_class", "Schema-qualified"),
        ("SELECT * FROM pg_class", "Unknown table"),
        ("SELECT set_config('nurburger.project_id', 'x', true)", "set_config"),
        ("SELECT current_setting('nurburger.project_id')", "current_setting"),
        ("SELECT pg_sleep(100)", "pg_sleep"),
        ("SELECT query_to_xml('select 1', true, true, '')", "query_to_xml"),
        ("SELECT * INTO copied FROM events", "read-only"),
        ("UPDATE events SET event = 'x'", "Only"),
    ],
)
def test_rejects_unsafe_queries(sql: str, message: str) -> None:
    with pytest.raises(SqlError, match=message):
        validate_sql(sql)
