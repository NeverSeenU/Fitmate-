from collections.abc import Generator

import pytest
from sqlalchemy import text

from app.db.session import SessionLocal


@pytest.fixture(autouse=True)
def clean_database() -> Generator[None, None, None]:
    with SessionLocal() as session:
        session.execute(
            text(
                """
                TRUNCATE TABLE
                    ai_model_calls,
                    chat_messages,
                    chat_threads,
                    checkins,
                    food_logs,
                    memory_items,
                    notification_preferences,
                    safety_events,
                    subscriptions,
                    usage_counters,
                    user_profiles,
                    users,
                    workout_logs
                RESTART IDENTITY CASCADE
                """
            )
        )
        session.commit()
    yield
