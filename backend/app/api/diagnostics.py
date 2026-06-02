import os
from typing import Any

from fastapi import APIRouter, Header, HTTPException, status

from app.config import get_settings, is_local_runtime


router = APIRouter(prefix="/diagnostics", tags=["diagnostics"])


@router.get("/smoke")
def smoke_gate(x_fitmate_admin_secret: str | None = Header(default=None)) -> dict[str, Any]:
    settings = get_settings()
    if not is_local_runtime(settings) and x_fitmate_admin_secret != settings.admin_secret:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="admin_auth_required")

    xiaomi_configured = bool(os.getenv("XIAOMI_API_KEY"))
    qwen_configured = bool(os.getenv("DASHSCOPE_API_KEY") or os.getenv("QWEN_API_KEY"))
    provider_order = _food_vision_provider_order(
        configured_provider=settings.food_vision_provider,
        xiaomi_configured=xiaomi_configured,
        qwen_configured=qwen_configured,
    )
    chat_ready = settings.chat_ai_reply_enabled and (xiaomi_configured or qwen_configured)
    vision_ready = bool(provider_order)

    return {
        "status": "ok",
        "service": "fitmate-backend",
        "environment": settings.environment,
        "local_runtime": is_local_runtime(settings),
        "features": {
            "chat_ai_reply_enabled": settings.chat_ai_reply_enabled,
            "text_food_ai_analysis_enabled": settings.text_food_ai_analysis_enabled,
            "file_ai_extraction_enabled": settings.file_ai_extraction_enabled,
            "workout_ai_analysis_enabled": settings.workout_ai_analysis_enabled,
            "food_vision_provider": settings.food_vision_provider,
        },
        "providers": {
            "xiaomi": {
                "configured": xiaomi_configured,
                "model": settings.xiaomi_model_name,
            },
            "qwen": {
                "configured": qwen_configured,
                "model": settings.qwen_model_name,
            },
        },
        "readiness": {
            "backend_reachable": True,
            "chat_ai_ready": chat_ready,
            "food_vision_ready": vision_ready,
            "file_ai_ready": settings.file_ai_extraction_enabled and (xiaomi_configured or qwen_configured),
            "workout_ai_ready": settings.workout_ai_analysis_enabled and (xiaomi_configured or qwen_configured),
            "text_food_ai_ready": settings.text_food_ai_analysis_enabled and (xiaomi_configured or qwen_configured),
        },
        "routing": {
            "food_vision_provider_order": provider_order,
            "chat_reply_provider_order": _chat_provider_order(xiaomi_configured, qwen_configured),
        },
    }


def _food_vision_provider_order(
    configured_provider: str,
    xiaomi_configured: bool,
    qwen_configured: bool,
) -> list[str]:
    if configured_provider == "xiaomi":
        return ["xiaomi"] if xiaomi_configured else []
    if configured_provider == "qwen":
        return ["qwen"] if qwen_configured else []
    order = []
    if xiaomi_configured:
        order.append("xiaomi")
    if qwen_configured:
        order.append("qwen")
    return order


def _chat_provider_order(xiaomi_configured: bool, qwen_configured: bool) -> list[str]:
    order = []
    if xiaomi_configured:
        order.append("xiaomi")
    if qwen_configured:
        order.append("qwen")
    return order
