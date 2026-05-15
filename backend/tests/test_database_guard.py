import pytest

from app.config import Settings, assert_safe_test_database_cleanup


def test_database_cleanup_guard_rejects_production_environment() -> None:
    settings = Settings(
        environment="production",
        database_url="postgresql+psycopg://fitmate:fitmate@localhost:5432/fitmate",
    )

    with pytest.raises(RuntimeError, match="Unsafe test database cleanup"):
        assert_safe_test_database_cleanup(settings)


def test_database_cleanup_guard_rejects_remote_database() -> None:
    settings = Settings(
        environment="local",
        database_url="postgresql+psycopg://fitmate:fitmate@db.example.com:5432/fitmate",
    )

    with pytest.raises(RuntimeError, match="Unsafe test database cleanup"):
        assert_safe_test_database_cleanup(settings)


def test_database_cleanup_guard_allows_known_local_test_database() -> None:
    settings = Settings(
        environment="local",
        database_url="postgresql+psycopg://fitmate:fitmate@localhost:5432/fitmate",
    )

    assert_safe_test_database_cleanup(settings)
