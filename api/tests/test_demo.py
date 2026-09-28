from collections import Counter
from datetime import UTC, datetime

from app.demo import fixtures
from app.demo.generator import FLAGS, INCIDENT_DAYS_AGO, LAUNCH_DAYS_AGO, Profile, generate
from app.schemas import InsightCreate
from app.services.sql import validate_sql

NOW = datetime(2026, 9, 28, 15, 0, tzinfo=UTC)


def test_generator_is_deterministic_and_bounded() -> None:
    a = list(generate(NOW, users=150))
    b = list(generate(NOW, users=150))
    assert a == b
    assert all(e["timestamp"] <= NOW for e in a)
    assert all(e["properties"]["plan"] in {"free", "pro", "team"} for e in a)


def test_generator_has_the_story_in_it() -> None:
    events = list(generate(NOW, users=1500))
    days = lambda name: Counter((NOW - e["timestamp"]).days for e in events if e["event"] == name)
    signups = days("signed_up")
    assert signups[LAUNCH_DAYS_AGO] > 2 * signups[LAUNCH_DAYS_AGO + 3]
    errors = days("$exception")
    assert errors[INCIDENT_DAYS_AGO] > 3 * errors[INCIDENT_DAYS_AGO + 3]
    assert any(e["event"] == "subscription_started" for e in events)


def test_profiles_are_stable() -> None:
    assert Profile.for_id("usr_00042") == Profile.for_id("usr_00042")


def test_fixtures_are_valid() -> None:
    for name, (description, query, viz) in fixtures.INSIGHTS.items():
        InsightCreate.model_validate(
            {"name": name, "description": description, "query": query, "viz": viz}
        )
        if query["kind"] == "sql":
            validate_sql(query["sql"])
    names = set(fixtures.INSIGHTS)
    for _, _, tiles in fixtures.DASHBOARDS:
        assert {t for t, _ in tiles} <= names
    assert set(FLAGS)
