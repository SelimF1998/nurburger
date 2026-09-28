import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app import cache
from app.config import settings
from app.db import get_db
from app.models import Membership, Project, Role, SecretKey, Session, User
from app.security import SECRET_KEY_PREFIX, sha256

DB = Annotated[AsyncSession, Depends(get_db)]

_ROLE_RANK = {Role.member: 0, Role.admin: 1, Role.owner: 2}


async def current_user(request: Request, db: DB) -> User:
    token = request.cookies.get(settings.session_cookie)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")
    session = await db.get(Session, sha256(token))
    if session is None or session.expires_at < datetime.now(UTC):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired")
    return session.user


CurrentUser = Annotated[User, Depends(current_user)]


async def get_membership(db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID) -> Membership:
    membership = await db.get(Membership, (org_id, user_id))
    if membership is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    return membership


def require_role(membership: Membership, minimum: Role) -> None:
    if _ROLE_RANK[membership.role] < _ROLE_RANK[minimum]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires {minimum.value} role")


class ProjectContext:
    def __init__(self, project: Project, membership: Membership, user: User):
        self.project = project
        self.membership = membership
        self.user = user

    @property
    def id(self) -> uuid.UUID:
        return self.project.id


_READ_METHODS = {"GET", "HEAD", "OPTIONS"}


def _demo_allows(request: Request) -> bool:
    """The demo project is read-only, except for running ad-hoc queries."""
    path = request.url.path
    if "/secret-keys" in path:
        return False
    return request.method in _READ_METHODS or path.endswith("/query")


async def project_context(
    project_id: uuid.UUID, request: Request, user: CurrentUser, db: DB
) -> ProjectContext:
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    if project.is_demo:
        if not _demo_allows(request):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "The demo project is read-only")
        # Transient, never persisted: everyone is a plain member of the demo.
        return ProjectContext(
            project, Membership(org_id=project.org_id, user_id=user.id, role=Role.member), user
        )
    membership = await db.get(Membership, (project.org_id, user.id))
    if membership is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return ProjectContext(project, membership, user)


ProjectCtx = Annotated[ProjectContext, Depends(project_context)]


# --- Public API keys -------------------------------------------------------------


async def project_id_for_public_key(db: AsyncSession, key: str) -> uuid.UUID | None:
    cache_key = f"pk:{key}"
    cached = await cache.get_json(cache_key)
    if cached:
        return uuid.UUID(cached)
    project_id = await db.scalar(select(Project.id).where(Project.public_key == key))
    if project_id:
        await cache.set_json(cache_key, str(project_id), ttl=300)
    return project_id


async def secret_key_project(
    db: DB, authorization: Annotated[str | None, Header()] = None
) -> uuid.UUID:
    """Authenticates `Authorization: Bearer nb_sk_...` and returns its project id."""
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not token.startswith(SECRET_KEY_PREFIX):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing or invalid secret key")
    key = await db.scalar(select(SecretKey).where(SecretKey.key_hash == sha256(token)))
    if key is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing or invalid secret key")
    await db.execute(
        update(SecretKey).where(SecretKey.id == key.id).values(last_used_at=datetime.now(UTC))
    )
    await db.commit()
    return key.project_id


SecretKeyProject = Annotated[uuid.UUID, Depends(secret_key_project)]
