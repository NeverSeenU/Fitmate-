from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel

from app.api.deps import CurrentUser, get_subscription_service
from app.services.subscription_service import SubscriptionService


router = APIRouter(tags=["subscription"])
SubscriptionServiceDependency = Annotated[SubscriptionService, Depends(get_subscription_service)]


class RestoreRequest(BaseModel):
    provider: str
    product_id: str
    receipt: str


@router.get("/subscription")
def get_subscription(user: CurrentUser, service: SubscriptionServiceDependency) -> dict:
    return service.get_current(user["id"])


@router.post("/subscription/checkout")
def create_checkout(user: CurrentUser, service: SubscriptionServiceDependency) -> dict:
    return service.checkout_metadata()


@router.post("/subscription/restore")
def restore_subscription(
    payload: RestoreRequest,
    user: CurrentUser,
    service: SubscriptionServiceDependency,
) -> dict:
    result = service.restore_app_store_purchase(
        user_id=user["id"],
        provider=payload.provider,
        product_id=payload.product_id,
        receipt=payload.receipt,
    )
    if "error" in result:
        if result["error"] == "subscription_provider_not_configured":
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=result["error"])
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=result["error"])
    return result


@router.post("/webhooks/app-store")
def app_store_webhook(
    signed_payload: dict,
    x_apple_signature: Annotated[str | None, Header()] = None,
) -> dict:
    if not x_apple_signature:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid_app_store_signature",
        )
    return {"accepted": True}
