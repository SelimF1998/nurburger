import uuid

from fastapi import APIRouter, Body, HTTPException, status
from sqlalchemy import select

from app.deps import DB, ProjectCtx
from app.models import Insight
from app.schemas import AnyQuery, InsightCreate, InsightOut, InsightUpdate, QueryResult
from app.services.query import run_insight, run_query

router = APIRouter(prefix="/api/projects/{project_id}", tags=["insights"])


async def _get_insight(db: DB, ctx: ProjectCtx, insight_id: uuid.UUID) -> Insight:
    insight = await db.get(Insight, insight_id)
    if insight is None or insight.project_id != ctx.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Insight not found")
    return insight


@router.post("/query", response_model=QueryResult)
async def query(ctx: ProjectCtx, db: DB, body: AnyQuery = Body(...)):
    return await run_query(db, ctx.id, body)


@router.get("/insights", response_model=list[InsightOut])
async def list_insights(ctx: ProjectCtx, db: DB) -> list[Insight]:
    return list(
        (
            await db.scalars(
                select(Insight)
                .where(Insight.project_id == ctx.id)
                .order_by(Insight.updated_at.desc())
            )
        ).all()
    )


@router.post("/insights", response_model=InsightOut, status_code=201)
async def create_insight(body: InsightCreate, ctx: ProjectCtx, db: DB) -> Insight:
    insight = Insight(
        project_id=ctx.id,
        name=body.name,
        description=body.description,
        kind=body.query.kind,
        query=body.query.model_dump(),
        viz=body.viz.model_dump(),
        created_by=ctx.user.id,
    )
    db.add(insight)
    await db.commit()
    return insight


@router.get("/insights/{insight_id}", response_model=InsightOut)
async def get_insight(insight_id: uuid.UUID, ctx: ProjectCtx, db: DB) -> Insight:
    return await _get_insight(db, ctx, insight_id)


@router.patch("/insights/{insight_id}", response_model=InsightOut)
async def update_insight(
    insight_id: uuid.UUID, body: InsightUpdate, ctx: ProjectCtx, db: DB
) -> Insight:
    insight = await _get_insight(db, ctx, insight_id)
    if body.name is not None:
        insight.name = body.name
    if body.description is not None:
        insight.description = body.description
    if body.query is not None:
        insight.kind = body.query.kind
        insight.query = body.query.model_dump()
    if body.viz is not None:
        insight.viz = body.viz.model_dump()
    await db.commit()
    return insight


@router.delete("/insights/{insight_id}", status_code=204)
async def delete_insight(insight_id: uuid.UUID, ctx: ProjectCtx, db: DB) -> None:
    await db.delete(await _get_insight(db, ctx, insight_id))
    await db.commit()


@router.get("/insights/{insight_id}/result", response_model=QueryResult)
async def insight_result(insight_id: uuid.UUID, ctx: ProjectCtx, db: DB):
    return await run_insight(db, await _get_insight(db, ctx, insight_id))
