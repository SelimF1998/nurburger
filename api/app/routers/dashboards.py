import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.deps import DB, ProjectCtx
from app.models import Dashboard, DashboardTile, Insight
from app.schemas import (
    DashboardCreate,
    DashboardDetail,
    DashboardOut,
    DashboardUpdate,
    TileCreate,
    TileOrder,
    TileOut,
    TileUpdate,
)

router = APIRouter(prefix="/api/projects/{project_id}/dashboards", tags=["dashboards"])


async def _get_dashboard(db: DB, ctx: ProjectCtx, dashboard_id: uuid.UUID) -> Dashboard:
    dashboard = await db.get(Dashboard, dashboard_id)
    if dashboard is None or dashboard.project_id != ctx.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dashboard not found")
    return dashboard


async def _get_tile(db: DB, dashboard: Dashboard, tile_id: uuid.UUID) -> DashboardTile:
    tile = await db.get(DashboardTile, tile_id)
    if tile is None or tile.dashboard_id != dashboard.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tile not found")
    return tile


def _detail(dashboard: Dashboard) -> DashboardDetail:
    return DashboardDetail(
        id=dashboard.id,
        name=dashboard.name,
        description=dashboard.description,
        created_at=dashboard.created_at,
        tile_count=len(dashboard.tiles),
        tiles=[TileOut.model_validate(t) for t in dashboard.tiles],
    )


@router.get("", response_model=list[DashboardOut])
async def list_dashboards(ctx: ProjectCtx, db: DB) -> list[DashboardOut]:
    tile_count = (
        select(func.count())
        .where(DashboardTile.dashboard_id == Dashboard.id)
        .correlate(Dashboard)
        .scalar_subquery()
    )
    rows = await db.execute(
        select(
            Dashboard.id, Dashboard.name, Dashboard.description, Dashboard.created_at, tile_count
        )
        .where(Dashboard.project_id == ctx.id)
        .order_by(Dashboard.created_at.desc())
    )
    return [
        DashboardOut(id=id_, name=name, description=desc, created_at=created, tile_count=count)
        for id_, name, desc, created, count in rows
    ]


@router.post("", response_model=DashboardOut, status_code=201)
async def create_dashboard(body: DashboardCreate, ctx: ProjectCtx, db: DB) -> DashboardOut:
    dashboard = Dashboard(
        project_id=ctx.id, name=body.name, description=body.description, created_by=ctx.user.id
    )
    db.add(dashboard)
    await db.commit()
    return DashboardOut(
        id=dashboard.id,
        name=dashboard.name,
        description=dashboard.description,
        created_at=dashboard.created_at,
    )


@router.get("/{dashboard_id}", response_model=DashboardDetail)
async def get_dashboard(dashboard_id: uuid.UUID, ctx: ProjectCtx, db: DB) -> DashboardDetail:
    return _detail(await _get_dashboard(db, ctx, dashboard_id))


@router.patch("/{dashboard_id}", status_code=204)
async def update_dashboard(
    dashboard_id: uuid.UUID, body: DashboardUpdate, ctx: ProjectCtx, db: DB
) -> None:
    dashboard = await _get_dashboard(db, ctx, dashboard_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(dashboard, field, value)
    await db.commit()


@router.delete("/{dashboard_id}", status_code=204)
async def delete_dashboard(dashboard_id: uuid.UUID, ctx: ProjectCtx, db: DB) -> None:
    await db.delete(await _get_dashboard(db, ctx, dashboard_id))
    await db.commit()


@router.post("/{dashboard_id}/tiles", response_model=DashboardDetail, status_code=201)
async def add_tile(
    dashboard_id: uuid.UUID, body: TileCreate, ctx: ProjectCtx, db: DB
) -> DashboardDetail:
    dashboard = await _get_dashboard(db, ctx, dashboard_id)
    insight = await db.get(Insight, body.insight_id)
    if insight is None or insight.project_id != ctx.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Insight not found")
    position = max((t.position for t in dashboard.tiles), default=-1) + 1
    dashboard.tiles.append(
        DashboardTile(insight_id=insight.id, insight=insight, position=position, width=body.width)
    )
    await db.commit()
    await db.refresh(dashboard, ["tiles"])
    return _detail(dashboard)


@router.patch("/{dashboard_id}/tiles/{tile_id}", status_code=204)
async def update_tile(
    dashboard_id: uuid.UUID, tile_id: uuid.UUID, body: TileUpdate, ctx: ProjectCtx, db: DB
) -> None:
    tile = await _get_tile(db, await _get_dashboard(db, ctx, dashboard_id), tile_id)
    if body.width is not None:
        tile.width = body.width
    await db.commit()


@router.put("/{dashboard_id}/tiles/order", status_code=204)
async def reorder_tiles(dashboard_id: uuid.UUID, body: TileOrder, ctx: ProjectCtx, db: DB) -> None:
    dashboard = await _get_dashboard(db, ctx, dashboard_id)
    positions = {tile_id: i for i, tile_id in enumerate(body.tile_ids)}
    for tile in dashboard.tiles:
        tile.position = positions.get(tile.id, len(positions) + tile.position)
    await db.commit()


@router.delete("/{dashboard_id}/tiles/{tile_id}", status_code=204)
async def remove_tile(dashboard_id: uuid.UUID, tile_id: uuid.UUID, ctx: ProjectCtx, db: DB) -> None:
    tile = await _get_tile(db, await _get_dashboard(db, ctx, dashboard_id), tile_id)
    await db.delete(tile)
    await db.commit()
