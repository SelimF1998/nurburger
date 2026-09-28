import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.deps import DB, CurrentUser, get_membership, require_role
from app.models import Invite, Membership, Organization, Project, Role, User
from app.schemas import (
    InviteCreate,
    InviteOut,
    MemberOut,
    MeOut,
    OrgCreate,
    OrgOut,
    OrgUpdate,
    ProjectOut,
    RoleUpdate,
    UserOut,
)
from app.security import new_public_key

router = APIRouter(prefix="/api", tags=["orgs"])


class InviteResult(BaseModel):
    status: Literal["added", "invited"]
    invite: InviteOut | None = None


@router.get("/me", response_model=MeOut)
async def me(user: CurrentUser, db: DB) -> MeOut:
    memberships = (
        await db.scalars(
            select(Membership).where(Membership.user_id == user.id).order_by(Membership.created_at)
        )
    ).all()
    org_ids = [m.org_id for m in memberships]
    projects = (
        await db.scalars(
            select(Project).where(Project.org_id.in_(org_ids)).order_by(Project.created_at)
        )
    ).all()
    orgs = [
        OrgOut(
            id=m.org.id,
            name=m.org.name,
            role=m.role,
            projects=[ProjectOut.model_validate(p) for p in projects if p.org_id == m.org_id],
        )
        for m in memberships
    ]

    # The shared demo project is listed for everyone, last.
    demo = await db.scalar(select(Project).where(Project.is_demo))
    if demo is not None:
        demo_org = await db.get(Organization, demo.org_id)
        assert demo_org is not None
        orgs.append(
            OrgOut(
                id=demo_org.id,
                name=demo_org.name,
                role=Role.member,
                projects=[ProjectOut.model_validate(demo).model_copy(update={"public_key": ""})],
                is_demo=True,
            )
        )
    return MeOut(user=UserOut.model_validate(user), orgs=orgs)


@router.post("/orgs", response_model=OrgOut, status_code=201)
async def create_org(body: OrgCreate, user: CurrentUser, db: DB) -> OrgOut:
    org = Organization(name=body.name)
    db.add(org)
    await db.flush()
    db.add(Membership(org_id=org.id, user_id=user.id, role=Role.owner))
    project = Project(org_id=org.id, name=body.project_name, public_key=new_public_key())
    db.add(project)
    await db.commit()
    return OrgOut(
        id=org.id, name=org.name, role=Role.owner, projects=[ProjectOut.model_validate(project)]
    )


@router.patch("/orgs/{org_id}", status_code=204)
async def update_org(org_id: uuid.UUID, body: OrgUpdate, user: CurrentUser, db: DB) -> None:
    require_role(await get_membership(db, org_id, user.id), Role.admin)
    org = await db.get(Organization, org_id)
    assert org is not None
    org.name = body.name
    await db.commit()


@router.delete("/orgs/{org_id}", status_code=204)
async def delete_org(org_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    require_role(await get_membership(db, org_id, user.id), Role.owner)
    org = await db.get(Organization, org_id)
    await db.delete(org)
    await db.commit()


# --- Members ----------------------------------------------------------------------


@router.get("/orgs/{org_id}/members", response_model=list[MemberOut])
async def list_members(org_id: uuid.UUID, user: CurrentUser, db: DB) -> list[MemberOut]:
    await get_membership(db, org_id, user.id)
    memberships = (
        await db.scalars(
            select(Membership).where(Membership.org_id == org_id).order_by(Membership.created_at)
        )
    ).all()
    return [
        MemberOut(user=UserOut.model_validate(m.user), role=m.role, joined_at=m.created_at)
        for m in memberships
    ]


async def _owner_count(db: DB, org_id: uuid.UUID) -> int:
    return (
        await db.scalar(
            select(func.count())
            .select_from(Membership)
            .where(Membership.org_id == org_id, Membership.role == Role.owner)
        )
        or 0
    )


@router.patch("/orgs/{org_id}/members/{user_id}", status_code=204)
async def update_member(
    org_id: uuid.UUID, user_id: uuid.UUID, body: RoleUpdate, user: CurrentUser, db: DB
) -> None:
    actor = await get_membership(db, org_id, user.id)
    require_role(actor, Role.admin)
    target = await get_membership(db, org_id, user_id)
    if Role.owner in (body.role, target.role):
        require_role(actor, Role.owner)
    if target.role == Role.owner and body.role != Role.owner and await _owner_count(db, org_id) < 2:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "An organization needs at least one owner")
    target.role = body.role
    await db.commit()


@router.delete("/orgs/{org_id}/members/{user_id}", status_code=204)
async def remove_member(org_id: uuid.UUID, user_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    actor = await get_membership(db, org_id, user.id)
    target = await get_membership(db, org_id, user_id)
    if user_id != user.id:
        require_role(actor, Role.admin)
        if target.role == Role.owner:
            require_role(actor, Role.owner)
    if target.role == Role.owner and await _owner_count(db, org_id) < 2:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Transfer ownership before the last owner leaves"
        )
    await db.delete(target)
    await db.commit()


# --- Invites ----------------------------------------------------------------------


@router.get("/orgs/{org_id}/invites", response_model=list[InviteOut])
async def list_invites(org_id: uuid.UUID, user: CurrentUser, db: DB) -> list[Invite]:
    await get_membership(db, org_id, user.id)
    return list(
        (
            await db.scalars(
                select(Invite).where(Invite.org_id == org_id).order_by(Invite.created_at.desc())
            )
        ).all()
    )


@router.post("/orgs/{org_id}/invites", response_model=InviteResult, status_code=201)
async def create_invite(
    org_id: uuid.UUID, body: InviteCreate, user: CurrentUser, db: DB
) -> InviteResult:
    actor = await get_membership(db, org_id, user.id)
    require_role(actor, Role.admin)
    if body.role == Role.owner:
        require_role(actor, Role.owner)
    email = body.email.lower()

    existing_user = await db.scalar(select(User).where(User.email == email))
    if existing_user:
        if await db.get(Membership, (org_id, existing_user.id)):
            raise HTTPException(status.HTTP_409_CONFLICT, "Already a member")
        db.add(Membership(org_id=org_id, user_id=existing_user.id, role=body.role))
        await db.commit()
        return InviteResult(status="added")

    invite = Invite(org_id=org_id, email=email, role=body.role, invited_by=user.id)
    db.add(invite)
    try:
        await db.commit()
    except IntegrityError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already invited") from None
    return InviteResult(status="invited", invite=InviteOut.model_validate(invite))


@router.delete("/orgs/{org_id}/invites/{invite_id}", status_code=204)
async def delete_invite(org_id: uuid.UUID, invite_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    require_role(await get_membership(db, org_id, user.id), Role.admin)
    invite = await db.get(Invite, invite_id)
    if invite is None or invite.org_id != org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await db.delete(invite)
    await db.commit()
