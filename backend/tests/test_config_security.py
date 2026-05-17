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


def test_production_runtime_requires_s3_object_storage() -> None:
    settings = Settings(
        environment="production",
        auth_secret_key="strong-auth-secret-value-with-enough-length-123",
        admin_secret="strong-admin-secret-value-with-enough-length-123",
        object_storage_driver="memory",
    )

    with pytest.raises(RuntimeError, match="OBJECT_STORAGE_DRIVER"):
        validate_runtime_settings(settings)


def test_production_runtime_accepts_s3_object_storage() -> None:
    validate_runtime_settings(Settings(
        environment="production",
        auth_secret_key="strong-auth-secret-value-with-enough-length-123",
        admin_secret="strong-admin-secret-value-with-enough-length-123",
        object_storage_driver="s3",
        object_storage_bucket="fitmate-prod",
    ))


def test_local_runtime_allows_default_local_secrets() -> None:
    validate_runtime_settings(Settings(environment="local"))
