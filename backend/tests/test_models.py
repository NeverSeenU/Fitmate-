from app.db.models import Base


def test_initial_schema_contains_required_tables() -> None:
    expected_tables = {
        "users",
        "user_profiles",
        "subscriptions",
        "usage_counters",
        "chat_threads",
        "chat_messages",
        "food_logs",
        "workout_logs",
        "checkins",
        "memory_items",
        "safety_events",
        "notification_preferences",
        "ai_model_calls",
    }

    assert expected_tables.issubset(set(Base.metadata.tables))


def test_food_log_keeps_estimates_as_ranges() -> None:
    food_logs = Base.metadata.tables["food_logs"]

    for column_name in [
        "calories_min",
        "calories_max",
        "protein_min",
        "protein_max",
        "carbs_min",
        "carbs_max",
        "fat_min",
        "fat_max",
    ]:
        assert column_name in food_logs.c


def test_usage_counters_are_backend_only_cost_control() -> None:
    usage_counters = Base.metadata.tables["usage_counters"]

    assert "estimated_cost_cents" in usage_counters.c
    assert any(
        constraint.name == "uq_usage_counters_user_date"
        for constraint in usage_counters.constraints
    )
