"""Add workout usage counter."""

from alembic import op
import sqlalchemy as sa


revision = "0002_add_workout_usage_count"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "usage_counters",
        sa.Column("workout_analysis_count", sa.Integer(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("usage_counters", "workout_analysis_count")
