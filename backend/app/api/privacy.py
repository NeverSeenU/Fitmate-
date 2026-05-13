from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.api.deps import CurrentUser, get_privacy_service
from app.services.privacy_service import PrivacyService


router = APIRouter(tags=["privacy"])


@router.get("/privacy/export")
def export_privacy_data(
    user: CurrentUser,
    service: Annotated[PrivacyService, Depends(get_privacy_service)],
) -> dict:
    return service.create_export_job(user_id=user["id"])


@router.delete("/me/photos", status_code=status.HTTP_202_ACCEPTED)
def delete_food_photos(
    user: CurrentUser,
    service: Annotated[PrivacyService, Depends(get_privacy_service)],
) -> dict:
    return service.schedule_photo_deletion(user_id=user["id"])


@router.delete("/me", status_code=status.HTTP_202_ACCEPTED)
def delete_account(
    user: CurrentUser,
    service: Annotated[PrivacyService, Depends(get_privacy_service)],
) -> dict:
    return service.schedule_account_deletion(user_id=user["id"])
