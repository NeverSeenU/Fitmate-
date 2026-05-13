"""initial schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-05-07
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.Text(), unique=True),
        sa.Column("phone", sa.Text(), unique=True),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
    )
    op.create_table(
        "user_profiles",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("display_name", sa.Text()),
        sa.Column("sex", sa.String(length=32)),
        sa.Column("age", sa.Integer()),
        sa.Column("height_cm", sa.Numeric(5, 2)),
        sa.Column("current_weight_kg", sa.Numeric(5, 2)),
        sa.Column("goal_label", sa.Text()),
        sa.Column("goal_weight_kg", sa.Numeric(5, 2)),
        sa.Column("goal_date", sa.Date()),
        sa.Column("food_preferences_json", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("training_baseline_json", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("risk_flags_json", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("plan", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("provider_customer_id", sa.Text()),
        sa.Column("provider_subscription_id", sa.Text()),
        sa.Column("current_period_start", sa.DateTime(timezone=True)),
        sa.Column("current_period_end", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "usage_counters",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("ai_text_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("food_photo_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("fallback_model_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("deep_review_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("estimated_cost_cents", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "date", name="uq_usage_counters_user_date"),
    )
    op.create_table(
        "chat_threads",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True)),
    )
    op.create_table(
        "chat_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("thread_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("chat_threads.id"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("message_type", sa.String(length=32), nullable=False),
        sa.Column("content_text", sa.Text()),
        sa.Column("image_object_key", sa.Text()),
        sa.Column("structured_json", postgresql.JSONB()),
        sa.Column("model_provider", sa.String(length=32)),
        sa.Column("model_name", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "food_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("source_message_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("chat_messages.id")),
        sa.Column("image_object_key", sa.Text()),
        sa.Column("meal_name", sa.Text(), nullable=False),
        sa.Column("calories_min", sa.Integer()),
        sa.Column("calories_max", sa.Integer()),
        sa.Column("protein_min", sa.Numeric(6, 2)),
        sa.Column("protein_max", sa.Numeric(6, 2)),
        sa.Column("carbs_min", sa.Numeric(6, 2)),
        sa.Column("carbs_max", sa.Numeric(6, 2)),
        sa.Column("fat_min", sa.Numeric(6, 2)),
        sa.Column("fat_max", sa.Numeric(6, 2)),
        sa.Column("confidence", sa.Numeric(3, 2)),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("needs_follow_up", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("follow_up_question", sa.Text()),
        sa.Column("user_portion_note", sa.Text()),
        sa.Column("model_provider", sa.String(length=32)),
        sa.Column("model_name", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "workout_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("source_message_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("chat_messages.id")),
        sa.Column("workout_type", sa.Text(), nullable=False),
        sa.Column("duration_minutes", sa.Integer()),
        sa.Column("intensity", sa.String(length=32)),
        sa.Column("calories_burned_min", sa.Integer()),
        sa.Column("calories_burned_max", sa.Integer()),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "checkins",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("weight_kg", sa.Numeric(5, 2)),
        sa.Column("hunger_level", sa.Integer()),
        sa.Column("mood_level", sa.Integer()),
        sa.Column("craving_level", sa.Integer()),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "memory_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("retention_until", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "safety_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("source_message_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("chat_messages.id")),
        sa.Column("risk_type", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=32), nullable=False),
        sa.Column("action_taken", sa.Text(), nullable=False),
        sa.Column("metadata_json", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "notification_preferences",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("morning_weight_enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("meal_logging_enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("evening_summary_enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("craving_reminder_enabled", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("quiet_hours_start", sa.Time()),
        sa.Column("quiet_hours_end", sa.Time()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "ai_model_calls",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("model_name", sa.Text(), nullable=False),
        sa.Column("purpose", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("latency_ms", sa.Integer()),
        sa.Column("input_tokens", sa.Integer()),
        sa.Column("output_tokens", sa.Integer()),
        sa.Column("estimated_cost_cents", sa.Integer()),
        sa.Column("error_code", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("ai_model_calls")
    op.drop_table("notification_preferences")
    op.drop_table("safety_events")
    op.drop_table("memory_items")
    op.drop_table("checkins")
    op.drop_table("workout_logs")
    op.drop_table("food_logs")
    op.drop_table("chat_messages")
    op.drop_table("chat_threads")
    op.drop_table("usage_counters")
    op.drop_table("subscriptions")
    op.drop_table("user_profiles")
    op.drop_table("users")
