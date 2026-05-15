import pytest

from app.config import Settings, validate_runtime_settings


def test_production_runtime_rejects_default_auth_secret() -> None:
    settings = Settings(
        environment="production",
        auth_secret_key="fitmate-local-dev-secret",
        admin_secret="strong-admin-secret-value-with-enough-length-123",
    )

    with pytest.raises(RuntimeError, match="AUTH_SECRET_KEY"):
        validate_runtime_settings(settings)


def test_production_runtime_rejects_default_admin_secret() -> None:
    settings = Settings(
        environment="production",
        auth_secret_key="strong-auth-secret-value-with-enough-length-123",
        admin_secret="fitmate-local-admin-secret",
    )

    with pytest.raises(RuntimeError, match="ADMIN_SECRET"):
        validate_runtime_settings(settings)


def test_local_runtime_allows_default_local_secrets() -> None:
    validate_runtime_settings(Settings(environment="local"))
