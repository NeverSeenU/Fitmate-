from dataclasses import dataclass
import os
from urllib.parse import urlparse


@dataclass(frozen=True)
class Settings:
    app_name: str = "FitMate AI API"
    environment: str = "development"
    api_version: str = "v1"
    database_url: str = "postgresql+psycopg://fitmate:fitmate@localhost:5432/fitmate"
    redis_url: str = "redis://localhost:6379/0"
    object_storage_driver: str = "memory"
    object_storage_bucket: str = "fitmate-food-photos"
    object_storage_endpoint: str = ""
    object_storage_region: str = "us-east-1"
    object_storage_access_key_id: str = ""
    object_storage_secret_access_key: str = ""
    object_storage_key_prefix: str = "food-photos"
    xiaomi_model_name: str = "mimo-v2-omni"
    qwen_model_name: str = "qwen3-vl-plus"
    file_ai_extraction_enabled: bool = False
    workout_ai_analysis_enabled: bool = False
    text_food_ai_analysis_enabled: bool = False
    auth_secret_key: str = "fitmate-local-dev-secret"
    admin_secret: str = "fitmate-local-admin-secret"
    access_token_minutes: int = 60 * 24 * 7


def get_settings() -> Settings:
    return Settings(
        app_name=os.getenv("FITMATE_APP_NAME", Settings.app_name),
        environment=os.getenv("FITMATE_ENV", Settings.environment),
        api_version=os.getenv("FITMATE_API_VERSION", Settings.api_version),
        database_url=os.getenv("DATABASE_URL", Settings.database_url),
        redis_url=os.getenv("REDIS_URL", Settings.redis_url),
        object_storage_driver=os.getenv("OBJECT_STORAGE_DRIVER", Settings.object_storage_driver),
        object_storage_bucket=os.getenv(
            "OBJECT_STORAGE_BUCKET",
            Settings.object_storage_bucket,
        ),
        object_storage_endpoint=os.getenv("OBJECT_STORAGE_ENDPOINT", Settings.object_storage_endpoint),
        object_storage_region=os.getenv("OBJECT_STORAGE_REGION", Settings.object_storage_region),
        object_storage_access_key_id=os.getenv(
            "OBJECT_STORAGE_ACCESS_KEY_ID",
            Settings.object_storage_access_key_id,
        ),
        object_storage_secret_access_key=os.getenv(
            "OBJECT_STORAGE_SECRET_ACCESS_KEY",
            Settings.object_storage_secret_access_key,
        ),
        object_storage_key_prefix=os.getenv("OBJECT_STORAGE_KEY_PREFIX", Settings.object_storage_key_prefix),
        xiaomi_model_name=os.getenv("XIAOMI_MODEL_NAME", Settings.xiaomi_model_name),
        qwen_model_name=os.getenv("QWEN_MODEL_NAME", Settings.qwen_model_name),
        file_ai_extraction_enabled=os.getenv("FILE_AI_EXTRACTION_ENABLED", "false").lower() == "true",
        workout_ai_analysis_enabled=os.getenv("WORKOUT_AI_ANALYSIS_ENABLED", "false").lower() == "true",
        text_food_ai_analysis_enabled=os.getenv("TEXT_FOOD_AI_ANALYSIS_ENABLED", "false").lower() == "true",
        auth_secret_key=os.getenv("AUTH_SECRET_KEY", Settings.auth_secret_key),
        admin_secret=os.getenv("ADMIN_SECRET", Settings.admin_secret),
        access_token_minutes=int(
            os.getenv("ACCESS_TOKEN_MINUTES", str(Settings.access_token_minutes))
        ),
    )


def validate_runtime_settings(settings: Settings) -> None:
    if settings.environment.lower() != "production":
        return

    if _is_weak_secret(settings.auth_secret_key, Settings.auth_secret_key):
        raise RuntimeError("AUTH_SECRET_KEY must be set to a strong production secret.")
    if _is_weak_secret(settings.admin_secret, Settings.admin_secret):
        raise RuntimeError("ADMIN_SECRET must be set to a strong production secret.")
    if settings.object_storage_driver.lower() != "s3":
        raise RuntimeError("OBJECT_STORAGE_DRIVER must be set to s3 in production.")
    if not settings.object_storage_bucket:
        raise RuntimeError("OBJECT_STORAGE_BUCKET must be set in production.")


def is_local_runtime(settings: Settings) -> bool:
    return settings.environment.lower() in {"development", "local", "test"}


def assert_safe_test_database_cleanup(settings: Settings) -> None:
    parsed = urlparse(settings.database_url)
    environment = settings.environment.lower()
    database_name = parsed.path.lstrip("/")
    hostname = (parsed.hostname or "").lower()
    username = parsed.username or ""
    safe_environments = {"local", "test"}
    safe_hosts = {"", "localhost", "127.0.0.1", "::1"}
    safe_database_names = {"fitmate", "fitmate_local", "fitmate_test"}

    if (
        environment not in safe_environments
        or hostname not in safe_hosts
        or username != "fitmate"
        or database_name not in safe_database_names
    ):
        raise RuntimeError(
            "Unsafe test database cleanup refused: set FITMATE_ENV=local or test, "
            "use a localhost database, and target an approved FitMate local database."
        )


def _is_weak_secret(value: str, local_default: str) -> bool:
    return value == local_default or len(value) < 32
