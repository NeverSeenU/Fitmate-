from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field
from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, get_safety_service
from app.services.safety_service import SafetyService


router = APIRouter(prefix="/safety", tags=["safety"])
SafetyServiceDependency = Annotated[SafetyService, Depends(get_safety_service)]


class ClassifySafetyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=4000)
    source_message_id: str | None = None


@router.get("/disclaimer")
def get_safety_disclaimer() -> dict:
    return SafetyService().disclaimer()


@router.post("/classify")
def classify_safety(payload: ClassifySafetyRequest, user: CurrentUser, service: SafetyServiceDependency) -> dict:
    return service.classify(
        user_id=user["id"],
        text=payload.text,
        source_message_id=payload.source_message_id,
    )
