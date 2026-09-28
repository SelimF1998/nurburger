import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.deps import DB, ProjectCtx
from app.models import FeatureFlag
from app.schemas import FlagCreate, FlagOut, FlagUpdate
from app.services import flags as flag_service

router = APIRouter(prefix="/api/projects/{project_id}/flags", tags=["flags"])


async def _get_flag(db: DB, ctx: ProjectCtx, flag_id: uuid.UUID) -> FeatureFlag:
    flag = await db.get(FeatureFlag, flag_id)
    if flag is None or flag.project_id != ctx.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Flag not found")
    return flag


@router.get("", response_model=list[FlagOut])
async def list_flags(ctx: ProjectCtx, db: DB) -> list[FeatureFlag]:
    return list(
        (
            await db.scalars(
                select(FeatureFlag)
                .where(FeatureFlag.project_id == ctx.id)
                .order_by(FeatureFlag.created_at.desc())
            )
        ).all()
    )


@router.post("", response_model=FlagOut, status_code=201)
async def create_flag(body: FlagCreate, ctx: ProjectCtx, db: DB) -> FeatureFlag:
    flag = FeatureFlag(project_id=ctx.id, created_by=ctx.user.id, **body.model_dump())
    db.add(flag)
    try:
        await db.commit()
    except IntegrityError:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"A flag with key '{body.key}' already exists"
        ) from None
    await flag_service.invalidate(ctx.id)
    return flag


@router.get("/evaluate", response_model=dict[str, bool])
async def evaluate_flags(distinct_id: str, ctx: ProjectCtx, db: DB) -> dict[str, bool]:
    """What every flag returns for a given user right now (dashboard's 'Test' box)."""
    return await flag_service.evaluate(db, ctx.id, distinct_id)


@router.get("/{flag_id}", response_model=FlagOut)
async def get_flag(flag_id: uuid.UUID, ctx: ProjectCtx, db: DB) -> FeatureFlag:
    return await _get_flag(db, ctx, flag_id)


@router.patch("/{flag_id}", response_model=FlagOut)
async def update_flag(flag_id: uuid.UUID, body: FlagUpdate, ctx: ProjectCtx, db: DB) -> FeatureFlag:
    flag = await _get_flag(db, ctx, flag_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(flag, field, value)
    await db.commit()
    await flag_service.invalidate(ctx.id)
    return flag


@router.delete("/{flag_id}", status_code=204)
async def delete_flag(flag_id: uuid.UUID, ctx: ProjectCtx, db: DB) -> None:
    flag = await _get_flag(db, ctx, flag_id)
    await db.delete(flag)
    await db.commit()
    await flag_service.invalidate(ctx.id)
