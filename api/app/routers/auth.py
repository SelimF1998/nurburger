import secrets
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from itsdangerous import BadSignature, URLSafeTimedSerializer
from pydantic import BaseModel, EmailStr
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.deps import DB
from app.models import Invite, Membership, Session, User
from app.security import new_session_token, sha256

router = APIRouter(prefix="/api/auth", tags=["auth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
STATE_COOKIE = "nb_oauth_state"

_state_signer = URLSafeTimedSerializer(settings.secret_key, salt="oauth-state")


class AuthConfig(BaseModel):
    google: bool
    dev_login: bool


class DevLogin(BaseModel):
    email: EmailStr
    name: str = ""


@router.get("/config", response_model=AuthConfig)
async def auth_config() -> AuthConfig:
    return AuthConfig(google=settings.google_enabled, dev_login=settings.is_dev)


def _safe_next(next_path: str | None) -> str:
    # Only allow same-site relative paths to avoid open redirects.
    if not next_path or not next_path.startswith("/") or next_path.startswith("//"):
        return "/"
    return next_path


@router.get("/google/login")
async def google_login(next: str | None = None) -> RedirectResponse:
    if not settings.google_enabled:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Google sign-in is not configured")
    state = secrets.token_urlsafe(24)
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "prompt": "select_account",
    }
    response = RedirectResponse(f"{GOOGLE_AUTH_URL}?{urlencode(params)}")
    response.set_cookie(
        STATE_COOKIE,
        _state_signer.dumps({"state": state, "next": _safe_next(next)}),
        max_age=600,
        httponly=True,
        samesite="lax",
        secure=not settings.is_dev,
    )
    return response


@router.get("/google/callback")
async def google_callback(
    request: Request, db: DB, code: str | None = None, state: str | None = None
) -> RedirectResponse:
    fail = RedirectResponse(f"{settings.web_url}/login?error=google")
    try:
        saved = _state_signer.loads(request.cookies.get(STATE_COOKIE, ""), max_age=600)
    except BadSignature:
        return fail
    if not code or not state or state != saved.get("state"):
        return fail

    async with httpx.AsyncClient(timeout=10) as client:
        token_res = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_res.status_code != 200:
            return fail
        info_res = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {token_res.json()['access_token']}"},
        )
        if info_res.status_code != 200:
            return fail
    info = info_res.json()
    if not info.get("email_verified"):
        return fail

    user = await db.scalar(select(User).where(User.google_sub == info["sub"]))
    if user is None:
        user = await db.scalar(select(User).where(User.email == info["email"].lower()))
    if user is None:
        user = User(email=info["email"].lower())
        db.add(user)
    user.google_sub = info["sub"]
    user.name = info.get("name") or user.name or user.email.split("@")[0]
    user.avatar_url = info.get("picture")
    await db.flush()

    response = RedirectResponse(f"{settings.web_url}{saved.get('next', '/')}")
    await _sign_in(db, user, response)
    response.delete_cookie(STATE_COOKIE)
    return response


@router.post("/dev-login", status_code=204)
async def dev_login(body: DevLogin, db: DB, response: Response) -> None:
    if not settings.is_dev:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    email = body.email.lower()
    user = await db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email, name=body.name or email.split("@")[0])
        db.add(user)
        await db.flush()
    await _sign_in(db, user, response)


@router.post("/logout", status_code=204)
async def logout(request: Request, db: DB, response: Response) -> None:
    token = request.cookies.get(settings.session_cookie)
    if token:
        await db.execute(delete(Session).where(Session.token_hash == sha256(token)))
        await db.commit()
    response.delete_cookie(settings.session_cookie, path="/")


async def _sign_in(db: AsyncSession, user: User, response: Response) -> None:
    await _accept_invites(db, user)
    token = new_session_token()
    ttl = timedelta(days=settings.session_ttl_days)
    db.add(Session(token_hash=sha256(token), user_id=user.id, expires_at=datetime.now(UTC) + ttl))
    await db.commit()
    response.set_cookie(
        settings.session_cookie,
        token,
        max_age=int(ttl.total_seconds()),
        httponly=True,
        samesite="lax",
        secure=not settings.is_dev,
        path="/",
    )


async def _accept_invites(db: AsyncSession, user: User) -> None:
    invites = (await db.scalars(select(Invite).where(Invite.email == user.email))).all()
    for invite in invites:
        if await db.get(Membership, (invite.org_id, user.id)) is None:
            db.add(Membership(org_id=invite.org_id, user_id=user.id, role=invite.role))
        await db.delete(invite)
