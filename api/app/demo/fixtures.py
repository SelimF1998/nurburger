"""Saved insights and dashboards for the demo project."""

from typing import Any

DashboardSpec = tuple[str, str, list[tuple[str, int]]]  # name, description, [(insight name, width)]


def _trends(series: list[dict], **query: Any) -> dict:
    return {
        "kind": "trends",
        "series": [{"math": "total", "filters": [], **s} for s in series],
        "filters": query.pop("filters", []),
        "breakdown": query.pop("breakdown", None),
        "interval": query.pop("interval", "day"),
        "date_from": query.pop("date_from", "-30d"),
        "date_to": None,
    }


def _sql(sql: str) -> dict:
    return {"kind": "sql", "sql": sql.strip()}


# name -> (description, query, viz)
INSIGHTS: dict[str, tuple[str, dict, dict]] = {
    "Daily active users": (
        "Unique users doing anything, per day.",
        _trends([{"event": None, "math": "unique_users", "label": "Active users"}]),
        {"type": "area"},
    ),
    "Signups vs. activations": (
        "New signups and how many finish onboarding.",
        _trends(
            [
                {"event": "signed_up", "label": "Signed up"},
                {"event": "onboarding_completed", "label": "Completed onboarding"},
            ],
            date_from="-90d",
            interval="week",
        ),
        {"type": "line"},
    ),
    "Signups by source": (
        "Where new users come from. Note the Product Hunt launch.",
        _trends(
            [{"event": "signed_up"}], breakdown="utm_source", date_from="-90d", interval="week"
        ),
        {"type": "bar"},
    ),
    "Pageviews": (
        "Total pageviews across the marketing site and app.",
        _trends([{"event": "$pageview"}], date_from="-90d"),
        {"type": "line"},
    ),
    "New subscriptions (30d)": (
        "Paid subscriptions started in the last 30 days.",
        _trends([{"event": "subscription_started", "label": "New subscriptions"}]),
        {"type": "number"},
    ),
    "New MRR by plan": (
        "Sum of subscription amounts, by plan.",
        _trends(
            [{"event": "subscription_started", "math": "sum", "math_property": "amount"}],
            breakdown="plan",
            date_from="-90d",
            interval="week",
        ),
        {"type": "bar"},
    ),
    "Tasks created vs. completed": (
        "Core engagement: are people getting work done?",
        _trends(
            [
                {"event": "task_created", "label": "Created"},
                {"event": "task_completed", "label": "Completed"},
            ]
        ),
        {"type": "line"},
    ),
    "Errors by type": (
        "Client exceptions. The spike 12 days ago was the sync incident.",
        _trends([{"event": "$exception"}], breakdown="type"),
        {"type": "bar"},
    ),
    "Browser share": (
        "Unique users by browser, last 30 days.",
        _trends([{"event": None, "math": "unique_users"}], breakdown="$browser"),
        {"type": "totals"},
    ),
    "Activity, last 24 hours": (
        "Events per hour. Live events stream in here.",
        _trends([{"event": None, "label": "Events"}], date_from="-24h", interval="hour"),
        {"type": "bar"},
    ),
    "AI assistant adoption": (
        "Users of the AI assistant (15% rollout via the ai-assistant flag).",
        _trends(
            [
                {"event": "ai_assistant_used", "math": "unique_users", "label": "Users"},
                {"event": "ai_assistant_used", "label": "Uses"},
            ]
        ),
        {"type": "line"},
    ),
    "Onboarding: new vs. old flow": (
        "Completion rate of each onboarding flow (new-onboarding flag, 50/50).",
        _sql("""
SELECT
  properties->>'$feature_flag_response' AS new_flow,
  count(*) AS users,
  count(*) FILTER (WHERE distinct_id IN (
    SELECT distinct_id FROM events WHERE event = 'onboarding_completed'
  )) AS completed,
  round(100.0 * count(*) FILTER (WHERE distinct_id IN (
    SELECT distinct_id FROM events WHERE event = 'onboarding_completed'
  )) / count(*), 1) AS completion_pct
FROM events
WHERE event = '$feature_flag_called'
  AND properties->>'$feature_flag' = 'new-onboarding'
GROUP BY 1
ORDER BY 1
"""),
        {"type": "table"},
    ),
    "Weekly signup cohorts": (
        "Share of each week's signups active again in the following weeks.",
        _sql("""
WITH signups AS (
  SELECT distinct_id, date_trunc('week', min(timestamp)) AS cohort
  FROM events WHERE event = 'signed_up'
  GROUP BY 1
),
-- Collapse to one row per user-week before joining; joining raw events is slow.
weekly AS (
  SELECT DISTINCT distinct_id, date_trunc('week', timestamp) AS week_start
  FROM events
),
activity AS (
  SELECT s.cohort, (w.week_start::date - s.cohort::date) / 7 AS week
  FROM weekly w JOIN signups s ON s.distinct_id = w.distinct_id
)
SELECT
  to_char(cohort, 'YYYY-MM-DD') AS cohort,
  count(*) FILTER (WHERE week = 0) AS users,
  CASE WHEN cohort + interval '2 weeks' <= now() THEN round(100.0 * count(*) FILTER (WHERE week = 1) / nullif(count(*) FILTER (WHERE week = 0), 0), 1) END AS week_1,
  CASE WHEN cohort + interval '3 weeks' <= now() THEN round(100.0 * count(*) FILTER (WHERE week = 2) / nullif(count(*) FILTER (WHERE week = 0), 0), 1) END AS week_2,
  CASE WHEN cohort + interval '5 weeks' <= now() THEN round(100.0 * count(*) FILTER (WHERE week = 4) / nullif(count(*) FILTER (WHERE week = 0), 0), 1) END AS week_4
FROM activity
GROUP BY cohort
ORDER BY cohort DESC
LIMIT 12
"""),
        {"type": "table"},
    ),
    "Top events (7d)": (
        "Most frequent events this week.",
        _sql("""
SELECT event, count(*) AS events, count(DISTINCT distinct_id) AS users
FROM events
WHERE timestamp > now() - interval '7 days'
GROUP BY event
ORDER BY events DESC
LIMIT 15
"""),
        {"type": "table"},
    ),
    "Upgrade funnel": (
        "Pricing viewed → checkout → subscribed, last 90 days.",
        _sql("""
SELECT step, users FROM (
  SELECT 1 AS n, 'Viewed pricing' AS step, count(DISTINCT distinct_id) AS users FROM events WHERE event = 'pricing_viewed'
  UNION ALL
  SELECT 2, 'Started checkout', count(DISTINCT distinct_id) FROM events WHERE event = 'checkout_started'
  UNION ALL
  SELECT 3, 'Subscribed', count(DISTINCT distinct_id) FROM events WHERE event = 'subscription_started'
) f
ORDER BY n
"""),
        {"type": "bar", "x": "step", "y": ["users"]},
    ),
}

DASHBOARDS: list[DashboardSpec] = [
    (
        "Product overview",
        "The numbers the whole team looks at every morning.",
        [
            ("Daily active users", 2),
            ("New subscriptions (30d)", 1),
            ("Tasks created vs. completed", 1),
            ("Signups vs. activations", 1),
            ("Browser share", 1),
            ("Activity, last 24 hours", 2),
        ],
    ),
    (
        "Growth & revenue",
        "Acquisition, conversion and revenue.",
        [
            ("Signups by source", 2),
            ("New MRR by plan", 1),
            ("Upgrade funnel", 1),
            ("Weekly signup cohorts", 2),
        ],
    ),
    (
        "Experiments & reliability",
        "Feature flag rollouts and error rates.",
        [
            ("Onboarding: new vs. old flow", 1),
            ("AI assistant adoption", 1),
            ("Errors by type", 2),
        ],
    ),
]
