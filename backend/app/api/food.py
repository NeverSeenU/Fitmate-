from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, ConfigDict

from app.ai.router import FoodVisionRouter
from app.api.deps import CurrentUser, DbSession, get_food_service
from app.repositories.sqlalchemy.model_calls import SqlAlchemyModelCallRepository
from app.services.food_service import FoodService


router = APIRouter(tags=["food"])
FoodServiceDependency = Annotated[FoodService, Depends(get_food_service)]


def get_food_vision_router(db: DbSession) -> FoodVisionRouter:
    return FoodVisionRouter(model_call_repository=SqlAlchemyModelCallRepository(db))


class PatchFoodLogRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    meal_name: str | None = None
    calories_range_kcal: list[int | float] | None = None
    protein_g_range: list[int | float] | None = None
    carbs_g_range: list[int | float] | None = None
    fat_g_range: list[int | float] | None = None
    user_portion_note: str | None = None


@router.post("/chat/photo")
async def analyze_chat_photo(
    user: CurrentUser,
    service: FoodServiceDependency,
    thread_id: str = Form(...),
    image: UploadFile = File(...),
    user_note: str | None = Form(default=None),
    vision_router: FoodVisionRouter = Depends(get_food_vision_router),
) -> dict:
    image_bytes = await image.read()
    result = service.analyze_photo(
        user_id=user["id"],
        thread_id=thread_id,
        image_bytes=image_bytes,
        image_filename=image.filename or "food-photo.jpg",
        user_note=user_note,
        vision_router=vision_router,
    )
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="thread_not_found")
    return result


@router.get("/food/logs")
def list_food_logs(user: CurrentUser, service: FoodServiceDependency, date: date | None = None) -> dict:
    return service.list_logs(user_id=user["id"], target_date=date)


@router.post("/food/logs/{food_log_id}/confirm")
def confirm_food_log(food_log_id: str, user: CurrentUser, service: FoodServiceDependency) -> dict:
    result = service.confirm(user_id=user["id"], food_log_id=food_log_id)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="food_log_not_found")
    return result


@router.patch("/food/logs/{food_log_id}")
def patch_food_log(
    food_log_id: str,
    payload: PatchFoodLogRequest,
    user: CurrentUser,
    service: FoodServiceDependency,
) -> dict:
    result = service.patch(
        user_id=user["id"],
        food_log_id=food_log_id,
        data=payload.model_dump(exclude_unset=True),
    )
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="food_log_not_found")
    return result


@router.post("/food/logs/{food_log_id}/discard")
def discard_food_log(food_log_id: str, user: CurrentUser, service: FoodServiceDependency) -> dict:
    result = service.discard(user_id=user["id"], food_log_id=food_log_id)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="food_log_not_found")
    return result
