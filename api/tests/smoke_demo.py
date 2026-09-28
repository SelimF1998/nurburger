"""Manual end-to-end smoke test against a running API (not collected by pytest)."""

import time

import httpx

c = httpx.Client(base_url="http://localhost:8000", timeout=60)
r = c.post("/api/auth/dev-login", json={"email": "smoke-test@nurburger.dev"})
assert r.status_code == 204, r.text
me = c.get("/api/me").json()
demo_org = next(o for o in me["orgs"] if o["is_demo"])
p = demo_org["projects"][0]
print("demo:", demo_org["name"], "/", p["name"], "| public key hidden:", p["public_key"] == "")
base = f"/api/projects/{p['id']}"

defs = c.get(f"{base}/event-definitions").json()
print(f"event types: {len(defs)}, total events: {sum(d['total_count'] for d in defs):,}")
print(
    "flags:",
    [(f["key"], f["rollout_percentage"], f["active"]) for f in c.get(f"{base}/flags").json()],
)
print(
    "evaluate usr_00042:",
    c.get(f"{base}/flags/evaluate", params={"distinct_id": "usr_00042"}).json(),
)
print("dashboards:", [(d["name"], d["tile_count"]) for d in c.get(f"{base}/dashboards").json()])

fails = 0
for ins in c.get(f"{base}/insights").json():
    t = time.perf_counter()
    r = c.get(f"{base}/insights/{ins['id']}/result")
    ms = (time.perf_counter() - t) * 1000
    if r.status_code != 200:
        fails += 1
        print(f"  FAIL {ins['name']}: {r.status_code} {r.text[:200]}")
        continue
    res = r.json()
    summary = (
        f"{len(res['series'])} series, total {sum(s['total'] for s in res['series']):,.0f}"
        if res["kind"] == "trends"
        else f"{len(res['rows'])} rows, cols {res['columns']}"
    )
    print(f"  ok {ms:6.0f}ms  {ins['name']:32} {summary}")
    if ins["name"] == "Onboarding: new vs. old flow":
        print("     ", res["rows"])
    if ins["name"] == "Upgrade funnel":
        print("     ", res["rows"])

print(
    "adhoc SQL:",
    c.post(f"{base}/query", json={"kind": "sql", "sql": "select count(*) from events"}).json()[
        "rows"
    ],
)
leak = c.post(
    f"{base}/query", json={"kind": "sql", "sql": "select count(*) from events where 1=1"}
).json()
checks = {
    "create flag": c.post(f"{base}/flags", json={"key": "x"}).status_code,
    "patch insight": c.patch(f"{base}/insights/{ins['id']}", json={"name": "hacked"}).status_code,
    "delete dashboard": c.delete(
        f"{base}/dashboards/{c.get(f'{base}/dashboards').json()[0]['id']}"
    ).status_code,
    "list secret keys": c.get(f"{base}/secret-keys").status_code,
    "create secret key": c.post(f"{base}/secret-keys", json={"name": "x"}).status_code,
    "rename project": c.patch(base, json={"name": "x"}).status_code,
    "org members": c.get(f"/api/orgs/{demo_org['id']}/members").status_code,
    "create project in demo org": c.post(
        f"/api/orgs/{demo_org['id']}/projects", json={"name": "x"}
    ).status_code,
    "sql set_config escape": c.post(
        f"{base}/query",
        json={"kind": "sql", "sql": "select set_config('nurburger.project_id','x',true)"},
    ).status_code,
}
print("write checks (want 403/404/400):", checks)
print("insight failures:", fails)
