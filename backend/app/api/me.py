from datetime import date
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from app.api.deps import CurrentUser, get_profile_service
from app.services.profile_service import ProfileService


router = APIRouter(tags=["me"])
ProfileServiceDependency = Annotated[ProfileService, Depends(get_profile_service)]


class ProfilePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    height_cm: Decimal | None = Field(default=None, ge=80, le=250)
    current_weight_kg: Decimal | None = Field(default=None, ge=25, le=350)
    age: int | None = Field(default=None, ge=13, le=120)
    sex: str | None = None
    goal_label: str | None = None
    goal_weight_kg: Decimal | None = Field(default=None, ge=25, le=350)
    goal_date: date | None = None
    food_preferences: dict[str, Any] | None = None
    training_baseline: dict[str, Any] | None = None
    risk_flags: dict[str, Any] | None = None


class MeResponse(BaseModel):
    user: dict
    profile: dict | None
    subscription: dict


@router.get("/me", response_model=MeResponse)
def get_me(user: CurrentUser, service: ProfileServiceDependency) -> dict:
    return service.get_me(user)


@router.patch("/me/profile")
def patch_profile(payload: ProfilePayload, user: CurrentUser, service: ProfileServiceDependency) -> dict:
    return service.patch_profile(
        user_id=user["id"],
        data=payload.model_dump(exclude_unset=True),
    )


@router.post("/me/onboarding")
def save_onboarding(payload: ProfilePayload, user: CurrentUser, service: ProfileServiceDependency) -> dict:
    return service.save_onboarding(
        user_id=user["id"],
        data=payload.model_dump(exclude_unset=True),
    )
