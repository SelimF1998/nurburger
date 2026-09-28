"""Synthetic event stream for the demo SaaS product "Acme Tasks".

Pure and deterministic for a given (now, seed): no I/O. It simulates users who find
the marketing site, sign up, go through onboarding, use the product with decaying
retention, upgrade, churn and hit errors. It also includes two events that stand out
in charts:

- a Product Hunt launch 45 days ago (signup spike, mostly from producthunt), and
- an incident 12 days ago (a burst of TimeoutError exceptions).
"""

import hashlib
import math
import random
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from app.services.flags import is_enabled

DAYS = 90
LAUNCH_DAYS_AGO = 45
INCIDENT_DAYS_AGO = 12

# Flags seeded into the demo project: key -> (active, rollout %, description)
FLAGS: dict[str, tuple[bool, int, str]] = {
    "new-onboarding": (
        True,
        50,
        "Redesigned 3-step onboarding checklist. A/B test vs. the old flow.",
    ),
    "ai-assistant": (True, 15, "AI task assistant in the editor. Early access rollout."),
    "command-palette": (True, 100, "⌘K command palette. Fully launched."),
    "dark-mode": (True, 100, "Dark theme toggle in settings."),
    "billing-v2": (False, 0, "New Stripe billing portal. Not started yet."),
}

SOURCES = [
    ("google", 30),
    ("direct", 22),
    ("twitter", 12),
    ("linkedin", 9),
    ("newsletter", 8),
    ("producthunt", 4),
    ("github", 7),
    ("reddit", 8),
]
COUNTRIES = [
    ("US", 34),
    ("GB", 9),
    ("DE", 9),
    ("FR", 8),
    ("IN", 10),
    ("BR", 6),
    ("CA", 5),
    ("DZ", 4),
    ("NL", 4),
    ("JP", 4),
    ("ES", 4),
    ("AU", 3),
]
BROWSERS = [("Chrome", 62), ("Safari", 20), ("Firefox", 8), ("Edge", 8), ("Arc", 2)]
DEVICES = [("desktop", 78), ("mobile", 17), ("tablet", 5)]
COMPANY_SIZES = [("1", 30), ("2-10", 38), ("11-50", 20), ("51-200", 9), ("200+", 3)]
MARKETING_PAGES = [
    "/",
    "/",
    "/pricing",
    "/features",
    "/blog/async-standups",
    "/blog/okr-templates",
    "/changelog",
    "/customers",
]
APP_PAGES = [
    "/app",
    "/app/inbox",
    "/app/my-tasks",
    "/app/projects",
    "/app/projects/roadmap",
    "/app/settings",
    "/app/search",
]
INTEGRATIONS = ["github", "slack", "figma", "google-calendar", "linear-import"]
ERROR_TYPES = [
    ("TypeError", 40),
    ("NetworkError", 25),
    ("ValidationError", 20),
    ("ChunkLoadError", 15),
]
CHURN_REASONS = ["too_expensive", "missing_features", "switched_tool", "team_disbanded", "other"]
HOUR_WEIGHTS = [1, 1, 1, 1, 1, 2, 3, 5, 8, 10, 11, 10, 8, 9, 10, 10, 9, 7, 5, 4, 3, 2, 2, 1]
PRICES = {
    ("pro", "monthly"): 12,
    ("pro", "yearly"): 120,
    ("team", "monthly"): 29,
    ("team", "yearly"): 290,
}

Event = dict[str, Any]


def _pick(rng: random.Random, weighted: list[tuple[str, int]]) -> str:
    return rng.choices([v for v, _ in weighted], [w for _, w in weighted])[0]


def app_version(ts: datetime, now: datetime) -> str:
    days_ago = (now - ts).days
    return "2.3.0" if days_ago > 60 else "2.4.0" if days_ago > 25 else "2.5.1"


@dataclass
class Profile:
    """Stable attributes of a user, derived from their ID alone."""

    id: str
    source: str
    country: str
    browser: str
    os: str
    device: str
    company_size: str
    engagement: float
    signup_method: str

    @classmethod
    def for_id(cls, user_id: str, source: str | None = None) -> "Profile":
        rng = random.Random(int(hashlib.md5(user_id.encode()).hexdigest()[:12], 16))
        device = _pick(rng, DEVICES)
        browser = _pick(rng, BROWSERS)
        if device == "desktop":
            os = rng.choices(["Mac OS X", "Windows", "Linux"], [48, 42, 10])[0]
        else:
            os = rng.choices(["iOS", "Android"], [55, 45])[0]
            browser = "Mobile Safari" if os == "iOS" else "Chrome Mobile"
        return cls(
            id=user_id,
            source=source or _pick(rng, SOURCES),
            country=_pick(rng, COUNTRIES),
            browser=browser,
            os=os,
            device=device,
            company_size=_pick(rng, COMPANY_SIZES),
            # Heavy-tailed: most users are casual, a few are power users.
            engagement=min(2.5, rng.lognormvariate(-0.15, 0.55)),
            signup_method=rng.choices(["google", "email", "github"], [58, 30, 12])[0],
        )

    def props(self) -> dict[str, Any]:
        return {
            "$browser": self.browser,
            "$os": self.os,
            "$device_type": self.device,
            "$country": self.country,
        }

    def flag(self, key: str) -> bool:
        active, pct, _ = FLAGS[key]
        return is_enabled(active, pct, key, self.id)


class _Session:
    """Accumulates the events of one visit, advancing a clock between them."""

    def __init__(
        self, user: Profile, start: datetime, now: datetime, rng: random.Random, extra: dict
    ):
        self.user, self.ts, self.now, self.rng = user, start, now, rng
        self.extra = extra
        self.events: list[Event] = []

    def emit(
        self, event: str, props: dict[str, Any] | None = None, gap: tuple[int, int] = (8, 90)
    ) -> None:
        self.ts += timedelta(seconds=self.rng.randint(*gap))
        if self.ts > self.now:
            return
        self.events.append(
            {
                "event": event,
                "distinct_id": self.user.id,
                "timestamp": self.ts,
                "properties": {
                    **self.user.props(),
                    **self.extra,
                    "app_version": app_version(self.ts, self.now),
                    **(props or {}),
                },
            }
        )

    def pageview(self, path: str, **props: Any) -> None:
        self.emit(
            "$pageview",
            {"$pathname": path, "$current_url": f"https://acmetasks.app{path}", **props},
        )


def _session_start(day: datetime, rng: random.Random) -> datetime:
    hour = rng.choices(range(24), HOUR_WEIGHTS)[0]
    return day + timedelta(hours=hour, minutes=rng.randint(0, 59), seconds=rng.randint(0, 59))


def product_session(
    user: Profile, start: datetime, now: datetime, rng: random.Random, state: dict
) -> list[Event]:
    """One visit of an existing user: navigate, work on tasks, maybe hit an error."""
    s = _Session(user, start, now, rng, {"plan": state["plan"]})
    e = user.engagement
    s.pageview(rng.choice(APP_PAGES[:3]), gap=(0, 5))
    if user.flag("command-palette") and rng.random() < 0.35:
        s.emit("command_palette_opened", {"flag": "command-palette"})
    for _ in range(max(0, round(rng.gauss(2.2 * e, 1.2)))):
        s.emit(
            "task_created",
            {
                "priority": rng.choices(
                    ["none", "low", "medium", "high", "urgent"], [30, 20, 25, 18, 7]
                )[0],
                "has_due_date": rng.random() < 0.4,
            },
        )
    for _ in range(max(0, round(rng.gauss(1.8 * e, 1.1)))):
        s.emit("task_completed", {"time_to_complete_hours": round(rng.expovariate(1 / 30), 1)})
    if rng.random() < 0.45:
        s.pageview(rng.choice(APP_PAGES))
    if rng.random() < 0.3 * e:
        s.emit("comment_added", {"length": rng.randint(8, 400), "has_mention": rng.random() < 0.3})
    if rng.random() < 0.25:
        s.emit("search_performed", {"results_count": max(0, int(rng.gauss(9, 7)))})
    if rng.random() < 0.05 * e:
        s.emit(
            "project_created", {"template": rng.choice(["blank", "kanban", "roadmap", "sprint"])}
        )
    if state["plan"] == "team" and rng.random() < 0.08:
        s.emit("invite_sent", {"role": rng.choice(["member", "member", "admin"])})
    if not state.get("integrated") and rng.random() < 0.04 * e:
        state["integrated"] = True
        s.emit("integration_connected", {"integration": rng.choice(INTEGRATIONS)})
    if user.flag("ai-assistant") and rng.random() < 0.5:
        for _ in range(rng.randint(1, 4)):
            s.emit(
                "ai_assistant_used",
                {
                    "action": rng.choice(
                        ["summarize", "break_down_task", "draft_update", "estimate"]
                    ),
                    "tokens": rng.randint(200, 3000),
                },
            )

    days_ago = (now - start).total_seconds() / 86400
    incident = abs(days_ago - INCIDENT_DAYS_AGO) < 0.6
    if rng.random() < (0.35 if incident else 0.025):
        kind = "TimeoutError" if incident and rng.random() < 0.8 else _pick(rng, ERROR_TYPES)
        s.emit(
            "$exception",
            {
                "type": kind,
                "message": f"{kind} in {rng.choice(['TaskList', 'Editor', 'Sync', 'Search'])}",
                "$pathname": rng.choice(APP_PAGES),
            },
        )
    return s.events


def signup_session(
    user: Profile, start: datetime, now: datetime, rng: random.Random, state: dict
) -> list[Event]:
    """Marketing site visit, then signup and onboarding (the new flow converts better)."""
    s = _Session(user, start, now, rng, {"plan": "free"})
    utm = {
        "utm_source": user.source,
        "utm_medium": "social" if user.source in ("twitter", "linkedin", "reddit") else "organic",
    }
    s.pageview(
        rng.choice(MARKETING_PAGES),
        gap=(0, 1),
        **utm,
        **({"$referrer": f"https://{user.source}.com"} if user.source != "direct" else {}),
    )
    for _ in range(rng.randint(0, 3)):
        s.pageview(rng.choice(MARKETING_PAGES))
    s.pageview("/signup")
    s.emit(
        "signed_up",
        {"method": user.signup_method, "source": user.source, "company_size": user.company_size},
    )

    new_flow = user.flag("new-onboarding")
    s.emit(
        "$feature_flag_called",
        {"$feature_flag": "new-onboarding", "$feature_flag_response": new_flow},
        gap=(0, 2),
    )
    steps = (
        ["create_project", "add_tasks", "invite_team"]
        if new_flow
        else ["profile", "create_project", "add_tasks", "invite_team"]
    )
    base = 0.86 if new_flow else 0.74
    completed = True
    for i, step in enumerate(steps):
        if rng.random() > base + 0.04 * i:
            completed = False
            break
        s.emit(
            "onboarding_step_completed",
            {"step": step, "step_number": i + 1, "flow": "v2" if new_flow else "v1"},
            gap=(20, 240),
        )
    if completed:
        s.emit("onboarding_completed", {"flow": "v2" if new_flow else "v1"})
        state["activated"] = True
    s.events.extend(product_session(user, s.ts, now, rng, state))
    return s.events


def _upgrade(
    user: Profile, start: datetime, now: datetime, rng: random.Random, state: dict
) -> list[Event]:
    s = _Session(user, start, now, rng, {"plan": state["plan"]})
    s.pageview("/app/settings/billing", gap=(0, 5))
    s.emit("pricing_viewed", {"from": rng.choice(["limit_banner", "settings", "invite_modal"])})
    if rng.random() < 0.72:
        plan = "team" if user.company_size not in ("1", "2-10") or rng.random() < 0.2 else "pro"
        period = "yearly" if rng.random() < 0.3 else "monthly"
        s.emit("checkout_started", {"plan": plan, "billing_period": period})
        if rng.random() < 0.8:
            s.emit(
                "subscription_started",
                {
                    "plan": plan,
                    "billing_period": period,
                    "amount": PRICES[(plan, period)],
                    "currency": "USD",
                },
                gap=(30, 180),
            )
            state["plan"] = plan
    return s.events


def _churn(
    user: Profile, start: datetime, now: datetime, rng: random.Random, state: dict
) -> list[Event]:
    s = _Session(user, start, now, rng, {"plan": state["plan"]})
    s.pageview("/app/settings/billing", gap=(0, 5))
    s.emit("subscription_cancelled", {"plan": state["plan"], "reason": rng.choice(CHURN_REASONS)})
    state["plan"] = "free"
    state["churned"] = True
    return s.events


def _signup_day_weight(days_ago: int, day: datetime) -> float:
    growth = 1 + 1.6 * (DAYS - days_ago) / DAYS  # traffic grows ~2.6x over the window
    weekend = 0.55 if day.weekday() >= 5 else 1.0
    launch = 5.0 if days_ago == LAUNCH_DAYS_AGO else 2.2 if days_ago == LAUNCH_DAYS_AGO - 1 else 1.0
    return growth * weekend * launch


def generate(now: datetime, users: int = 3800, seed: int = 42) -> Iterator[Event]:
    """Yields events (unsorted) for `users` signups over the last DAYS days."""
    rng = random.Random(seed)
    today = now.astimezone(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    days = [today - timedelta(days=d) for d in range(DAYS)]
    weights = [_signup_day_weight(d, day) for d, day in enumerate(days)]

    for n in range(users):
        signup_idx = rng.choices(range(DAYS), weights)[0]
        day = days[signup_idx]
        source = (
            "producthunt"
            if signup_idx in (LAUNCH_DAYS_AGO, LAUNCH_DAYS_AGO - 1) and rng.random() < 0.7
            else None
        )
        user = Profile.for_id(f"usr_{n:05d}", source)
        state: dict[str, Any] = {"plan": "free"}
        yield from signup_session(user, _session_start(day, rng), now, rng, state)

        # Retention: chance of coming back on day d decays like d^-0.5, scaled by engagement.
        activated = 1.0 if state.get("activated") else 0.45
        for d in range(1, signup_idx + 1):
            if state.get("churned") and rng.random() < 0.9:
                continue
            paid = state["plan"] != "free"
            day_n = days[signup_idx - d]
            weekend = 0.45 if day_n.weekday() >= 5 else 1.0
            p = min(
                0.95,
                user.engagement
                * activated
                * weekend
                * (0.12 + 0.55 / math.sqrt(d))
                * (1.5 if paid else 1.0),
            )
            if rng.random() > p:
                continue
            start = _session_start(day_n, rng)
            yield from product_session(user, start, now, rng, state)
            if not paid and d >= 2 and rng.random() < 0.02 * user.engagement:
                yield from _upgrade(
                    user, start + timedelta(minutes=rng.randint(5, 50)), now, rng, state
                )
            elif paid and rng.random() < 0.006:
                yield from _churn(
                    user, start + timedelta(minutes=rng.randint(5, 50)), now, rng, state
                )


def live_session(start: datetime, rng: random.Random, known_users: int) -> list[Event]:
    """A session beginning at `start`. Timestamps run into the future; the caller
    inserts each event once its time arrives, so sessions unfold in real time."""
    horizon = start + timedelta(hours=2)
    if rng.random() < 0.08:
        user = Profile.for_id(f"usr_live_{rng.getrandbits(40):010x}")
        return signup_session(user, start, horizon, rng, {"plan": "free"})
    # Favour recent signups, like real traffic.
    n = known_users - 1 - min(known_users - 1, int(rng.expovariate(1 / (known_users / 4))))
    user = Profile.for_id(f"usr_{n:05d}")
    plan = rng.choices(["free", "pro", "team"], [72, 20, 8])[0]
    return product_session(user, start, horizon, rng, {"plan": plan})
