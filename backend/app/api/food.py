from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from pydantic import BaseModel, ConfigDict

from app.ai.router import FoodVisionRouter, FoodVisionUnavailableError
from app.api.deps import CurrentUser, DbSession, get_food_service
from app.repositories.sqlalchemy.model_calls import SqlAlchemyModelCallRepository
from app.services.image_conversion import (
    ImageConversionError,
    ImageConversionUnavailableError,
    is_heic_image_bytes,
    jpeg_filename,
    normalize_for_ai_provider,
    should_normalize_image_bytes,
)
from app.services.food_service import FoodService
from app.services.usage_service import UsageLimitExceededError


router = APIRouter(tags=["food"])
FoodServiceDependency = Annotated[FoodService, Depends(get_food_service)]
MAX_PHOTO_UPLOAD_BYTES = 8 * 1024 * 1024
SUPPORTED_PHOTO_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
HEIC_CONTENT_TYPES = {"image/heic", "image/heif"}


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


class CreateFoodLogRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    meal_name: str
    calories_range_kcal: list[int | float] = [0, 0]
    protein_g_range: list[int | float] = [0, 0]
    carbs_g_range: list[int | float] = [0, 0]
    fat_g_range: list[int | float] = [0, 0]
    confidence: float = 1.0
    status: str = "confirmed"
    user_portion_note: str | None = None
    model_provider: str | None = None
    model_name: str | None = None


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
    if len(image_bytes) > MAX_PHOTO_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail={
                "code": "image_too_large",
                "message": "Food photo uploads must be 8 MB or smaller.",
            },
        )

    image_content_type = image.content_type or "application/octet-stream"
    image_filename = image.filename or "food-photo.jpg"
    should_store_as_jpeg = image_content_type in HEIC_CONTENT_TYPES or should_normalize_image_bytes(image_bytes)
    if should_store_as_jpeg:
        try:
            image_bytes = normalize_for_ai_provider(image_bytes)
        except ImageConversionUnavailableError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "code": "image_conversion_unavailable",
                    "message": "Photo conversion is temporarily unavailable. Please try again later.",
                },
            ) from exc
        except ImageConversionError as exc:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail={
                    "code": "image_conversion_failed",
                    "message": "This photo could not be decoded. Please try uploading the original image again.",
                },
            ) from exc
        image_content_type = "image/jpeg"
        image_filename = jpeg_filename(image_filename)

    if image_content_type not in SUPPORTED_PHOTO_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={
                "code": "unsupported_image_type",
                "message": "Food photo uploads must be JPEG, PNG, WebP, HEIC, or HEIF images.",
            },
        )
    try:
        result = service.analyze_photo(
            user_id=user["id"],
            thread_id=thread_id,
            image_bytes=image_bytes,
            image_filename=image_filename,
            image_content_type=image_content_type,
            user_note=user_note,
            vision_router=vision_router,
        )
    except FoodVisionUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "vision_unavailable",
                "message": "Food photo analysis is not available yet. Configure Xiaomi/Qwen provider keys or try again later.",
            },
        ) from exc
    except UsageLimitExceededError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "fair_use_limit_reached",
                "purpose": exc.purpose,
                "message": "Daily fair-use limit reached for your current plan.",
            },
        ) from exc
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="thread_not_found")
    return result


@router.post("/chat/photos")
async def analyze_chat_photos(
    user: CurrentUser,
    service: FoodServiceDependency,
    thread_id: str = Form(...),
    images: list[UploadFile] = File(...),
    user_note: str | None = Form(default=None),
    vision_router: FoodVisionRouter = Depends(get_food_vision_router),
) -> dict:
    if not images:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "no_images", "message": "At least one food photo is required."},
        )
    if len(images) > 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "too_many_images", "message": "Upload up to 5 food photos at a time."},
        )
    normalized_images = []
    for image in images:
        normalized_images.append(await _read_normalized_photo_upload(image))
    try:
        result = service.analyze_photos(
            user_id=user["id"],
            thread_id=thread_id,
            photos=normalized_images,
            user_note=user_note,
            vision_router=vision_router,
        )
    except FoodVisionUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "vision_unavailable",
                "message": "Food photo analysis is not available yet. Configure Xiaomi/Qwen provider keys or try again later.",
            },
        ) from exc
    except UsageLimitExceededError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "fair_use_limit_reached",
                "purpose": exc.purpose,
                "message": "Daily fair-use limit reached for your current plan.",
            },
        ) from exc
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="thread_not_found")
    return result


async def _read_normalized_photo_upload(image: UploadFile) -> dict:
    image_bytes = await image.read()
    if len(image_bytes) > MAX_PHOTO_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail={
                "code": "image_too_large",
                "message": "Food photo uploads must be 8 MB or smaller.",
            },
        )

    image_content_type = image.content_type or "application/octet-stream"
    image_filename = image.filename or "food-photo.jpg"
    should_store_as_jpeg = image_content_type in HEIC_CONTENT_TYPES or should_normalize_image_bytes(image_bytes)
    if should_store_as_jpeg:
        try:
            image_bytes = normalize_for_ai_provider(image_bytes)
        except ImageConversionUnavailableError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "code": "image_conversion_unavailable",
                    "message": "Photo conversion is temporarily unavailable. Please try again later.",
                },
            ) from exc
        except ImageConversionError as exc:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail={
                    "code": "image_conversion_failed",
                    "message": "This photo could not be decoded. Please try uploading the original image again.",
                },
            ) from exc
        image_content_type = "image/jpeg"
        image_filename = jpeg_filename(image_filename)

    if image_content_type not in SUPPORTED_PHOTO_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={
                "code": "unsupported_image_type",
                "message": "Food photo uploads must be JPEG, PNG, WebP, HEIC, or HEIF images.",
            },
        )
    return {
        "image_bytes": image_bytes,
        "image_filename": image_filename,
        "image_content_type": image_content_type,
    }


@router.get("/food/logs")
def list_food_logs(user: CurrentUser, service: FoodServiceDependency, date: date | None = None) -> dict:
    return service.list_logs(user_id=user["id"], target_date=date)


@router.post("/food/logs", status_code=status.HTTP_201_CREATED)
def create_food_log(payload: CreateFoodLogRequest, user: CurrentUser, service: FoodServiceDependency) -> dict:
    return service.create_log(
        user_id=user["id"],
        data=payload.model_dump(),
    )


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


@router.delete("/food/logs/{food_log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_food_log(food_log_id: str, user: CurrentUser, service: FoodServiceDependency) -> Response:
    deleted = service.delete(user_id=user["id"], food_log_id=food_log_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="food_log_not_found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
