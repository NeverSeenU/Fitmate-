from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    app_name: str = "FitMate AI API"
    environment: str = "development"
    api_version: str = "v1"
    database_url: str = "postgresql+psycopg://fitmate:fitmate@localhost:5432/fitmate"
    redis_url: str = "redis://localhost:6379/0"
    object_storage_bucket: str = "fitmate-food-photos"
    xiaomi_model_name: str = "mimo-v2-omni"
    qwen_model_name: str = "qwen3-vl-plus"
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
        object_storage_bucket=os.getenv(
            "OBJECT_STORAGE_BUCKET",
            Settings.object_storage_bucket,
        ),
        xiaomi_model_name=os.getenv("XIAOMI_MODEL_NAME", Settings.xiaomi_model_name),
        qwen_model_name=os.getenv("QWEN_MODEL_NAME", Settings.qwen_model_name),
        auth_secret_key=os.getenv("AUTH_SECRET_KEY", Settings.auth_secret_key),
        admin_secret=os.getenv("ADMIN_SECRET", Settings.admin_secret),
        access_token_minutes=int(
            os.getenv("ACCESS_TOKEN_MINUTES", str(Settings.access_token_minutes))
        ),
    )
