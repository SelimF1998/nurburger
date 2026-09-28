"""Send ~2,000 realistic sample events spread over the last 30 days.

Usage: python3 scripts/seed.py nb_pk_... [host]
Standard library only.
"""

import json
import random
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

key = sys.argv[1] if len(sys.argv) > 1 else sys.exit("usage: seed.py <public key> [host]")
host = (sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8000").rstrip("/")

random.seed(7)
now = datetime.now(timezone.utc)
users = [f"user_{i}" for i in range(250)]
plans = ["free", "free", "free", "pro", "pro", "team"]
browsers = ["Chrome", "Chrome", "Safari", "Firefox", "Edge"]
countries = ["US", "FR", "DE", "GB", "DZ", "BR", "IN"]
paths = ["/", "/pricing", "/docs", "/blog", "/app", "/app/settings"]

events = []
for _ in range(2000):
    user = random.choice(users)
    ts = now - timedelta(days=random.random() ** 1.4 * 30, minutes=random.randint(0, 1440))
    base = {
        "$browser": random.choice(browsers),
        "$country": random.choice(countries),
        "plan": plans[hash(user) % len(plans)],
    }
    roll = random.random()
    if roll < 0.6:
        name, props = "$pageview", {"$pathname": random.choice(paths)}
    elif roll < 0.75:
        name, props = "signed_up", {"source": random.choice(["google", "direct", "twitter"])}
    elif roll < 0.9:
        name, props = "project_created", {"template": random.choice(["blank", "saas", "shop"])}
    else:
        name, props = "purchase", {"amount": random.choice([9, 29, 49, 99, 199])}
    events.append(
        {"event": name, "distinct_id": user, "properties": {**base, **props}, "timestamp": ts.isoformat()}
    )

for i in range(0, len(events), 500):
    body = json.dumps({"api_key": key, "batch": events[i : i + 500]}).encode()
    req = urllib.request.Request(
        f"{host}/v1/batch", data=body, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as res:
        print(res.status, json.loads(res.read()))
print(f"Sent {len(events)} events")
