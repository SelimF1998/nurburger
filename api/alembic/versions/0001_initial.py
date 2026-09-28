"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-09-28
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

TS = sa.DateTime(timezone=True)


def _uuid_pk() -> sa.Column:
    return sa.Column("id", pg.UUID(as_uuid=True), primary_key=True)


def _created_at() -> sa.Column:
    return sa.Column("created_at", TS, server_default=sa.func.now(), nullable=False)


def upgrade() -> None:
    role = pg.ENUM("owner", "admin", "member", name="org_role", create_type=False)
    role.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "users",
        _uuid_pk(),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("avatar_url", sa.Text),
        sa.Column("google_sub", sa.String(64), unique=True),
        _created_at(),
    )
    op.create_table(
        "sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column(
            "user_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        _created_at(),
        sa.Column("expires_at", TS, nullable=False),
    )
    op.create_table(
        "organizations",
        _uuid_pk(),
        sa.Column("name", sa.String(120), nullable=False),
        _created_at(),
    )
    op.create_table(
        "memberships",
        sa.Column(
            "org_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
            index=True,
        ),
        sa.Column("role", role, nullable=False),
        _created_at(),
    )
    op.create_table(
        "invites",
        _uuid_pk(),
        sa.Column(
            "org_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("email", sa.String(320), nullable=False, index=True),
        sa.Column("role", role, nullable=False),
        sa.Column(
            "invited_by", pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")
        ),
        _created_at(),
        sa.UniqueConstraint("org_id", "email"),
    )
    op.create_table(
        "projects",
        _uuid_pk(),
        sa.Column(
            "org_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("public_key", sa.String(64), nullable=False, unique=True),
        _created_at(),
    )
    op.create_table(
        "secret_keys",
        _uuid_pk(),
        sa.Column(
            "project_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("key_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("mask", sa.String(32), nullable=False),
        sa.Column(
            "created_by", pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")
        ),
        _created_at(),
        sa.Column("last_used_at", TS),
    )
    op.create_table(
        "events",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "uuid",
            pg.UUID(as_uuid=True),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "project_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event", sa.String(200), nullable=False),
        sa.Column("distinct_id", sa.String(200), nullable=False),
        sa.Column("properties", pg.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("timestamp", TS, nullable=False),
        _created_at(),
    )
    op.create_index("ix_events_project_ts", "events", ["project_id", "timestamp"])
    op.create_index("ix_events_project_event_ts", "events", ["project_id", "event", "timestamp"])
    op.create_index("ix_events_project_distinct", "events", ["project_id", "distinct_id"])

    op.create_table(
        "event_definitions",
        sa.Column(
            "project_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("name", sa.String(200), primary_key=True),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        sa.Column("first_seen_at", TS, nullable=False),
        sa.Column("last_seen_at", TS, nullable=False),
        sa.Column("total_count", sa.BigInteger, nullable=False, server_default="0"),
    )
    op.create_table(
        "feature_flags",
        _uuid_pk(),
        sa.Column(
            "project_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("key", sa.String(120), nullable=False),
        sa.Column("name", sa.String(200), nullable=False, server_default=""),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("rollout_percentage", sa.Integer, nullable=False, server_default="100"),
        sa.Column(
            "created_by", pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")
        ),
        _created_at(),
        sa.Column("updated_at", TS, server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("project_id", "key"),
    )
    op.create_table(
        "insights",
        _uuid_pk(),
        sa.Column(
            "project_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("query", pg.JSONB, nullable=False),
        sa.Column("viz", pg.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column(
            "created_by", pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")
        ),
        _created_at(),
        sa.Column("updated_at", TS, server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "dashboards",
        _uuid_pk(),
        sa.Column(
            "project_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        sa.Column(
            "created_by", pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")
        ),
        _created_at(),
    )
    op.create_table(
        "dashboard_tiles",
        _uuid_pk(),
        sa.Column(
            "dashboard_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("dashboards.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "insight_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("insights.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("position", sa.Integer, nullable=False, server_default="0"),
        sa.Column("width", sa.Integer, nullable=False, server_default="1"),
    )

    # Sandbox for user-written SQL: a role that can only read a project-scoped view.
    op.execute(
        """
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nurburger_query') THEN
            CREATE ROLE nurburger_query NOLOGIN;
          END IF;
        END $$;
        """
    )
    op.execute("CREATE SCHEMA IF NOT EXISTS query")
    op.execute(
        """
        CREATE VIEW query.events WITH (security_barrier) AS
        SELECT uuid, event, distinct_id, properties, "timestamp"
        FROM public.events
        WHERE project_id = NULLIF(current_setting('nurburger.project_id', true), '')::uuid
        """
    )
    op.execute("REVOKE ALL ON SCHEMA public FROM nurburger_query")
    op.execute("GRANT USAGE ON SCHEMA query TO nurburger_query")
    op.execute("GRANT SELECT ON query.events TO nurburger_query")


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS query.events")
    op.execute("DROP SCHEMA IF EXISTS query")
    for table in (
        "dashboard_tiles",
        "dashboards",
        "insights",
        "feature_flags",
        "event_definitions",
        "events",
        "secret_keys",
        "projects",
        "invites",
        "memberships",
        "organizations",
        "sessions",
        "users",
    ):
        op.drop_table(table)
    op.execute("DROP TYPE IF EXISTS org_role")
