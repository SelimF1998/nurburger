"""demo project flag

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-28
"""

import sqlalchemy as sa

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "projects", sa.Column("is_demo", sa.Boolean, nullable=False, server_default=sa.false())
    )
    # At most one demo project.
    op.create_index(
        "uq_projects_single_demo",
        "projects",
        ["is_demo"],
        unique=True,
        postgresql_where=sa.text("is_demo"),
    )


def downgrade() -> None:
    op.drop_index("uq_projects_single_demo", table_name="projects")
    op.drop_column("projects", "is_demo")
