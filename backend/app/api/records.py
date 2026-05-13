from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, status
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
