import enum
from datetime import datetime
from typing import Any
from uuid import UUID as PyUUID
from uuid import uuid4

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _uuid_pk() -> Mapped[PyUUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)


def _created_at() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Role(str, enum.Enum):
    owner = "owner"
    admin = "admin"
    member = "member"


role_enum = Enum(Role, name="org_role", values_callable=lambda e: [m.value for m in e])


class User(Base):
    __tablename__ = "users"

    id: Mapped[PyUUID] = _uuid_pk()
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    avatar_url: Mapped[str | None] = mapped_column(Text)
    google_sub: Mapped[str | None] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = _created_at()


class Session(Base):
    __tablename__ = "sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[PyUUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    created_at: Mapped[datetime] = _created_at()
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    user: Mapped[User] = relationship(lazy="joined")


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[PyUUID] = _uuid_pk()
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = _created_at()


class Membership(Base):
    __tablename__ = "memberships"

    org_id: Mapped[PyUUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[PyUUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    role: Mapped[Role] = mapped_column(role_enum, nullable=False, default=Role.member)
    created_at: Mapped[datetime] = _created_at()

    user: Mapped[User] = relationship(lazy="joined")
    org: Mapped[Organization] = relationship(lazy="joined")


class Invite(Base):
    """Pending invite. Accepted automatically when a user signs in with this email."""

    __tablename__ = "invites"
    __table_args__ = (UniqueConstraint("org_id", "email"),)

    id: Mapped[PyUUID] = _uuid_pk()
    org_id: Mapped[PyUUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    email: Mapped[str] = mapped_column(String(320), index=True, nullable=False)
    role: Mapped[Role] = mapped_column(role_enum, nullable=False, default=Role.member)
    invited_by: Mapped[PyUUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = _created_at()


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[PyUUID] = _uuid_pk()
    org_id: Mapped[PyUUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    public_key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    # The shared demo project: readable by every user, writable by nobody (see app.demo).
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = _created_at()


class SecretKey(Base):
    """Project-scoped secret API key. Only the SHA-256 hash is stored."""

    __tablename__ = "secret_keys"

    id: Mapped[PyUUID] = _uuid_pk()
    project_id: Mapped[PyUUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    mask: Mapped[str] = mapped_column(String(32), nullable=False)
    created_by: Mapped[PyUUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = _created_at()
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        Index("ix_events_project_ts", "project_id", "timestamp"),
        Index("ix_events_project_event_ts", "project_id", "event", "timestamp"),
        Index("ix_events_project_distinct", "project_id", "distinct_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    uuid: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, server_default=text("gen_random_uuid()")
    )
    project_id: Mapped[PyUUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    event: Mapped[str] = mapped_column(String(200), nullable=False)
    distinct_id: Mapped[str] = mapped_column(String(200), nullable=False)
    properties: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = _created_at()


class EventDefinition(Base):
    __tablename__ = "event_definitions"

    project_id: Mapped[PyUUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    name: Mapped[str] = mapped_column(String(200), primary_key=True)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    total_count: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)


class FeatureFlag(Base):
    __tablename__ = "feature_flags"
    __mapper_args__ = {"eager_defaults": True}
    __table_args__ = (UniqueConstraint("project_id", "key"),)

    id: Mapped[PyUUID] = _uuid_pk()
    project_id: Mapped[PyUUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    key: Mapped[str] = mapped_column(String(120), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rollout_percentage: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    created_by: Mapped[PyUUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Insight(Base):
    __tablename__ = "insights"
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[PyUUID] = _uuid_pk()
    project_id: Mapped[PyUUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # "trends" (visual builder) or "sql"
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    query: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    viz: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    created_by: Mapped[PyUUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Dashboard(Base):
    __tablename__ = "dashboards"

    id: Mapped[PyUUID] = _uuid_pk()
    project_id: Mapped[PyUUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_by: Mapped[PyUUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = _created_at()

    tiles: Mapped[list["DashboardTile"]] = relationship(
        order_by="DashboardTile.position", cascade="all, delete-orphan", lazy="selectin"
    )


class DashboardTile(Base):
    __tablename__ = "dashboard_tiles"

    id: Mapped[PyUUID] = _uuid_pk()
    dashboard_id: Mapped[PyUUID] = mapped_column(
        ForeignKey("dashboards.id", ondelete="CASCADE"), index=True, nullable=False
    )
    insight_id: Mapped[PyUUID] = mapped_column(
        ForeignKey("insights.id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 1 = half width, 2 = full width
    width: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    insight: Mapped[Insight] = relationship(lazy="joined")
