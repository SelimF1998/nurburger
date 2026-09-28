import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from app.config import settings
from app.demo import runner as demo
from app.routers import auth, dashboards, events, flags, insights, orgs, projects, public

logging.basicConfig(format="%(levelname)s:     %(name)s - %(message)s")
logging.getLogger("nurburger").setLevel(logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    task = asyncio.create_task(demo.run()) if settings.demo_enabled else None
    yield
    if task:
        task.cancel()


app = FastAPI(
    title="Nurburger API",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)


class PublicCORS(BaseHTTPMiddleware):
    """Open CORS for the public /v1 API only. The dashboard API stays same-origin."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if not request.url.path.startswith("/v1/"):
            return await call_next(request)
        if request.method == "OPTIONS":
            response = Response(status_code=204)
        else:
            response = await call_next(request)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Max-Age"] = "86400"
        return response


app.add_middleware(PublicCORS)

for module in (auth, orgs, projects, events, flags, insights, dashboards, public):
    app.include_router(module.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
