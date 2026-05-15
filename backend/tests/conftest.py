from collections.abc import Generator
import os

import pytest
from sqlalchemy import text

os.environ.setdefault("FITMATE_ENV", "local")

from app.config import assert_safe_test_database_cleanup
from app.db.session import SessionLocal
from app.db.session import settings as db_settings


@pytest.fixture(autouse=True)
def clean_database() -> Generator[None, None, None]:
    assert_safe_test_database_cleanup(db_settings)
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
