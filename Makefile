.PHONY: up down logs web install test migrate revision psql seed demo-reseed demo-delete

up:            ## Start postgres, redis and the API (runs migrations)
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f api

install:       ## Install frontend dependencies
	cd web && pnpm install

web:           ## Run the frontend dev server on :5173 (proxies /api and /v1 to :8000)
	cd web && pnpm dev

test:          ## Backend unit tests
	docker compose exec api pytest -q

migrate:
	docker compose exec api alembic upgrade head

revision:      ## make revision m="add something"
	docker compose exec api alembic revision --autogenerate -m "$(m)"

psql:
	docker compose exec postgres psql -U nurburger

seed:          ## Send sample events: make seed key=nb_pk_...
	python3 scripts/seed.py $(key)

demo-reseed:   ## Rebuild the shared demo project with fresh data
	docker compose exec api python -m app.demo reseed

demo-delete:   ## Remove the demo (set DEMO_ENABLED=false in .env to keep it gone)
	docker compose exec api python -m app.demo delete
