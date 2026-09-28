from datetime import UTC, datetime

import pytest

from app.services.dates import DateRangeError, buckets, parse_date, truncate

NOW = datetime(2026, 3, 18, 15, 42, tzinfo=UTC)  # a Wednesday


def test_parse_relative() -> None:
    assert parse_date("-24h", NOW) == datetime(2026, 3, 17, 15, 42, tzinfo=UTC)
    assert parse_date("-7d", NOW) == datetime(2026, 3, 11, 15, 42, tzinfo=UTC)
    assert parse_date(None, NOW) == NOW


def test_parse_iso() -> None:
    assert parse_date("2026-01-01", NOW) == datetime(2026, 1, 1, tzinfo=UTC)


def test_parse_invalid() -> None:
    with pytest.raises(DateRangeError):
        parse_date("yesterday", NOW)


def test_truncate() -> None:
    assert truncate(NOW, "hour") == datetime(2026, 3, 18, 15, tzinfo=UTC)
    assert truncate(NOW, "week") == datetime(2026, 3, 16, tzinfo=UTC)
    assert truncate(NOW, "month") == datetime(2026, 3, 1, tzinfo=UTC)


def test_buckets_month_rollover() -> None:
    result = buckets(datetime(2025, 11, 5, tzinfo=UTC), datetime(2026, 2, 1, tzinfo=UTC), "month")
    assert [b.month for b in result] == [11, 12, 1, 2]


def test_bucket_limit() -> None:
    with pytest.raises(DateRangeError):
        buckets(datetime(2020, 1, 1, tzinfo=UTC), NOW, "hour")
