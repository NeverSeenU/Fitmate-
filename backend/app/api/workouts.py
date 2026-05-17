from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from app.api.deps import CurrentUser, get_workout_service
from app.services.usage_service import UsageLimitExceededError
from app.services.workout_service import WorkoutService


router = APIRouter(prefix="/workouts", tags=["workouts"])
WorkoutServiceDependency = Annotated[WorkoutService, Depends(get_workout_service)]


class AnalyzeWorkoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=2000)


class PatchWorkoutLogRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workout_type: str | None = None
    duration_minutes: int | None = Field(default=None, ge=1, le=600)
    intensity: str | None = None
    calories_burned_range_kcal: list[int] | None = None


@router.post("/analyze")
def analyze_workout(payload: AnalyzeWorkoutRequest, user: CurrentUser, service: WorkoutServiceDependency) -> dict:
    try:
        return service.analyze_text(user_id=user["id"], text=payload.text)
    except UsageLimitExceededError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "fair_use_limit_reached",
                "purpose": exc.purpose,
                "message": "Daily fair-use limit reached for your current plan.",
            },
        ) from exc


@router.post("/logs/{workout_log_id}/confirm")
def confirm_workout_log(workout_log_id: str, user: CurrentUser, service: WorkoutServiceDependency) -> dict:
    result = service.confirm(user_id=user["id"], workout_log_id=workout_log_id)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="workout_log_not_found")
    return result


@router.patch("/logs/{workout_log_id}")
def patch_workout_log(
    workout_log_id: str,
    payload: PatchWorkoutLogRequest,
    user: CurrentUser,
    service: WorkoutServiceDependency,
) -> dict:
    result = service.patch(
        user_id=user["id"],
        workout_log_id=workout_log_id,
        data=payload.model_dump(exclude_unset=True),
    )
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="workout_log_not_found")
    return result
