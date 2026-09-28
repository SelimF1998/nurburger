import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app import cache
from app.deps import DB, CurrentUser, ProjectCtx, get_membership, require_role
from app.models import Project, Role, SecretKey
from app.schemas import (
    ProjectCreate,
    ProjectOut,
    ProjectUpdate,
    SecretKeyCreate,
    SecretKeyCreated,
    SecretKeyOut,
)
from app.security import new_public_key, new_secret_key

router = APIRouter(prefix="/api", tags=["projects"])


@router.post("/orgs/{org_id}/projects", response_model=ProjectOut, status_code=201)
async def create_project(
    org_id: uuid.UUID, body: ProjectCreate, user: CurrentUser, db: DB
) -> Project:
    require_role(await get_membership(db, org_id, user.id), Role.admin)
    project = Project(org_id=org_id, name=body.name, public_key=new_public_key())
    db.add(project)
    await db.commit()
    return project


@router.patch("/projects/{project_id}", response_model=ProjectOut)
async def update_project(body: ProjectUpdate, ctx: ProjectCtx, db: DB) -> Project:
    require_role(ctx.membership, Role.admin)
    ctx.project.name = body.name
    await db.commit()
    return ctx.project


@router.post("/projects/{project_id}/rotate-public-key", response_model=ProjectOut)
async def rotate_public_key(ctx: ProjectCtx, db: DB) -> Project:
    require_role(ctx.membership, Role.admin)
    await cache.delete(f"pk:{ctx.project.public_key}")
    ctx.project.public_key = new_public_key()
    await db.commit()
    return ctx.project


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(ctx: ProjectCtx, db: DB) -> None:
    require_role(ctx.membership, Role.admin)
    await cache.delete(f"pk:{ctx.project.public_key}")
    await db.delete(ctx.project)
    await db.commit()


@router.get("/projects/{project_id}/secret-keys", response_model=list[SecretKeyOut])
async def list_secret_keys(ctx: ProjectCtx, db: DB) -> list[SecretKey]:
    return list(
        (
            await db.scalars(
                select(SecretKey)
                .where(SecretKey.project_id == ctx.id)
                .order_by(SecretKey.created_at.desc())
            )
        ).all()
    )


@router.post("/projects/{project_id}/secret-keys", response_model=SecretKeyCreated, status_code=201)
async def create_secret_key(body: SecretKeyCreate, ctx: ProjectCtx, db: DB) -> SecretKeyCreated:
    require_role(ctx.membership, Role.admin)
    raw, key_hash, mask = new_secret_key()
    key = SecretKey(
        project_id=ctx.id, name=body.name, key_hash=key_hash, mask=mask, created_by=ctx.user.id
    )
    db.add(key)
    await db.commit()
    return SecretKeyCreated(
        id=key.id,
        name=key.name,
        mask=key.mask,
        created_at=key.created_at,
        last_used_at=None,
        key=raw,
    )


@router.delete("/projects/{project_id}/secret-keys/{key_id}", status_code=204)
async def revoke_secret_key(key_id: uuid.UUID, ctx: ProjectCtx, db: DB) -> None:
    require_role(ctx.membership, Role.admin)
    key = await db.get(SecretKey, key_id)
    if key is None or key.project_id != ctx.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await db.delete(key)
    await db.commit()
