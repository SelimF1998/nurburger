from app.services.flags import is_enabled, rollout_hash


def test_hash_is_stable_and_in_range() -> None:
    value = rollout_hash("new-checkout", "user-1")
    assert value == rollout_hash("new-checkout", "user-1")
    assert 0 <= value < 1


def test_inactive_or_zero_is_off() -> None:
    assert not is_enabled(False, 100, "f", "u")
    assert not is_enabled(True, 0, "f", "u")


def test_full_rollout_is_on() -> None:
    assert is_enabled(True, 100, "f", "u")


def test_partial_rollout_matches_percentage() -> None:
    enabled = sum(is_enabled(True, 30, "beta", f"user-{i}") for i in range(10_000))
    assert 2700 < enabled < 3300


def test_rollout_is_monotonic() -> None:
    # Growing the rollout never turns a user off.
    users = [f"user-{i}" for i in range(500)]
    at_20 = {u for u in users if is_enabled(True, 20, "beta", u)}
    at_50 = {u for u in users if is_enabled(True, 50, "beta", u)}
    assert at_20 <= at_50
