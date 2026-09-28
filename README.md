# Nurburger

Product events, feature flags and insights. A small, focused PostHog alternative.

```
api/        FastAPI + SQLAlchemy 2 (async) + Alembic. Runs in docker-compose with Postgres & Redis
web/        React 19 + Vite + Tailwind v4 + shadcn/Radix + Zustand + Recharts. Runs on the host
sdks/js     nurburger-js: browser + Node client
sdks/python nurburger: stdlib-only Python client
scripts/    seed.py: sample data
```

## Run it

```bash
cp .env.example .env          # set SECRET_KEY; Google creds optional (see below)
make up                       # postgres + redis + api on :8000 (applies migrations)
make install && make web      # web on http://localhost:5173
```

Open http://localhost:5173. Without Google credentials, use the **dev login** (email only; enabled only when `ENV=dev`).

Once you're in, copy the project key from **Get started** and load sample data:

```bash
make seed key=nb_pk_...
```

API docs: http://localhost:8000/api/docs

## Demo project

Every signed-in user also sees **Acme Tasks**, a shared, read-only demo project. It's a fictional SaaS with about 250k events over 90 days, 5 feature flags, 15 saved insights (trends and SQL) and 3 dashboards. The API seeds it in the background on first start (in one transaction, in a few seconds). It regenerates itself on startup once its data is more than `DEMO_REFRESH_DAYS` (7) days old, and new sessions keep arriving live every 20 to 60 seconds.

In the demo, users can browse everything and run any trends or SQL query, but saving, editing and API keys are blocked by the API.

```bash
make demo-reseed     # rebuild now
make demo-delete     # remove (also set DEMO_ENABLED=false)
```

Settings: `DEMO_ENABLED`, `DEMO_LIVE`, `DEMO_REFRESH_DAYS`. The generator lives in `api/app/demo/`.

## Google sign-in

1. Google Cloud Console → APIs & Services → Credentials → **Create OAuth client ID** (Web application).
2. Authorized redirect URI: `http://localhost:5173/api/auth/google/callback`
3. Put the client ID/secret in `.env`, then `docker compose up -d api`.

## How it fits together

- **Tenancy**: users → organizations (owner/admin/member) → projects. Invites are by email and are accepted automatically on sign-in.
- **Keys**: every project has a public key (`nb_pk_…`, used for capture and flag evaluation, safe in browsers) and any number of secret keys (`nb_sk_…`, which grant query access; only a hash is stored).
- **Public API** (CORS open): `POST /v1/capture`, `POST /v1/batch`, `POST /v1/flags`. With a secret key: `POST /v1/query`, `GET /v1/insights/{id}/result`.
- **Events** are stored in Postgres (JSONB properties, indexed by project/event/time).
- **Flags**: on/off plus a percentage rollout. A user is in the rollout when `sha1("{key}.{distinct_id}")` falls below the percentage, so assignment is stable and raising the percentage never removes anyone. Definitions are cached in Redis.
- **Insights**: the visual trends builder (series × math × filters × breakdown × interval) compiles to parameterised SQL. **Custom SQL** is sandboxed in several layers:
  1. sqlglot allows only a single SELECT, over `events` only, with dangerous functions denied.
  2. The query runs in a READ ONLY transaction with a timeout.
  3. It runs as the `nurburger_query` role, which can only read `query.events`, a security-barrier view scoped to the current project.
