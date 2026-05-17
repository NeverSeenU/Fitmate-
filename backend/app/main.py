from fastapi import FastAPI

from app.api.admin import router as admin_router
from app.api.auth import router as auth_router
from app.api.chat import router as chat_router
from app.api.food import router as food_router
from app.api.files import router as files_router
from app.api.me import router as me_router
from app.api.privacy import router as privacy_router
from app.api.records import router as records_router
from app.api.safety import router as safety_router
from app.api.subscription import router as subscription_router
from app.api.workouts import router as workouts_router
from app.config import get_settings, validate_runtime_settings


settings = get_settings()
validate_runtime_settings(settings)

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
)
app.include_router(auth_router, prefix="/v1")
app.include_router(admin_router, prefix="/v1")
app.include_router(chat_router, prefix="/v1")
app.include_router(files_router, prefix="/v1")
app.include_router(food_router, prefix="/v1")
app.include_router(me_router, prefix="/v1")
app.include_router(privacy_router, prefix="/v1")
app.include_router(records_router, prefix="/v1")
app.include_router(safety_router, prefix="/v1")
app.include_router(subscription_router, prefix="/v1")
app.include_router(workouts_router, prefix="/v1")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "fitmate-backend",
        "environment": settings.environment,
    }


@app.get("/v1/healthz")
def versioned_healthz() -> dict[str, str]:
    return healthz()
