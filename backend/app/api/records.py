from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field

from app.api.deps import CurrentUser, get_records_service
from app.services.records_service import RecordsService


router = APIRouter(tags=["records"])
RecordsServiceDependency = Annotated[RecordsService, Depends(get_records_service)]


class CheckinRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    weight_kg: Decimal | None = Field(default=None, ge=25, le=350)
    hunger_level: int | None = Field(default=None, ge=1, le=10)
    mood_level: int | None = Field(default=None, ge=1, le=10)
    craving_level: int | None = Field(default=None, ge=1, le=10)
    notes: str | None = Field(default=None, max_length=1000)


@router.get("/records/today")
def get_today_records(user: CurrentUser, service: RecordsServiceDependency, date: date | None = None) -> dict:
    return service.today(user_id=user["id"], target_date=date)


@router.post("/checkins", status_code=status.HTTP_201_CREATED)
def create_checkin(payload: CheckinRequest, user: CurrentUser, service: RecordsServiceDependency) -> dict:
    return service.create_checkin(
        user_id=user["id"],
        data=payload.model_dump(exclude_unset=True),
    )


@router.patch("/checkins/{checkin_id}")
def patch_checkin(
    checkin_id: str,
    payload: CheckinRequest,
    user: CurrentUser,
    service: RecordsServiceDependency,
) -> dict:
    result = service.patch_checkin(
        user_id=user["id"],
        checkin_id=checkin_id,
        data=payload.model_dump(exclude_unset=True),
    )
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="checkin_not_found")
    return result


@router.delete("/checkins/{checkin_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_checkin(checkin_id: str, user: CurrentUser, service: RecordsServiceDependency) -> Response:
    deleted = service.delete_checkin(user_id=user["id"], checkin_id=checkin_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="checkin_not_found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
